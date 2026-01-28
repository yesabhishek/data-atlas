use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use tokio_rusqlite::Connection;

use crate::connections::SqliteCredentials;

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
// Helper: Connect to SQLite
// ============================================================================

async fn connect_sqlite(creds: &SqliteCredentials) -> Result<Connection, String> {
    let path = creds.file_path.clone();
    Connection::open(&path)
        .await
        .map_err(|e| format!("SQLite connection failed: {}", e))
}

// ============================================================================
// Commands
// ============================================================================

#[tauri::command]
pub async fn test_sqlite_connection(credentials: SqliteCredentials) -> Result<String, String> {
    let conn = connect_sqlite(&credentials).await?;

    conn.call(|conn| {
        conn.execute("SELECT 1", [])?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Query failed: {}", e))?;

    Ok("Connection successful".to_string())
}

#[tauri::command]
pub async fn get_sqlite_schema(credentials: SqliteCredentials) -> Result<Vec<TableSchema>, String> {
    let conn = connect_sqlite(&credentials).await?;

    let tables = conn
        .call(|conn| {
            let mut stmt = conn.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )?;

            let table_names: Vec<String> = stmt
                .query_map([], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();

            let mut schemas: Vec<TableSchema> = vec![];

            for table_name in table_names {
                let pragma_query = format!("PRAGMA table_info('{}')", table_name);
                let mut pragma_stmt = conn.prepare(&pragma_query)?;

                let columns: Vec<ColumnInfo> = pragma_stmt
                    .query_map([], |row| {
                        Ok(ColumnInfo {
                            name: row.get(1)?,
                            data_type: row.get(2)?,
                        })
                    })?
                    .filter_map(|r| r.ok())
                    .collect();

                schemas.push(TableSchema {
                    name: table_name,
                    columns,
                });
            }

            Ok(schemas)
        })
        .await
        .map_err(|e| format!("Schema query failed: {}", e))?;

    Ok(tables)
}

#[tauri::command]
pub async fn preview_sqlite_table(
    credentials: SqliteCredentials,
    table_name: String,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    let conn = connect_sqlite(&credentials).await?;

    // Sanitize table name to prevent SQL injection
    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Invalid table name".to_string());
    }

    let query = format!("SELECT * FROM \"{}\" LIMIT 50", table_name);

    let result = conn
        .call(move |conn| {
            let mut stmt = conn.prepare(&query)?;
            let column_count = stmt.column_count();
            let columns: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();

            let mut rows: Vec<HashMap<String, JsonValue>> = vec![];

            let mut query_rows = stmt.query([])?;
            while let Some(row) = query_rows.next()? {
                let mut row_map: HashMap<String, JsonValue> = HashMap::new();
                for i in 0..column_count {
                    let col_name = columns[i].clone();
                    let value = sqlite_value_to_json(row, i);
                    row_map.insert(col_name, value);
                }
                rows.push(row_map);
            }

            Ok((columns, rows))
        })
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let duration_ms = start.elapsed().as_millis();
    let row_count = result.1.len();

    Ok(QueryResult {
        columns: result.0,
        rows: result.1,
        row_count,
        duration_ms,
    })
}

#[tauri::command]
pub async fn execute_sqlite_query(
    credentials: SqliteCredentials,
    query: String,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    let conn = connect_sqlite(&credentials).await?;

    let result = conn
        .call(move |conn| {
            let mut stmt = conn.prepare(&query)?;
            let column_count = stmt.column_count();
            let columns: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();

            let mut rows: Vec<HashMap<String, JsonValue>> = vec![];

            let mut query_rows = stmt.query([])?;
            while let Some(row) = query_rows.next()? {
                let mut row_map: HashMap<String, JsonValue> = HashMap::new();
                for i in 0..column_count {
                    let col_name = columns[i].clone();
                    let value = sqlite_value_to_json(row, i);
                    row_map.insert(col_name, value);
                }
                rows.push(row_map);
            }

            Ok((columns, rows))
        })
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let duration_ms = start.elapsed().as_millis();
    let row_count = result.1.len();

    Ok(QueryResult {
        columns: result.0,
        rows: result.1,
        row_count,
        duration_ms,
    })
}

// ============================================================================
// Helper: Convert SQLite value to JSON
// ============================================================================

fn sqlite_value_to_json(row: &rusqlite::Row, idx: usize) -> JsonValue {
    use rusqlite::types::ValueRef;

    match row.get_ref(idx) {
        Ok(ValueRef::Null) => JsonValue::Null,
        Ok(ValueRef::Integer(i)) => JsonValue::Number(i.into()),
        Ok(ValueRef::Real(f)) => {
            serde_json::Number::from_f64(f).map_or(JsonValue::Null, JsonValue::Number)
        }
        Ok(ValueRef::Text(s)) => {
            JsonValue::String(String::from_utf8_lossy(s).to_string())
        }
        Ok(ValueRef::Blob(b)) => {
            JsonValue::String(format!("<blob {} bytes>", b.len()))
        }
        Err(_) => JsonValue::Null,
    }
}
