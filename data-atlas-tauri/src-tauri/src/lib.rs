mod connections;
mod db;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            // Connection management
            connections::list_connections,
            connections::add_connection,
            connections::delete_connection,
            connections::get_connection,
            connections::clear_all_data,
            // Postgres operations
            db::test_postgres_connection,
            db::get_postgres_schema,
            db::preview_postgres_table,
            db::execute_postgres_query,
            db::get_postgres_storage_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
