import { useState, useEffect } from "react";
import { Play, RefreshCw, MessageSquare, Code } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ChatMode } from "./ChatMode";

interface TableSchema {
    name: string;
    columns: { name: string; data_type: string }[];
}

interface QueryResult {
    columns: string[];
    rows: Record<string, unknown>[];
    row_count: number;
    duration_ms: number;
}

interface QueryEditorProps {
    credentials: Record<string, unknown>;
    dbType: string;
    connectionId: string;
}

export function QueryEditor({ credentials, dbType, connectionId }: QueryEditorProps) {
    const [mode, setMode] = useState<"sql" | "chat">("sql");
    const [query, setQuery] = useState(getDefaultQuery(dbType));
    const [result, setResult] = useState<QueryResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [tables, setTables] = useState<TableSchema[]>([]);
    const [collectionName, setCollectionName] = useState("");

    useEffect(() => {
        // Fetch schema for chat mode
        const fetchSchema = async () => {
            try {
                let schema: TableSchema[] = [];
                switch (dbType) {
                    case "postgres":
                        schema = await invoke<TableSchema[]>("get_postgres_schema", { credentials });
                        break;
                    case "mysql":
                        schema = await invoke<TableSchema[]>("get_mysql_schema", { credentials });
                        break;
                    case "sqlite":
                        schema = await invoke<TableSchema[]>("get_sqlite_schema", { credentials });
                        break;
                    case "mongodb":
                        const collections = await invoke<{ name: string }[]>("get_mongodb_collections", { credentials });
                        schema = collections.map(c => ({ name: c.name, columns: [] }));
                        break;
                }
                setTables(schema);
            } catch (e) {
                console.error("Failed to load schema:", e);
            }
        };
        fetchSchema();
    }, [credentials, dbType]);

    useEffect(() => {
        setQuery(getDefaultQuery(dbType));
    }, [dbType]);

    const executeQuery = async () => {
        if (!query.trim()) return;

        setLoading(true);
        setError("");
        setResult(null);

        try {
            let res: QueryResult;

            switch (dbType) {
                case "postgres":
                    res = await invoke<QueryResult>("execute_postgres_query", {
                        credentials,
                        query,
                    });
                    break;
                case "mysql":
                    res = await invoke<QueryResult>("execute_mysql_query", {
                        credentials,
                        query,
                    });
                    break;
                case "sqlite":
                    res = await invoke<QueryResult>("execute_sqlite_query", {
                        credentials,
                        query,
                    });
                    break;
                case "mongodb":
                    if (!collectionName.trim()) {
                        throw new Error("Please enter a collection name");
                    }
                    res = await invoke<QueryResult>("execute_mongodb_query", {
                        credentials,
                        collectionName,
                        queryJson: query,
                    });
                    break;
                case "chromadb":
                    if (!collectionName.trim()) {
                        throw new Error("Please enter a collection name");
                    }
                    res = await invoke<QueryResult>("query_chromadb_collection", {
                        credentials,
                        collectionName,
                        queryText: query,
                        nResults: 10,
                    });
                    break;
                case "weaviate":
                    if (!collectionName.trim()) {
                        throw new Error("Please enter a class name");
                    }
                    const properties = query.split(',').map(p => p.trim()).filter(p => p);
                    if (properties.length === 0) {
                        throw new Error("Please enter properties to select (comma separated)");
                    }
                    res = await invoke<QueryResult>("query_weaviate", {
                        credentials,
                        className: collectionName,
                        properties,
                        limit: 100,
                    });
                    break;
                default:
                    throw new Error(`Unsupported database type: ${dbType}`);
            }

            setResult(res);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            executeQuery();
        }
    };

    const isMongoDB = dbType === "mongodb";
    const isVectorDB = dbType === "chromadb" || dbType === "weaviate";
    const showCollectionInput = isMongoDB || isVectorDB;

    return (
        <div className="query-editor-container">
            {/* Mode Toggle - hide chat for NoSQL/Vector for now */}
            {!showCollectionInput && (
                <div className="query-mode-toggle">
                    <button
                        className={`mode-btn ${mode === "sql" ? "active" : ""}`}
                        onClick={() => setMode("sql")}
                    >
                        <Code size={16} />
                        SQL
                    </button>
                    <button
                        className={`mode-btn ${mode === "chat" ? "active" : ""}`}
                        onClick={() => setMode("chat")}
                    >
                        <MessageSquare size={16} />
                        Chat
                    </button>
                </div>
            )}

            {mode === "sql" || showCollectionInput ? (
                <div className="query-editor">
                    {showCollectionInput && (
                        <div className="mongodb-collection-input">
                            <label className="form-label">
                                {dbType === "weaviate" ? "Class Name" : "Collection Name"}
                            </label>
                            <input
                                className="form-input"
                                placeholder={`Enter ${dbType === "weaviate" ? "class" : "collection"} name`}
                                value={collectionName}
                                onChange={(e) => setCollectionName(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="query-input-container">
                        <textarea
                            className="query-input"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                dbType === "mongodb" ? "Enter MongoDB filter JSON... (e.g., {})" :
                                    dbType === "chromadb" ? "Enter search text (semantic search)..." :
                                        dbType === "weaviate" ? "Enter property names (comma separated)..." :
                                            "Enter your SQL query..."
                            }
                            spellCheck={false}
                        />
                        <div className="query-actions">
                            <span className="query-hint">⌘+Enter to run</span>
                            <button
                                className="btn btn-primary"
                                onClick={executeQuery}
                                disabled={loading}
                            >
                                {loading ? (
                                    <RefreshCw size={14} className="spin" />
                                ) : (
                                    <Play size={14} />
                                )}
                                {loading ? "Running..." : "Run Query"}
                            </button>
                        </div>
                    </div>

                    {error && <div className="query-error">{error}</div>}

                    {result && (
                        <div className="query-result">
                            <div className="query-result-meta">
                                <span>{result.row_count} {isMongoDB ? "documents" : "rows"} returned</span>
                                <span className="separator">•</span>
                                <span>{result.duration_ms}ms</span>
                            </div>
                            <div className="data-table-wrapper">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            {result.columns.map((col) => (
                                                <th key={col}>{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.rows.map((row, idx) => (
                                            <tr key={idx}>
                                                {result.columns.map((col) => (
                                                    <td key={col}>{formatCellValue(row[col])}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <ChatMode credentials={credentials} tables={tables} connectionId={connectionId} dbType={dbType} />
            )}
        </div>
    );
}

function getDefaultQuery(dbType: string): string {
    switch (dbType) {
        case "mongodb":
            return "{}";
        default:
            return "SELECT * FROM  LIMIT 10;";
    }
}

function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) {
        return "NULL";
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}
