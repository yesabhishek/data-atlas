# Data Atlas 🗺️

Data Atlas is a modern, unified interface for exploring and querying multiple types of databases. It provides an UI to manage connections, browse schemas, and execute queries across Relational (Postgres), Document (MongoDB), and Vector (ChromaDB, Weaviate, Milvus) databases.

## Features

-   **Multi-Database Support**: Connect to PostgreSQL, MongoDB, ChromaDB, Weaviate, and Milvus.
-   **Connection Management**:
    -   Dynamic input fields based on database type.
    -   **Automatic Connection Validation** upon saving.
    -   SSL Mode support for PostgreSQL.
-   **Schema Explorer**:
    -   Browse tables (SQL) or collections (NoSQL/Vector).
    -   **Data Preview**: Instantly view the top 50 rows/documents.
-   **Unified Query Interface**:
    -   **Syntax Highlighting**: Built-in editor with syntax coloring for SQL and JSON.
    -   **Dual Modes**: Switch between "Raw SQL/JSON" and "Natural Language" (Experimental Stub).
    -   **Visual Results**: Results rendered in clean, responsive tables or JSON viewers.
-   **Premium UI/UX**:
    -   **MacOS-Style Design**: Clean white theme, rounded corners, soft shadows, and system typography.
    -   Responsive and intuitive layout.

## Getting Started

### Prerequisites

-   Python 3.8+
-   Pip (Python Package Manager)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/data-atlas.git
    cd data-atlas
    ```

2.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
    *(Note: If strict requirements are not listed, install the core packages manually per `pyproject.toml` or similar)*:
    ```bash
    pip install django psycopg2-binary pymongo chromadb weaviate-client pymilvus
    ```

3.  **Run Migrations:**
    ```bash
    cd app
    python manage.py migrate
    ```

4.  **Start the Server:**
    ```bash
    python manage.py runserver
    ```

5.  **Access the App:**
    Open your browser and navigate to `http://127.0.0.1:8000/`.

## Architecture

-   **Backend**: Django (Python)
-   **Frontend**: Django Templates + Vanilla JS + CSS (MacOS Light Theme)
-   **Database Adapters**: Modular adapter pattern handling specific driver logic for Postgres, Mongo, etc.

## Usage Guide

1.  **Add a Connection**: Click "Add New Connection", select your DB type, and fill in the fields (Host, Port, Creds).
2.  **Explore**: Click the "Explore" button on a connection card to view its schema.
3.  **Query**: Click "Query" to open the editor. Type SQL for Postgres or JSON for other DBs.

## License

MIT License.
