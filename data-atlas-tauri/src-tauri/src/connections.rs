use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PostgresCredentials {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    #[serde(default = "default_sslmode")]
    pub sslmode: String,
}

fn default_sslmode() -> String {
    "prefer".to_string()
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "db_type", content = "credentials")]
pub enum ConnectionCredentials {
    #[serde(rename = "postgres")]
    Postgres(PostgresCredentials),
    // Future: Mongo, Chroma, etc.
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SavedConnection {
    pub id: String,
    pub name: String,
    #[serde(flatten)]
    pub credentials: ConnectionCredentials,
}

fn get_connections_file(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
    
    Ok(data_dir.join("connections.json"))
}

fn load_connections(app: &AppHandle) -> Result<Vec<SavedConnection>, String> {
    let path = get_connections_file(app)?;
    
    if !path.exists() {
        return Ok(vec![]);
    }
    
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read connections file: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse connections: {}", e))
}

fn save_connections(app: &AppHandle, connections: &[SavedConnection]) -> Result<(), String> {
    let path = get_connections_file(app)?;
    let content = serde_json::to_string_pretty(connections)
        .map_err(|e| format!("Failed to serialize connections: {}", e))?;
    
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write connections file: {}", e))
}

#[tauri::command]
pub async fn list_connections(app: AppHandle) -> Result<Vec<SavedConnection>, String> {
    load_connections(&app)
}

#[tauri::command]
pub async fn add_connection(
    app: AppHandle,
    name: String,
    credentials: ConnectionCredentials,
) -> Result<SavedConnection, String> {
    let mut connections = load_connections(&app)?;
    
    let new_connection = SavedConnection {
        id: Uuid::new_v4().to_string(),
        name,
        credentials,
    };
    
    connections.push(new_connection.clone());
    save_connections(&app, &connections)?;
    
    Ok(new_connection)
}

#[tauri::command]
pub async fn delete_connection(app: AppHandle, id: String) -> Result<(), String> {
    let mut connections = load_connections(&app)?;
    connections.retain(|c| c.id != id);
    save_connections(&app, &connections)
}

#[tauri::command]
pub async fn get_connection(app: AppHandle, id: String) -> Result<SavedConnection, String> {
    let connections = load_connections(&app)?;
    connections
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| "Connection not found".to_string())
}

#[tauri::command]
pub async fn clear_all_data(app: AppHandle) -> Result<(), String> {
    let path = get_connections_file(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete data: {}", e))?;
    }
    Ok(())
}
