use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use tokio_postgres::Client;

use crate::connections::PostgresCredentials;

// ============================================================================
// Types
// ============================================================================

#[derive(Serialize, Deserialize, Debug)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TableSchema {
    pub name: String,
    pub columns: Vec<ColumnInfo>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<HashMap<String, JsonValue>>,
    pub row_count: usize,
    pub duration_ms: u128,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StorageInfo {
    pub size_mb: f64,
    pub table_count: usize,
}

// ============================================================================
// Helper: Connect with TLS support
// ============================================================================

async fn connect_postgres(creds: &PostgresCredentials) -> Result<Client, String> {
    let conn_str = format!(
        "host={} port={} dbname={} user={} password={}",
        creds.host, creds.port, creds.database, creds.user, creds.password
    );

    if creds.sslmode == "require" {
        // Use native-tls for SSL connections
        let mut builder = native_tls::TlsConnector::builder();
        // Accept invalid certs for development (Neon uses valid certs, but this helps with self-signed)
        builder.danger_accept_invalid_certs(true);
        let connector = builder.build().map_err(|e| format!("TLS connector error: {}", e))?;
        let connector = postgres_native_tls::MakeTlsConnector::new(connector);
        
        let (client, connection) = tokio_postgres::connect(&conn_str, connector)
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("Connection error: {}", e);
            }
        });

        Ok(client)
    } else {
        // No TLS
        let (client, connection) = tokio_postgres::connect(&conn_str, tokio_postgres::NoTls)
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("Connection error: {}", e);
            }
        });

        Ok(client)
    }
}

// ============================================================================
// Commands
// ============================================================================

#[tauri::command]
pub async fn test_postgres_connection(credentials: PostgresCredentials) -> Result<String, String> {
    let client = connect_postgres(&credentials).await?;

    client
        .execute("SELECT 1", &[])
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    Ok("Connection successful".to_string())
}

#[tauri::command]
pub async fn get_postgres_schema(credentials: PostgresCredentials) -> Result<Vec<TableSchema>, String> {
    let client = connect_postgres(&credentials).await?;

    let query = r#"
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
    "#;

    let rows = client
        .query(query, &[])
        .await
        .map_err(|e| format!("Schema query failed: {}", e))?;

    let mut schema_map: HashMap<String, Vec<ColumnInfo>> = HashMap::new();

    for row in rows {
        let table_name: String = row.get(0);
        let column_name: String = row.get(1);
        let data_type: String = row.get(2);

        schema_map
            .entry(table_name)
            .or_default()
            .push(ColumnInfo {
                name: column_name,
                data_type,
            });
    }

    let tables: Vec<TableSchema> = schema_map
        .into_iter()
        .map(|(name, columns)| TableSchema { name, columns })
        .collect();

    Ok(tables)
}

#[tauri::command]
pub async fn preview_postgres_table(
    credentials: PostgresCredentials,
    table_name: String,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    let client = connect_postgres(&credentials).await?;

    // Sanitize table name to prevent SQL injection (basic check)
    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Invalid table name".to_string());
    }

    let query = format!("SELECT * FROM \"{}\" LIMIT 50", table_name);

    let rows = client
        .query(&query, &[])
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let columns: Vec<String> = if let Some(first_row) = rows.first() {
        first_row
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect()
    } else {
        vec![]
    };

    let mut result_rows: Vec<HashMap<String, JsonValue>> = vec![];

    for row in &rows {
        let mut row_map: HashMap<String, JsonValue> = HashMap::new();
        for (i, col) in row.columns().iter().enumerate() {
            let value = row_to_json_value(&row, i);
            row_map.insert(col.name().to_string(), value);
        }
        result_rows.push(row_map);
    }

    let duration_ms = start.elapsed().as_millis();
    let row_count = result_rows.len();

    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        duration_ms,
    })
}

#[tauri::command]
pub async fn execute_postgres_query(
    credentials: PostgresCredentials,
    query: String,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    let client = connect_postgres(&credentials).await?;

    let rows = client
        .query(&query, &[])
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let columns: Vec<String> = if let Some(first_row) = rows.first() {
        first_row
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect()
    } else {
        vec![]
    };

    let mut result_rows: Vec<HashMap<String, JsonValue>> = vec![];

    for row in &rows {
        let mut row_map: HashMap<String, JsonValue> = HashMap::new();
        for (i, col) in row.columns().iter().enumerate() {
            let value = row_to_json_value(&row, i);
            row_map.insert(col.name().to_string(), value);
        }
        result_rows.push(row_map);
    }

    let duration_ms = start.elapsed().as_millis();
    let row_count = result_rows.len();

    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        duration_ms,
    })
}

#[tauri::command]
pub async fn get_postgres_storage_info(credentials: PostgresCredentials) -> Result<StorageInfo, String> {
    let client = connect_postgres(&credentials).await?;

    // Get database size
    let size_query = format!("SELECT pg_database_size('{}')", credentials.database);
    let size_row = client
        .query_one(&size_query, &[])
        .await
        .map_err(|e| format!("Size query failed: {}", e))?;
    
    let size_bytes: i64 = size_row.get(0);
    let size_mb = (size_bytes as f64) / (1024.0 * 1024.0);

    // Get table count
    let count_query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'";
    let count_row = client
        .query_one(count_query, &[])
        .await
        .map_err(|e| format!("Count query failed: {}", e))?;
    
    let table_count: i64 = count_row.get(0);

    Ok(StorageInfo {
        size_mb: (size_mb * 100.0).round() / 100.0,
        table_count: table_count as usize,
    })
}

// ============================================================================
// Helper: Convert postgres row value to JSON
// ============================================================================

fn row_to_json_value(row: &tokio_postgres::Row, idx: usize) -> JsonValue {
    use tokio_postgres::types::Type;
    
    let col = &row.columns()[idx];
    
    // Handle NULL first
    if let Ok(v) = row.try_get::<_, Option<String>>(idx) {
        if v.is_none() {
            return JsonValue::Null;
        }
    }

    match *col.type_() {
        Type::BOOL => row.get::<_, Option<bool>>(idx).map_or(JsonValue::Null, JsonValue::Bool),
        Type::INT2 => row.get::<_, Option<i16>>(idx).map_or(JsonValue::Null, |v| JsonValue::Number(v.into())),
        Type::INT4 => row.get::<_, Option<i32>>(idx).map_or(JsonValue::Null, |v| JsonValue::Number(v.into())),
        Type::INT8 => row.get::<_, Option<i64>>(idx).map_or(JsonValue::Null, |v| JsonValue::Number(v.into())),
        Type::FLOAT4 => row.get::<_, Option<f32>>(idx).map_or(JsonValue::Null, |v| {
            serde_json::Number::from_f64(v as f64).map_or(JsonValue::Null, JsonValue::Number)
        }),
        Type::FLOAT8 => row.get::<_, Option<f64>>(idx).map_or(JsonValue::Null, |v| {
            serde_json::Number::from_f64(v).map_or(JsonValue::Null, JsonValue::Number)
        }),
        Type::TEXT | Type::VARCHAR | Type::BPCHAR | Type::NAME => {
            row.get::<_, Option<String>>(idx).map_or(JsonValue::Null, JsonValue::String)
        }
        _ => {
            // Fallback: try to get as string
            row.get::<_, Option<String>>(idx)
                .map_or(JsonValue::String("<unsupported>".to_string()), JsonValue::String)
        }
    }
}
