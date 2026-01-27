import { useState, useEffect } from "react";
import { Play, RefreshCw, MessageSquare, Code } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ChatMode } from "./ChatMode";

interface PostgresCredentials {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    sslmode: string;
}

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
    credentials: PostgresCredentials;
    connectionId: string;
}

export function QueryEditor({ credentials, connectionId }: QueryEditorProps) {
    const [mode, setMode] = useState<"sql" | "chat">("sql");
    const [query, setQuery] = useState("SELECT * FROM  LIMIT 10;");
    const [result, setResult] = useState<QueryResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [tables, setTables] = useState<TableSchema[]>([]);

    useEffect(() => {
        // Fetch schema for chat mode
        const fetchSchema = async () => {
            try {
                const schema = await invoke<TableSchema[]>("get_postgres_schema", { credentials });
                setTables(schema);
            } catch (e) {
                console.error("Failed to load schema:", e);
            }
        };
        fetchSchema();
    }, [credentials]);

    const executeQuery = async () => {
        if (!query.trim()) return;

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const res = await invoke<QueryResult>("execute_postgres_query", {
                credentials,
                query,
            });
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

    return (
        <div className="query-editor-container">
            {/* Mode Toggle */}
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

            {mode === "sql" ? (
                <div className="query-editor">
                    <div className="query-input-container">
                        <textarea
                            className="query-input"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter your SQL query..."
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
                                <span>{result.row_count} rows returned</span>
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
                <ChatMode credentials={credentials} tables={tables} connectionId={connectionId} />
            )}
        </div>
    );
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
