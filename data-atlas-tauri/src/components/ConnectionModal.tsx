import { useState } from "react";
import { X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function ConnectionModal({ isOpen, onClose, onSuccess }: ConnectionModalProps) {
    const [name, setName] = useState("");
    const [host, setHost] = useState("localhost");
    const [port, setPort] = useState("5432");
    const [database, setDatabase] = useState("");
    const [user, setUser] = useState("");
    const [password, setPassword] = useState("");
    const [sslmode, setSslmode] = useState("prefer");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [testResult, setTestResult] = useState("");

    if (!isOpen) return null;

    const handleTest = async () => {
        setLoading(true);
        setError("");
        setTestResult("");

        try {
            const result = await invoke<string>("test_postgres_connection", {
                credentials: {
                    host,
                    port: parseInt(port),
                    database,
                    user,
                    password,
                    sslmode,
                },
            });
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
            await invoke("add_connection", {
                name,
                credentials: {
                    db_type: "postgres",
                    credentials: {
                        host,
                        port: parseInt(port),
                        database,
                        user,
                        password,
                        sslmode,
                    },
                },
            });
            onSuccess();
            onClose();
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Add Postgres Connection</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label className="form-label">Connection Name</label>
                        <input
                            className="form-input"
                            placeholder="My Postgres DB"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

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
                                placeholder="5432"
                                value={port}
                                onChange={(e) => setPort(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Database</label>
                        <input
                            className="form-input"
                            placeholder="postgres"
                            value={database}
                            onChange={(e) => setDatabase(e.target.value)}
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">User</label>
                            <input
                                className="form-input"
                                placeholder="postgres"
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
