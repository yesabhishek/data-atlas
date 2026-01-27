import { useState, useEffect } from "react";
import { ChevronRight, Table, Columns, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ColumnInfo {
    name: string;
    data_type: string;
}

interface TableSchema {
    name: string;
    columns: ColumnInfo[];
}

interface PostgresCredentials {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    sslmode: string;
}

interface SchemaExplorerProps {
    credentials: PostgresCredentials;
    onSelectTable: (tableName: string) => void;
}

export function SchemaExplorer({ credentials, onSelectTable }: SchemaExplorerProps) {
    const [tables, setTables] = useState<TableSchema[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

    const fetchSchema = async () => {
        setLoading(true);
        setError("");

        try {
            const schema = await invoke<TableSchema[]>("get_postgres_schema", { credentials });
            setTables(schema.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSchema();
    }, [credentials]);

    const toggleTable = (tableName: string) => {
        const newExpanded = new Set(expandedTables);
        if (newExpanded.has(tableName)) {
            newExpanded.delete(tableName);
        } else {
            newExpanded.add(tableName);
        }
        setExpandedTables(newExpanded);
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

    return (
        <div className="schema-explorer">
            <div className="schema-header">
                <span className="schema-title">Tables ({tables.length})</span>
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
                            <Table size={14} />
                            <span
                                className="schema-table-name"
                                onDoubleClick={() => onSelectTable(table.name)}
                            >
                                {table.name}
                            </span>
                            <span className="schema-column-count">{table.columns.length}</span>
                        </div>

                        {expandedTables.has(table.name) && (
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
                    </div>
                ))}
            </div>
        </div>
    );
}
