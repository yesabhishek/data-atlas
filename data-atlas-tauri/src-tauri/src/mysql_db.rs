use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{mysql::MySqlPoolOptions, Column, MySqlPool, Row};
use std::collections::HashMap;

use crate::connections::MySqlCredentials;

// ============================================================================
// Types (reusing similar structure to Postgres)
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

// ============================================================================
// Helper: Connect to MySQL
// ============================================================================

async fn connect_mysql(creds: &MySqlCredentials) -> Result<MySqlPool, String> {
    let conn_str = format!(
        "mysql://{}:{}@{}:{}/{}",
        creds.user, creds.password, creds.host, creds.port, creds.database
    );

    MySqlPoolOptions::new()
        .max_connections(1)
        .connect(&conn_str)
        .await
        .map_err(|e| format!("MySQL connection failed: {}", e))
}

// ============================================================================
// Commands
// ============================================================================

#[tauri::command]
pub async fn test_mysql_connection(credentials: MySqlCredentials) -> Result<String, String> {
    let pool = connect_mysql(&credentials).await?;

    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    pool.close().await;
    Ok("Connection successful".to_string())
}

#[tauri::command]
pub async fn get_mysql_schema(credentials: MySqlCredentials) -> Result<Vec<TableSchema>, String> {
    let pool = connect_mysql(&credentials).await?;

    let query = r#"
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    "#;

    let rows = sqlx::query(query)
        .bind(&credentials.database)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Schema query failed: {}", e))?;

    let mut schema_map: HashMap<String, Vec<ColumnInfo>> = HashMap::new();

    for row in rows {
        let table_name: String = row.get("TABLE_NAME");
        let column_name: String = row.get("COLUMN_NAME");
        let data_type: String = row.get("DATA_TYPE");

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

    pool.close().await;
    Ok(tables)
}

#[tauri::command]
pub async fn preview_mysql_table(
    credentials: MySqlCredentials,
    table_name: String,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    let pool = connect_mysql(&credentials).await?;

    // Sanitize table name to prevent SQL injection
    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Invalid table name".to_string());
    }

    let query = format!("SELECT * FROM `{}` LIMIT 50", table_name);

    let rows = sqlx::query(&query)
        .fetch_all(&pool)
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
        for col in row.columns() {
            let value = mysql_row_to_json(&row, col.name());
            row_map.insert(col.name().to_string(), value);
        }
        result_rows.push(row_map);
    }

    let duration_ms = start.elapsed().as_millis();
    let row_count = result_rows.len();

    pool.close().await;
    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        duration_ms,
    })
}

#[tauri::command]
pub async fn execute_mysql_query(
    credentials: MySqlCredentials,
    query: String,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    let pool = connect_mysql(&credentials).await?;

    let rows = sqlx::query(&query)
        .fetch_all(&pool)
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
        for col in row.columns() {
            let value = mysql_row_to_json(&row, col.name());
            row_map.insert(col.name().to_string(), value);
        }
        result_rows.push(row_map);
    }

    let duration_ms = start.elapsed().as_millis();
    let row_count = result_rows.len();

    pool.close().await;
    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        duration_ms,
    })
}

// ============================================================================
// Helper: Convert MySQL row value to JSON
// ============================================================================

fn mysql_row_to_json(row: &sqlx::mysql::MySqlRow, col_name: &str) -> JsonValue {
    // Try different types and fallback to string representation
    if let Ok(v) = row.try_get::<Option<i64>, _>(col_name) {
        return v.map_or(JsonValue::Null, |n| JsonValue::Number(n.into()));
    }
    if let Ok(v) = row.try_get::<Option<i32>, _>(col_name) {
        return v.map_or(JsonValue::Null, |n| JsonValue::Number(n.into()));
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(col_name) {
        return v.map_or(JsonValue::Null, |n| {
            serde_json::Number::from_f64(n).map_or(JsonValue::Null, JsonValue::Number)
        });
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(col_name) {
        return v.map_or(JsonValue::Null, JsonValue::Bool);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(col_name) {
        return v.map_or(JsonValue::Null, JsonValue::String);
    }
    
    JsonValue::String("<unsupported>".to_string())
}
