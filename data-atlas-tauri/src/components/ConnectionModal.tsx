import { useState } from "react";
import { X, Upload } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface ConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type DbType = "postgres" | "mysql" | "mongodb" | "sqlite" | "chromadb" | "weaviate";

interface DbTypeOption {
    id: DbType;
    name: string;
    initials: string;
    color: string;
}

const dbTypes: DbTypeOption[] = [
    { id: "postgres", name: "PostgreSQL", initials: "PG", color: "#336791" },
    { id: "mysql", name: "MySQL", initials: "My", color: "#00758f" },
    { id: "mongodb", name: "MongoDB", initials: "MO", color: "#4FAA41" },
    { id: "sqlite", name: "SQLite", initials: "SL", color: "#003B57" },
    { id: "chromadb", name: "ChromaDB", initials: "CH", color: "#FF5C00" },
    { id: "weaviate", name: "Weaviate", initials: "WE", color: "#FA0171" },
];

export function ConnectionModal({ isOpen, onClose, onSuccess }: ConnectionModalProps) {
    const [dbType, setDbType] = useState<DbType>("postgres");
    const [name, setName] = useState("");

    // PostgreSQL / MySQL fields
    const [host, setHost] = useState("localhost");
    const [port, setPort] = useState("5432");
    const [database, setDatabase] = useState("");
    const [user, setUser] = useState("");
    const [password, setPassword] = useState("");
    const [sslmode, setSslmode] = useState("prefer");

    // MongoDB fields
    const [connectionString, setConnectionString] = useState("");

    // SQLite fields
    const [filePath, setFilePath] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [testResult, setTestResult] = useState("");

    if (!isOpen) return null;

    const getDefaultPort = (type: DbType) => {
        switch (type) {
            case "postgres": return "5432";
            case "mysql": return "3306";
            case "chromadb": return "8000";
            case "weaviate": return "8080";
            default: return "";
        }
    };

    const handleDbTypeChange = (type: DbType) => {
        setDbType(type);
        setPort(getDefaultPort(type));
        setError("");
        setTestResult("");
    };

    const handleTest = async () => {
        setLoading(true);
        setError("");
        setTestResult("");

        try {
            let result: string;

            switch (dbType) {
                case "postgres":
                    result = await invoke<string>("test_postgres_connection", {
                        credentials: { host, port: parseInt(port), database, user, password, sslmode },
                    });
                    break;
                case "mysql":
                    result = await invoke<string>("test_mysql_connection", {
                        credentials: { host, port: parseInt(port), database, user, password },
                    });
                    break;
                case "mongodb":
                    result = await invoke<string>("test_mongodb_connection", {
                        credentials: { connection_string: connectionString, database },
                    });
                    break;
                case "sqlite":
                    result = await invoke<string>("test_sqlite_connection", {
                        credentials: { file_path: filePath },
                    });
                    break;
                case "chromadb":
                    result = await invoke<string>("test_chromadb_connection", {
                        credentials: { host, port: parseInt(port) },
                    });
                    break;
                case "weaviate":
                    result = await invoke<string>("test_weaviate_connection", {
                        credentials: { host, port: parseInt(port), api_key: user || null },
                    });
                    break;
            }

            setTestResult(result);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError("Connection name is required");
            return;
        }

        setLoading(true);
        setError("");

        try {
            let credentials: object;

            switch (dbType) {
                case "postgres":
                    credentials = {
                        db_type: "postgres",
                        credentials: { host, port: parseInt(port), database, user, password, sslmode },
                    };
                    break;
                case "mysql":
                    credentials = {
                        db_type: "mysql",
                        credentials: { host, port: parseInt(port), database, user, password },
                    };
                    break;
                case "mongodb":
                    credentials = {
                        db_type: "mongodb",
                        credentials: { connection_string: connectionString, database },
                    };
                    break;
                case "sqlite":
                    credentials = {
                        db_type: "sqlite",
                        credentials: { file_path: filePath },
                    };
                    break;
                case "chromadb":
                    credentials = {
                        db_type: "chromadb",
                        credentials: { host, port: parseInt(port) },
                    };
                    break;
                case "weaviate":
                    credentials = {
                        db_type: "weaviate",
                        credentials: { host, port: parseInt(port), api_key: user || null },
                    };
                    break;
            }

            await invoke("add_connection", { name, credentials });
            onSuccess();
            onClose();
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    const renderDbTypeSelector = () => (
        <div className="db-type-selector">
            {dbTypes.map((type) => (
                <button
                    key={type.id}
                    className={`db-type-option ${dbType === type.id ? "selected" : ""}`}
                    onClick={() => handleDbTypeChange(type.id)}
                    type="button"
                >
                    <div className="db-type-initials" style={{ backgroundColor: type.color }}>
                        {type.initials}
                    </div>
                    <span className="db-type-name">{type.name}</span>
                </button>
            ))}
        </div>
    );

    const renderConnectionFields = () => {
        switch (dbType) {
            case "postgres":
            case "mysql":
                return (
                    <>
                        <div className="form-row">
                            <div className="form-group" style={{ flex: 2 }}>
                                <label className="form-label">Host</label>
                                <input
                                    className="form-input"
                                    placeholder="localhost"
                                    value={host}
                                    onChange={(e) => setHost(e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Port</label>
                                <input
                                    className="form-input"
                                    placeholder={dbType === "mysql" ? "3306" : "5432"}
                                    value={port}
                                    onChange={(e) => setPort(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Database</label>
                            <input
                                className="form-input"
                                placeholder={dbType === "mysql" ? "mydb" : "postgres"}
                                value={database}
                                onChange={(e) => setDatabase(e.target.value)}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">User</label>
                                <input
                                    className="form-input"
                                    placeholder={dbType === "mysql" ? "root" : "postgres"}
                                    value={user}
                                    onChange={(e) => setUser(e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Password</label>
                                <input
                                    className="form-input"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        {dbType === "postgres" && (
                            <div className="form-group">
                                <label className="form-label">SSL Mode</label>
                                <select
                                    className="form-select"
                                    value={sslmode}
                                    onChange={(e) => setSslmode(e.target.value)}
                                >
                                    <option value="disable">Disable</option>
                                    <option value="prefer">Prefer</option>
                                    <option value="require">Require</option>
                                </select>
                            </div>
                        )}
                    </>
                );

            case "mongodb":
                return (
                    <>
                        <div className="form-group">
                            <label className="form-label">Connection String</label>
                            <input
                                className="form-input"
                                placeholder="mongodb://localhost:27017"
                                value={connectionString}
                                onChange={(e) => setConnectionString(e.target.value)}
                            />
                            <span className="form-hint">e.g., mongodb://user:pass@host:27017</span>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Database</label>
                            <input
                                className="form-input"
                                placeholder="mydb"
                                value={database}
                                onChange={(e) => setDatabase(e.target.value)}
                            />
                        </div>
                    </>
                );

            case "chromadb":
                return (
                    <div className="form-row">
                        <div className="form-group" style={{ flex: 2 }}>
                            <label className="form-label">Host</label>
                            <input
                                className="form-input"
                                placeholder="localhost"
                                value={host}
                                onChange={(e) => setHost(e.target.value)}
                            />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Port</label>
                            <input
                                className="form-input"
                                placeholder="8000"
                                value={port}
                                onChange={(e) => setPort(e.target.value)}
                            />
                        </div>
                    </div>
                );

            case "weaviate":
                return (
                    <>
                        <div className="form-row">
                            <div className="form-group" style={{ flex: 2 }}>
                                <label className="form-label">Host</label>
                                <input
                                    className="form-input"
                                    placeholder="localhost"
                                    value={host}
                                    onChange={(e) => setHost(e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Port</label>
                                <input
                                    className="form-input"
                                    placeholder="8080"
                                    value={port}
                                    onChange={(e) => setPort(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">API Key (Optional)</label>
                            <input
                                className="form-input"
                                type="password"
                                placeholder="Your API Key"
                                value={user}
                                onChange={(e) => setUser(e.target.value)}
                            />
                        </div>
                    </>
                );

            case "sqlite":
                return (
                    <div className="form-group">
                        <label className="form-label">Database File</label>
                        <div className="file-picker-row">
                            <input
                                className="form-input file-input"
                                placeholder="Select or drop a SQLite database file"
                                value={filePath}
                                onChange={(e) => setFilePath(e.target.value)}
                                readOnly
                            />
                            <button
                                type="button"
                                className="btn btn-secondary file-picker-btn"
                                onClick={async () => {
                                    const selected = await open({
                                        multiple: false,
                                        filters: [{
                                            name: "SQLite Database",
                                            extensions: ["db", "sqlite", "sqlite3", "db3"]
                                        }]
                                    });
                                    if (selected) {
                                        setFilePath(selected as string);
                                    }
                                }}
                            >
                                <Upload size={16} />
                                Browse
                            </button>
                        </div>
                        <span className="form-hint">Select a .db, .sqlite, or .sqlite3 file from your computer</span>
                    </div>
                );
        }
    };

    const selectedDb = dbTypes.find(t => t.id === dbType);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-title-row">
                        {selectedDb && (
                            <div className="db-type-initials small" style={{ backgroundColor: selectedDb.color }}>
                                {selectedDb.initials}
                            </div>
                        )}
                        <h2 className="modal-title">Add {selectedDb?.name} Connection</h2>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    {renderDbTypeSelector()}

                    <div className="form-group">
                        <label className="form-label">Connection Name</label>
                        <input
                            className="form-input"
                            placeholder="My Database"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    {renderConnectionFields()}

                    {error && <div className="form-error">{error}</div>}
                    {testResult && <div className="form-success">{testResult}</div>}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleTest} disabled={loading}>
                        {loading ? "Testing..." : "Test Connection"}
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                        {loading ? "Saving..." : "Save Connection"}
                    </button>
                </div>
            </div>
        </div>
    );
}
