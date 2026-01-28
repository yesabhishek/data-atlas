use serde::{Deserialize, Serialize};
use weaviate_community::WeaviateClient;
use weaviate_community::collections::auth::AuthApiKey;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeaviateCredentials {
    pub host: String,
    pub port: u16,
    pub api_key: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ClassInfo {
    pub name: String,
    pub description: Option<String>,
    pub property_count: usize,
}

#[derive(Debug, Serialize)]
pub struct WeaviateQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub row_count: usize,
    pub duration_ms: u64,
}

fn build_client(credentials: &WeaviateCredentials) -> Result<WeaviateClient, String> {
    let url = format!("http://{}:{}", credentials.host, credentials.port);
    
    let auth = credentials.api_key.as_ref().map(|key| AuthApiKey::new(key));
    
    WeaviateClient::new(&url, auth, None)
        .map_err(|e| format!("Failed to build client: {}", e))
}

#[tauri::command]
pub async fn test_weaviate_connection(credentials: WeaviateCredentials) -> Result<String, String> {
    let client = build_client(&credentials)?;
    
    match client.is_live().await {
        Ok(true) => Ok(format!("Connected to Weaviate at http://{}:{}", credentials.host, credentials.port)),
        Ok(false) => Err("Weaviate server is not responding".to_string()),
        Err(e) => Err(format!("Connection failed: {}", e)),
    }
}

#[tauri::command]
pub async fn get_weaviate_schema(credentials: WeaviateCredentials) -> Result<Vec<ClassInfo>, String> {
    let client = build_client(&credentials)?;
    
    let schema = client.schema.get().await
        .map_err(|e| format!("Failed to get schema: {}", e))?;
    
    let mut classes = Vec::new();
    
    for class in schema.classes {
        let property_count = class.properties
            .as_ref()
            .map(|p| p.0.len())
            .unwrap_or(0);
        
        classes.push(ClassInfo {
            name: class.class.clone(),
            description: class.description.clone(),
            property_count,
        });
    }
    
    Ok(classes)
}

#[tauri::command]
pub async fn preview_weaviate_class(
    credentials: WeaviateCredentials,
    class_name: String,
) -> Result<WeaviateQueryResult, String> {
    use std::time::Instant;
    use weaviate_community::collections::query::GetQuery;
    
    let start = Instant::now();
    let client = build_client(&credentials)?;
    
    // Get schema to find properties
    let schema = client.schema.get().await
        .map_err(|e| format!("Failed to get schema: {}", e))?;
    
    let class_schema = schema.classes.iter()
        .find(|c| c.class == class_name)
        .ok_or_else(|| format!("Class '{}' not found", class_name))?;
    
    let property_names: Vec<&str> = class_schema.properties
        .as_ref()
        .map(|props| {
            props.0.iter()
                .filter_map(|p| {
                    let name: &String = &p.name;
                    Some(name.as_str())
                })
                .collect()
        })
        .unwrap_or_default();
    
    if property_names.is_empty() {
        return Ok(WeaviateQueryResult {
            columns: vec!["_id".to_string()],
            rows: vec![],
            row_count: 0,
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }
    
    let query = GetQuery::builder(&class_name, property_names.clone())
        .with_limit(100)
        .with_additional(vec!["id"])
        .build();
    
    let result = client.query.get(query).await
        .map_err(|e| format!("Failed to query: {}", e))?;
    
    let duration = start.elapsed().as_millis() as u64;
    
    let mut rows: Vec<serde_json::Value> = Vec::new();
    let mut columns = vec!["_id".to_string()];
    columns.extend(property_names.iter().map(|s| s.to_string()));
    
    // Parse the GraphQL response
    let result_value: serde_json::Value = serde_json::to_value(&result)
        .unwrap_or(serde_json::Value::Null);
    
    if let Some(data) = result_value.get("data") {
        if let Some(get) = data.get("Get") {
            if let Some(class_data) = get.get(&class_name) {
                if let Some(arr) = class_data.as_array() {
                    for item in arr {
                        let mut row = serde_json::Map::new();
                        
                        if let Some(additional) = item.get("_additional") {
                            if let Some(id) = additional.get("id") {
                                row.insert("_id".to_string(), id.clone());
                            }
                        }
                        
                        if let Some(obj) = item.as_object() {
                            for (key, value) in obj {
                                if key != "_additional" {
                                    row.insert(key.clone(), value.clone());
                                }
                            }
                        }
                        
                        rows.push(serde_json::Value::Object(row));
                    }
                }
            }
        }
    }
    
    Ok(WeaviateQueryResult {
        columns,
        row_count: rows.len(),
        rows,
        duration_ms: duration,
    })
}

#[tauri::command]
pub async fn query_weaviate(
    credentials: WeaviateCredentials,
    class_name: String,
    properties: Vec<String>,
    limit: Option<u32>,
) -> Result<WeaviateQueryResult, String> {
    use std::time::Instant;
    use weaviate_community::collections::query::GetQuery;
    
    let start = Instant::now();
    let client = build_client(&credentials)?;
    
    let props_refs: Vec<&str> = properties.iter().map(|s| s.as_str()).collect();
    
    let query = GetQuery::builder(&class_name, props_refs)
        .with_limit(limit.unwrap_or(100))
        .with_additional(vec!["id"])
        .build();
    
    let result = client.query.get(query).await
        .map_err(|e| format!("Failed to execute query: {}", e))?;
    
    let duration = start.elapsed().as_millis() as u64;
    
    let mut rows: Vec<serde_json::Value> = Vec::new();
    let mut columns = vec!["_id".to_string()];
    columns.extend(properties.clone());
    
    let result_value: serde_json::Value = serde_json::to_value(&result)
        .unwrap_or(serde_json::Value::Null);
    
    if let Some(data) = result_value.get("data") {
        if let Some(get) = data.get("Get") {
            if let Some(class_data) = get.get(&class_name) {
                if let Some(arr) = class_data.as_array() {
                    for item in arr {
                        let mut row = serde_json::Map::new();
                        
                        if let Some(additional) = item.get("_additional") {
                            if let Some(id) = additional.get("id") {
                                row.insert("_id".to_string(), id.clone());
                            }
                        }
                        
                        if let Some(obj) = item.as_object() {
                            for (key, value) in obj {
                                if key != "_additional" {
                                    row.insert(key.clone(), value.clone());
                                }
                            }
                        }
                        
                        rows.push(serde_json::Value::Object(row));
                    }
                }
            }
        }
    }
    
    Ok(WeaviateQueryResult {
        columns,
        row_count: rows.len(),
        rows,
        duration_ms: duration,
    })
}
