import { useState, useEffect } from "react";
import { RefreshCw, ChevronLeft } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface PostgresCredentials {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    sslmode: string;
}

interface QueryResult {
    columns: string[];
    rows: Record<string, unknown>[];
    row_count: number;
    duration_ms: number;
}

interface DataTableProps {
    credentials: PostgresCredentials;
    tableName: string;
    onBack: () => void;
}

export function DataTable({ credentials, tableName, onBack }: DataTableProps) {
    const [data, setData] = useState<QueryResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchData = async () => {
        setLoading(true);
        setError("");

        try {
            const result = await invoke<QueryResult>("preview_postgres_table", {
                credentials,
                tableName,
            });
            setData(result);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [tableName]);

    return (
        <div className="data-table-container">
            <div className="data-table-header">
                <button className="btn btn-secondary" onClick={onBack}>
                    <ChevronLeft size={16} />
                    Back
                </button>
                <h2 className="data-table-title">{tableName}</h2>
                <div className="data-table-meta">
                    {data && (
                        <>
                            <span>{data.row_count} rows</span>
                            <span className="separator">•</span>
                            <span>{data.duration_ms}ms</span>
                        </>
                    )}
                    <button className="icon-btn" onClick={fetchData} title="Refresh">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {loading && (
                <div className="data-table-loading">
                    <RefreshCw size={16} className="spin" />
                    <span>Loading data...</span>
                </div>
            )}

            {error && (
                <div className="data-table-error">
                    <p>{error}</p>
                    <button className="btn btn-secondary" onClick={fetchData}>
                        Retry
                    </button>
                </div>
            )}

            {data && !loading && (
                <div className="data-table-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                {data.columns.map((col) => (
                                    <th key={col}>{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row, idx) => (
                                <tr key={idx}>
                                    {data.columns.map((col) => (
                                        <td key={col}>{formatCellValue(row[col])}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
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
