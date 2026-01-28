use serde::{Deserialize, Serialize};
use chromadb::{ChromaClient, client::ChromaClientOptions};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChromaDbCredentials {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Serialize)]
pub struct CollectionInfo {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ChromaQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub row_count: usize,
    pub duration_ms: u64,
}

async fn create_client(credentials: &ChromaDbCredentials) -> Result<ChromaClient, String> {
    let url = format!("http://{}:{}", credentials.host, credentials.port);
    
    let options = ChromaClientOptions {
        url: Some(url),
        ..Default::default()
    };
    
    ChromaClient::new(options)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))
}

#[tauri::command]
pub async fn test_chromadb_connection(credentials: ChromaDbCredentials) -> Result<String, String> {
    let client = create_client(&credentials).await?;
    
    match client.list_collections().await {
        Ok(collections) => Ok(format!("Connected to ChromaDB ({} collections)", collections.len())),
        Err(e) => Err(format!("Connection failed: {}", e)),
    }
}

#[tauri::command]
pub async fn get_chromadb_collections(credentials: ChromaDbCredentials) -> Result<Vec<CollectionInfo>, String> {
    let client = create_client(&credentials).await?;
    
    let collections = client.list_collections().await
        .map_err(|e| format!("Failed to list collections: {}", e))?;
    
    let mut result = Vec::new();
    for collection in collections {
        let count = collection.count().await.unwrap_or(0);
        result.push(CollectionInfo {
            name: collection.name().to_string(),
            count,
        });
    }
    
    Ok(result)
}

#[tauri::command]
pub async fn preview_chromadb_collection(
    credentials: ChromaDbCredentials,
    collection_name: String,
) -> Result<ChromaQueryResult, String> {
    use std::time::Instant;
    use chromadb::collection::GetOptions;
    
    let start = Instant::now();
    let client = create_client(&credentials).await?;
    
    let collection = client.get_collection(&collection_name)
        .await
        .map_err(|e| format!("Failed to get collection: {}", e))?;
    
    let results = collection.get(GetOptions {
        ids: vec![],
        include: Some(vec!["documents".to_string(), "metadatas".to_string()]),
        limit: Some(100),
        offset: Some(0),
        where_document: None,
        where_metadata: None,
    }).await
        .map_err(|e| format!("Failed to get documents: {}", e))?;
    
    let duration = start.elapsed().as_millis() as u64;
    
    let mut rows: Vec<serde_json::Value> = Vec::new();
    
    for (i, id) in results.ids.iter().enumerate() {
        let mut row = serde_json::Map::new();
        row.insert("id".to_string(), serde_json::Value::String(id.clone()));
        
        if let Some(ref docs) = results.documents {
            if let Some(doc) = docs.get(i).and_then(|d| d.clone()) {
                row.insert("document".to_string(), serde_json::Value::String(doc));
            }
        }
        
        if let Some(ref metas) = results.metadatas {
            if let Some(meta_opt) = metas.get(i) {
                if let Some(meta) = meta_opt {
                    row.insert("metadata".to_string(), serde_json::to_value(meta).unwrap_or_default());
                }
            }
        }
        
        rows.push(serde_json::Value::Object(row));
    }
    
    Ok(ChromaQueryResult {
        columns: vec!["id".to_string(), "document".to_string(), "metadata".to_string()],
        row_count: rows.len(),
        rows,
        duration_ms: duration,
    })
}

#[tauri::command]
pub async fn query_chromadb_collection(
    credentials: ChromaDbCredentials,
    collection_name: String,
    query_text: String,
    n_results: Option<usize>,
) -> Result<ChromaQueryResult, String> {
    use std::time::Instant;
    use chromadb::collection::QueryOptions;
    
    let start = Instant::now();
    let client = create_client(&credentials).await?;
    
    let collection = client.get_collection(&collection_name)
        .await
        .map_err(|e| format!("Failed to get collection: {}", e))?;
    
    let n = n_results.unwrap_or(10);
    let query_ref: &str = &query_text;
    
    let results = collection.query(QueryOptions {
        query_texts: Some(vec![query_ref]),
        query_embeddings: None,
        n_results: Some(n),
        include: Some(vec!["documents", "metadatas", "distances"]),
        where_document: None,
        where_metadata: None,
    }, None).await
        .map_err(|e| format!("Failed to query: {}", e))?;
    
    let duration = start.elapsed().as_millis() as u64;
    
    let mut rows: Vec<serde_json::Value> = Vec::new();
    
    for (batch_idx, ids) in results.ids.iter().enumerate() {
        for (i, id) in ids.iter().enumerate() {
            let mut row = serde_json::Map::new();
            row.insert("id".to_string(), serde_json::Value::String(id.clone()));
            
            if let Some(ref docs_batch) = results.documents {
                if let Some(docs) = docs_batch.get(batch_idx) {
                    if let Some(doc) = docs.get(i) {
                         // QueryResult has documents as Vec<Vec<String>> (or Option<String> that unwrapped?)
                         // Based on error analysis, it seemed to be String. 
                         // But to be safe and cover both Option and String (via Clone/Display), let's inspect.
                         // Actually, error said "expected Option, found String" when I tried to use it as Option.
                         // So it is String.
                        row.insert("document".to_string(), serde_json::Value::String(doc.clone()));
                    }
                }
            }
            
            if let Some(ref distances_batch) = results.distances {
                if let Some(distances) = distances_batch.get(batch_idx) {
                    if let Some(dist) = distances.get(i) {
                        row.insert("distance".to_string(), serde_json::json!(dist));
                    }
                }
            }
            
            if let Some(ref metas_batch) = results.metadatas {
                if let Some(metas) = metas_batch.get(batch_idx) {
                    if let Some(meta_opt) = metas.get(i) {
                        if let Some(meta) = meta_opt {
                            row.insert("metadata".to_string(), serde_json::to_value(meta).unwrap_or_default());
                        }
                    }
                }
            }
            
            rows.push(serde_json::Value::Object(row));
        }
    }
    
    Ok(ChromaQueryResult {
        columns: vec!["id".to_string(), "document".to_string(), "distance".to_string(), "metadata".to_string()],
        row_count: rows.len(),
        rows,
        duration_ms: duration,
    })
}
