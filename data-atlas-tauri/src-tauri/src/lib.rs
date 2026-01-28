mod connections;
mod db;
mod mongo_db;
mod mysql_db;
mod sqlite_db;
mod chromadb_ops;
mod weaviate_ops;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            // MySQL operations
            mysql_db::test_mysql_connection,
            mysql_db::get_mysql_schema,
            mysql_db::preview_mysql_table,
            mysql_db::execute_mysql_query,
            // MongoDB operations
            mongo_db::test_mongodb_connection,
            mongo_db::get_mongodb_collections,
            mongo_db::preview_mongodb_collection,
            mongo_db::execute_mongodb_query,
            // SQLite operations
            sqlite_db::test_sqlite_connection,
            sqlite_db::get_sqlite_schema,
            sqlite_db::preview_sqlite_table,
            sqlite_db::execute_sqlite_query,
            // ChromaDB operations
            chromadb_ops::test_chromadb_connection,
            chromadb_ops::get_chromadb_collections,
            chromadb_ops::preview_chromadb_collection,
            chromadb_ops::query_chromadb_collection,
            // Weaviate operations
            weaviate_ops::test_weaviate_connection,
            weaviate_ops::get_weaviate_schema,
            weaviate_ops::preview_weaviate_class,
            weaviate_ops::query_weaviate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

