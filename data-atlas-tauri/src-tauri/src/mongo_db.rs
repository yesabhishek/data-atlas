use mongodb::{bson::doc, options::ClientOptions, Client};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;

use crate::connections::MongoDbCredentials;

// ============================================================================
// Types
// ============================================================================

#[derive(Serialize, Deserialize, Debug)]
pub struct CollectionInfo {
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<HashMap<String, JsonValue>>,
    pub row_count: usize,
    pub duration_ms: u128,
}

// ============================================================================
// Helper: Connect to MongoDB
// ============================================================================

async fn connect_mongodb(creds: &MongoDbCredentials) -> Result<Client, String> {
    let client_options = ClientOptions::parse(&creds.connection_string)
        .await
        .map_err(|e| format!("Failed to parse connection string: {}", e))?;

    Client::with_options(client_options)
        .map_err(|e| format!("Failed to create MongoDB client: {}", e))
}

// ============================================================================
// Commands
// ============================================================================

#[tauri::command]
pub async fn test_mongodb_connection(credentials: MongoDbCredentials) -> Result<String, String> {
    let client = connect_mongodb(&credentials).await?;

    // Ping the database to verify connection
    client
        .database(&credentials.database)
        .run_command(doc! { "ping": 1 })
        .await
        .map_err(|e| format!("Connection test failed: {}", e))?;

    Ok("Connection successful".to_string())
}

#[tauri::command]
pub async fn get_mongodb_collections(
    credentials: MongoDbCredentials,
) -> Result<Vec<CollectionInfo>, String> {
    let client = connect_mongodb(&credentials).await?;
    let db = client.database(&credentials.database);

    let collections = db
        .list_collection_names()
        .await
        .map_err(|e| format!("Failed to list collections: {}", e))?;

    Ok(collections
        .into_iter()
        .map(|name| CollectionInfo { name })
        .collect())
}

#[tauri::command]
pub async fn preview_mongodb_collection(
    credentials: MongoDbCredentials,
    collection_name: String,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    let client = connect_mongodb(&credentials).await?;
    let db = client.database(&credentials.database);
    let collection = db.collection::<mongodb::bson::Document>(&collection_name);

    let mut cursor = collection
        .find(doc! {})
        .limit(50)
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut result_rows: Vec<HashMap<String, JsonValue>> = vec![];
    let mut all_columns: std::collections::HashSet<String> = std::collections::HashSet::new();

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Cursor error: {}", e))?
    {
        let doc = cursor.deserialize_current().map_err(|e| format!("Deserialize error: {}", e))?;
        let mut row_map: HashMap<String, JsonValue> = HashMap::new();

        for (key, value) in doc.iter() {
            all_columns.insert(key.clone());
            row_map.insert(key.clone(), bson_to_json(value));
        }

        result_rows.push(row_map);
    }

    let duration_ms = start.elapsed().as_millis();
    let row_count = result_rows.len();
    let columns: Vec<String> = all_columns.into_iter().collect();

    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        duration_ms,
    })
}

#[tauri::command]
pub async fn execute_mongodb_query(
    credentials: MongoDbCredentials,
    collection_name: String,
    query_json: String,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();
    let client = connect_mongodb(&credentials).await?;
    let db = client.database(&credentials.database);
    let collection = db.collection::<mongodb::bson::Document>(&collection_name);

    // Parse the query JSON as a BSON document
    let filter: mongodb::bson::Document = serde_json::from_str(&query_json)
        .map_err(|e| format!("Invalid query JSON: {}", e))?;

    let mut cursor = collection
        .find(filter)
        .limit(100)
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut result_rows: Vec<HashMap<String, JsonValue>> = vec![];
    let mut all_columns: std::collections::HashSet<String> = std::collections::HashSet::new();

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Cursor error: {}", e))?
    {
        let doc = cursor.deserialize_current().map_err(|e| format!("Deserialize error: {}", e))?;
        let mut row_map: HashMap<String, JsonValue> = HashMap::new();

        for (key, value) in doc.iter() {
            all_columns.insert(key.clone());
            row_map.insert(key.clone(), bson_to_json(value));
        }

        result_rows.push(row_map);
    }

    let duration_ms = start.elapsed().as_millis();
    let row_count = result_rows.len();
    let columns: Vec<String> = all_columns.into_iter().collect();

    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        duration_ms,
    })
}

// ============================================================================
// Helper: Convert BSON to JSON
// ============================================================================

fn bson_to_json(bson: &mongodb::bson::Bson) -> JsonValue {
    use mongodb::bson::Bson;

    match bson {
        Bson::Double(v) => serde_json::Number::from_f64(*v)
            .map_or(JsonValue::Null, JsonValue::Number),
        Bson::String(v) => JsonValue::String(v.clone()),
        Bson::Boolean(v) => JsonValue::Bool(*v),
        Bson::Null => JsonValue::Null,
        Bson::Int32(v) => JsonValue::Number((*v).into()),
        Bson::Int64(v) => JsonValue::Number((*v).into()),
        Bson::ObjectId(oid) => JsonValue::String(oid.to_hex()),
        Bson::DateTime(dt) => JsonValue::String(dt.to_string()),
        Bson::Array(arr) => {
            JsonValue::Array(arr.iter().map(bson_to_json).collect())
        }
        Bson::Document(doc) => {
            let mut map = serde_json::Map::new();
            for (key, value) in doc.iter() {
                map.insert(key.clone(), bson_to_json(value));
            }
            JsonValue::Object(map)
        }
        _ => JsonValue::String(format!("{:?}", bson)),
    }
}
