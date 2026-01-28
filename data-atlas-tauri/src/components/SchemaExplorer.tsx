import { useState, useEffect } from "react";
import { ChevronRight, Table, Columns, RefreshCw, FileText } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ColumnInfo {
    name: string;
    data_type: string;
}

interface TableSchema {
    name: string;
    columns?: ColumnInfo[];
}

interface SchemaExplorerProps {
    credentials: Record<string, unknown>;
    dbType: string;
    onSelectTable: (tableName: string) => void;
}

export function SchemaExplorer({ credentials, dbType, onSelectTable }: SchemaExplorerProps) {
    const [tables, setTables] = useState<TableSchema[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

    const fetchSchema = async () => {
        setLoading(true);
        setError("");

        try {
            let schema: TableSchema[] = [];

            switch (dbType) {
                case "postgres":
                    schema = await invoke<TableSchema[]>("get_postgres_schema", { credentials });
                    break;
                case "mysql":
                    schema = await invoke<TableSchema[]>("get_mysql_schema", { credentials });
                    break;
                case "mongodb":
                    const collections = await invoke<{ name: string }[]>("get_mongodb_collections", { credentials });
                    schema = collections.map(c => ({ name: c.name, columns: [] }));
                    break;
                case "sqlite":
                    schema = await invoke<TableSchema[]>("get_sqlite_schema", { credentials });
                    break;
                case "chromadb":
                    const chromaCollections = await invoke<{ name: string; count: number }[]>("get_chromadb_collections", { credentials });
                    schema = chromaCollections.map(c => ({
                        name: c.name,
                        columns: [{ name: "count", data_type: String(c.count) }] // Hack to show count
                    }));
                    break;
                case "weaviate":
                    const weaviateClasses = await invoke<{ name: string; description: string; property_count: number }[]>("get_weaviate_schema", { credentials });
                    schema = weaviateClasses.map(c => ({
                        name: c.name,
                        columns: [{ name: "properties", data_type: String(c.property_count) }] // Hack to show property count
                    }));
                    break;
            }

            setTables(schema.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSchema();
    }, [credentials, dbType]);

    const toggleTable = (tableName: string) => {
        const newExpanded = new Set(expandedTables);
        if (newExpanded.has(tableName)) {
            newExpanded.delete(tableName);
        } else {
            newExpanded.add(tableName);
        }
        setExpandedTables(newExpanded);
    };

    const getItemLabel = () => {
        if (dbType === "mongodb" || dbType === "chromadb") return "Collections";
        if (dbType === "weaviate") return "Classes";
        return "Tables";
    };

    const getItemIcon = () => {
        if (dbType === "mongodb" || dbType === "chromadb" || dbType === "weaviate") return FileText;
        return Table;
    };

    if (loading) {
        return (
            <div className="schema-loading">
                <RefreshCw size={16} className="spin" />
                <span>Loading schema...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="schema-error">
                <p>{error}</p>
                <button className="btn btn-secondary" onClick={fetchSchema}>
                    Retry
                </button>
            </div>
        );
    }

    const ItemIcon = getItemIcon();

    return (
        <div className="schema-explorer">
            <div className="schema-header">
                <span className="schema-title">{getItemLabel()} ({tables.length})</span>
                <button className="icon-btn" onClick={fetchSchema} title="Refresh">
                    <RefreshCw size={14} />
                </button>
            </div>

            <div className="schema-tree">
                {tables.map((table) => (
                    <div key={table.name} className="schema-table">
                        <div
                            className="schema-table-header"
                            onClick={() => toggleTable(table.name)}
                        >
                            <ChevronRight
                                size={14}
                                className={`chevron ${expandedTables.has(table.name) ? "expanded" : ""}`}
                            />
                            <ItemIcon size={14} />
                            <span
                                className="schema-table-name"
                                onDoubleClick={() => onSelectTable(table.name)}
                            >
                                {table.name}
                            </span>
                            {table.columns && table.columns.length > 0 && (
                                <span className="schema-column-count">{table.columns.length}</span>
                            )}
                        </div>

                        {expandedTables.has(table.name) && table.columns && table.columns.length > 0 && (
                            <div className="schema-columns">
                                {table.columns.map((col) => (
                                    <div key={col.name} className="schema-column">
                                        <Columns size={12} />
                                        <span className="column-name">{col.name}</span>
                                        <span className="column-type">{col.data_type}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {expandedTables.has(table.name) && dbType === "mongodb" && (
                            <div className="schema-columns">
                                <div className="schema-column mongodb-hint">
                                    <span className="column-name">Double-click to preview documents</span>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
