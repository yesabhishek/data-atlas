import { useState, useEffect } from "react";
import { Database, Plus, Search, Settings as SettingsIcon, Table, Terminal, X, ChevronRight, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import "./index.css";
import { ConnectionModal } from "./components/ConnectionModal";
import { SchemaExplorer } from "./components/SchemaExplorer";
import { DataTable } from "./components/DataTable";
import { QueryEditor } from "./components/QueryEditor";
import { Settings } from "./components/Settings";

interface PostgresCredentials {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  sslmode: string;
}

interface SavedConnection {
  id: string;
  name: string;
  db_type: string;
  credentials: PostgresCredentials;
}

interface TableInfo {
  name: string;
}

type View = "dashboard" | "schema" | "table" | "query";

function App() {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<SavedConnection | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [sidebarTables, setSidebarTables] = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  const loadConnections = async () => {
    try {
      const conns = await invoke<SavedConnection[]>("list_connections");
      setConnections(conns);
    } catch (e) {
      console.error("Failed to load connections:", e);
    }
  };

  const loadTables = async (credentials: PostgresCredentials) => {
    setLoadingTables(true);
    try {
      const schema = await invoke<{ name: string; columns: unknown[] }[]>("get_postgres_schema", {
        credentials,
      });
      setSidebarTables(schema.map((t) => ({ name: t.name })));
    } catch (e) {
      console.error("Failed to load tables:", e);
      setSidebarTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  useEffect(() => {
    loadConnections();
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      loadTables(selectedConnection.credentials);
    } else {
      setSidebarTables([]);
    }
  }, [selectedConnection]);

  const handleDeleteConnection = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("delete_connection", { id });
      loadConnections();
      if (selectedConnection?.id === id) {
        setSelectedConnection(null);
        setCurrentView("dashboard");
      }
    } catch (e) {
      console.error("Failed to delete connection:", e);
    }
  };

  const handleSelectConnection = (conn: SavedConnection) => {
    setSelectedConnection(conn);
    setCurrentView("schema");
  };

  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName);
    setCurrentView("table");
  };

  const handleClearData = () => {
    setConnections([]);
    setSelectedConnection(null);
    setCurrentView("dashboard");
  };

  const renderMainContent = () => {
    if (!selectedConnection) {
      return (
        <div className="page-content">
          <h1 className="page-title">Data Atlas</h1>
          <p className="page-subtitle">
            Connect and explore your databases in one place.
          </p>

          <div className="empty-state">
            <h3 className="empty-state-title">Get Started</h3>
            <p className="empty-state-text">
              Add your first database connection to start exploring schemas and running queries.
            </p>
            <button className="btn btn-primary" onClick={() => setShowConnectionModal(true)}>
              <Plus size={16} />
              Add Connection
            </button>
          </div>
        </div>
      );
    }

    switch (currentView) {
      case "schema":
        return (
          <div className="page-content">
            <h1 className="page-title">{selectedConnection.name}</h1>
            <p className="page-subtitle">Explore tables and columns</p>
            <SchemaExplorer
              credentials={selectedConnection.credentials}
              onSelectTable={handleSelectTable}
            />
          </div>
        );

      case "table":
        return (
          <DataTable
            credentials={selectedConnection.credentials}
            tableName={selectedTable}
            onBack={() => setCurrentView("schema")}
          />
        );

      case "query":
        return (
          <div className="page-content">
            <h1 className="page-title">Query Editor</h1>
            <p className="page-subtitle">Run SQL queries against {selectedConnection.name}</p>
            <QueryEditor
              credentials={selectedConnection.credentials}
              connectionId={selectedConnection.id}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      {/* Vertical Tabs Bar */}
      <aside className="tabs-bar">
        <div className="tabs-logo">
          <span>D</span>
        </div>

        <div className="tabs-connections">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className={`tab-item ${selectedConnection?.id === conn.id ? "active" : ""}`}
              onClick={() => handleSelectConnection(conn)}
              title={conn.name}
            >
              <Database size={18} />
              <button
                className="tab-close"
                onClick={(e) => handleDeleteConnection(conn.id, e)}
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
          ))}

          <button
            className="tab-add"
            onClick={() => setShowConnectionModal(true)}
            title="Add Connection"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="tabs-footer">
          <button
            className="tab-settings"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </aside>

      {/* Sidebar (only when connection is selected) */}
      {selectedConnection && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <span className="sidebar-title">{selectedConnection.name}</span>
          </div>

          <div className="sidebar-section-title">Navigate</div>

          <button
            className={`sidebar-item ${currentView === "schema" ? "active" : ""}`}
            onClick={() => setCurrentView("schema")}
          >
            <Table size={16} />
            <span>Schema</span>
          </button>
          <button
            className={`sidebar-item ${currentView === "query" ? "active" : ""}`}
            onClick={() => setCurrentView("query")}
          >
            <Terminal size={16} />
            <span>Query</span>
          </button>

          {/* Tables Section */}
          <div className="sidebar-section-title sidebar-tables-header">
            Tables
            {loadingTables && <RefreshCw size={12} className="spin" />}
          </div>

          <div className="sidebar-tables">
            {sidebarTables.map((table) => (
              <button
                key={table.name}
                className={`sidebar-table-item ${selectedTable === table.name && currentView === "table" ? "active" : ""}`}
                onClick={() => handleSelectTable(table.name)}
              >
                <ChevronRight size={14} />
                <span>{table.name}</span>
              </button>
            ))}
            {sidebarTables.length === 0 && !loadingTables && (
              <div className="sidebar-empty">No tables found</div>
            )}
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="header">
          <div className="breadcrumb">
            <span className="breadcrumb-item">Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">
              {selectedConnection ? selectedConnection.name : "Dashboard"}
            </span>
          </div>
          <div className="header-actions">
            <button className="header-btn">
              <Search size={16} />
            </button>
          </div>
        </header>

        {renderMainContent()}
      </main>

      {/* Modals */}
      <ConnectionModal
        isOpen={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
        onSuccess={loadConnections}
      />

      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onClearData={handleClearData}
      />
    </div>
  );
}

export default App;
