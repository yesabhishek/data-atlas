import { useState, useEffect } from "react";
import { Moon, Sun, Trash2, X, Key } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface SettingsProps {
    isOpen: boolean;
    onClose: () => void;
    onClearData: () => void;
}

export function Settings({ isOpen, onClose, onClearData }: SettingsProps) {
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [openaiKey, setOpenaiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [clearing, setClearing] = useState(false);

    useEffect(() => {
        // Load saved theme
        const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
        if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.setAttribute("data-theme", savedTheme);
        }

        // Load saved API key
        const savedKey = localStorage.getItem("openai_api_key") || "";
        setOpenaiKey(savedKey);
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
        localStorage.setItem("theme", newTheme);
        document.documentElement.setAttribute("data-theme", newTheme);
    };

    const saveApiKey = () => {
        localStorage.setItem("openai_api_key", openaiKey);
    };

    const handleClearData = async () => {
        if (!confirm("Are you sure? This will delete all saved connections.")) return;

        setClearing(true);
        try {
            await invoke("clear_all_data");
            localStorage.clear();
            onClearData();
            onClose();
        } catch (e) {
            console.error("Failed to clear data:", e);
        } finally {
            setClearing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Settings</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Theme */}
                    <div className="settings-section">
                        <div className="settings-row">
                            <div className="settings-label">
                                <span className="settings-title">Theme</span>
                                <span className="settings-desc">Switch between light and dark mode</span>
                            </div>
                            <button className="theme-toggle" onClick={toggleTheme}>
                                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                                <span>{theme === "light" ? "Dark" : "Light"}</span>
                            </button>
                        </div>
                    </div>

                    {/* OpenAI API Key */}
                    <div className="settings-section">
                        <div className="settings-row">
                            <div className="settings-label">
                                <span className="settings-title">OpenAI API Key</span>
                                <span className="settings-desc">Required for AI chat mode</span>
                            </div>
                        </div>
                        <div className="settings-input-row">
                            <div className="settings-input-wrapper">
                                <Key size={14} className="settings-input-icon" />
                                <input
                                    type={showKey ? "text" : "password"}
                                    className="form-input settings-input"
                                    placeholder="sk-..."
                                    value={openaiKey}
                                    onChange={(e) => setOpenaiKey(e.target.value)}
                                    onBlur={saveApiKey}
                                />
                            </div>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowKey(!showKey)}
                            >
                                {showKey ? "Hide" : "Show"}
                            </button>
                        </div>
                    </div>

                    {/* Clear Data */}
                    <div className="settings-section settings-danger">
                        <div className="settings-row">
                            <div className="settings-label">
                                <span className="settings-title">Clear All Data</span>
                                <span className="settings-desc">Delete all saved connections and settings</span>
                            </div>
                            <button
                                className="btn btn-danger"
                                onClick={handleClearData}
                                disabled={clearing}
                            >
                                <Trash2 size={14} />
                                {clearing ? "Clearing..." : "Clear Data"}
                            </button>
                        </div>
                    </div>

                    {/* Version */}
                    <div className="settings-section settings-footer">
                        <span className="settings-version">Data Atlas v0.1.0</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
