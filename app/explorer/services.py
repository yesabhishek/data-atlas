import abc
import json
import psycopg2
from pymongo import MongoClient
from typing import Any, Dict, List, Optional, Union

class BaseDBAdapter(abc.ABC):
    """Abstract base class for database adapters."""
    
    def __init__(self, credentials: Dict[str, Any]):
        self.credentials = credentials
        self.connection = None

    @abc.abstractmethod
    def connect(self):
        """Establish connection to the database."""
        pass

    @abc.abstractmethod
    def execute_query(self, query: Any) -> Any:
        """Execute a raw query against the database."""
        pass

    @abc.abstractmethod
    def get_schema(self) -> Dict[str, Any]:
        """Retrieve schema information."""
        pass
        
    @abc.abstractmethod
    def get_storage_size(self) -> float:
        """Return proper storage size in MB."""
        return 0.0

    def validate_connection(self) -> bool:
        """Validate the connection credentials."""
        # Default implementation tries to connect
        try:
            self.connect()
            self.close()
            return True
        except Exception:
            raise

    def close(self):
        """Close the connection if applicable."""
        pass


class PostgresAdapter(BaseDBAdapter):
    def connect(self):
        # credentials: host, port, dbname, user, password, sslmode
        # Handle SSL explicitly
        sslmode = self.credentials.get('sslmode', 'prefer')
        connect_args = {**self.credentials}
        if 'sslmode' not in connect_args:
             connect_args['sslmode'] = sslmode
             
        self.connection = psycopg2.connect(**connect_args)

    def validate_connection(self) -> bool:
        """Attempt to connect and return True if successful, False otherwise."""
        try:
            self.connect()
            self.close()
            return True
        except Exception as e:
            # We might want to log or expose the error, but for now just False or re-raise?
            # Re-raising is better so the view can show the error message.
            raise e

    def execute_query(self, query: str) -> List[Dict[str, Any]]:
        self.connect()
        try:
            with self.connection.cursor() as cursor:
                cursor.execute(query)
                if cursor.description:
                    columns = [desc[0] for desc in cursor.description]
                    return [dict(zip(columns, row)) for row in cursor.fetchall()]
                return [{"status": "success", "message": "Query executed successfully"}]
        finally:
            self.close()

    def get_schema(self) -> Dict[str, Any]:
        self.connect()
        try:
            schema_query = """
                SELECT table_name, column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position;
            """
            with self.connection.cursor() as cursor:
                cursor.execute(schema_query)
                rows = cursor.fetchall()
                
            schema = {}
            for table, col, dtype in rows:
                if table not in schema:
                    schema[table] = []
                schema[table].append({"name": col, "type": dtype})
            return schema
        finally:
            self.close()

    def get_storage_size(self) -> float:
        self.connect()
        try:
            # Get total size of the current database
            db_name = self.credentials.get('dbname')
            if not db_name:
                return 0.0
            
            with self.connection.cursor() as cursor:
                cursor.execute(f"SELECT pg_database_size('{db_name}');")
                size_bytes = cursor.fetchone()[0]
                return round(size_bytes / (1024 * 1024), 2) # Convert to MB
        except Exception:
            return 0.0
        finally:
            self.close()

    def close(self):
        if self.connection:
            self.connection.close()


class MongoDBAdapter(BaseDBAdapter):
    def connect(self):
        # credentials: connection_string or (host, port, username, password)
        uri = self.credentials.get("connection_string")
        if uri:
            self.client = MongoClient(uri)
        else:
            # Construct URI or pass kwargs if needed, keeping it simple for now
            self.client = MongoClient(**self.credentials)
        # For Mongo, we usually pick a database. 
        # Credentials should specify 'database_name' or we list dbs.
        self.db_name = self.credentials.get("database_name")
        if self.db_name:
            self.db = self.client[self.db_name]

    def execute_query(self, query: Union[str, Dict]) -> Any:
        self.connect()
        # Querying Mongo via "raw query" is tricky. 
        # We can expect 'query' to be a JSON string like: {"collection": "users", "filter": {"age": {"$gt": 20}}}
        if isinstance(query, str):
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                return {"error": "Invalid JSON query"}
        else:
            query_dict = query

        collection = query_dict.get("collection")
        filter_doc = query_dict.get("filter", {})
        
        if not collection:
            return {"error": "Collection not specified in query"}
            
        cursor = self.db[collection].find(filter_doc)
        # Convert _id to string for serialization
        results = []
        for doc in cursor:
            doc['_id'] = str(doc['_id'])
            results.append(doc)
        return results

    def get_schema(self) -> Dict[str, Any]:
        self.connect()
        collections = self.db.list_collection_names()
        # Mongo is schema-less, but we can sample one document to infer fields
        schema = {}
        for col in collections:
            sample = self.db[col].find_one()
            if sample:
                fields = [{"name": k, "type": type(v).__name__} for k, v in sample.items()]
                schema[col] = fields
            else:
                schema[col] = []
        return schema

    def get_storage_size(self) -> float:
        self.connect()
        try:
            if not self.db:
                return 0.0
            stats = self.db.command("dbstats")
            size_bytes = stats.get("dataSize", 0)
            return round(size_bytes / (1024 * 1024), 2)
        except Exception:
            return 0.0

class ChromaDBAdapter(BaseDBAdapter):
    def connect(self):
        import chromadb
        host = self.credentials.get("host")
        port = self.credentials.get("port")
        path = self.credentials.get("path")
        
        if host and port:
            self.client = chromadb.HttpClient(host=host, port=int(port))
        elif path:
            self.client = chromadb.PersistentClient(path=path)
        else:
            self.client = chromadb.Client()

    def execute_query(self, query: Union[str, Dict]) -> Any:
        self.connect()
        if isinstance(query, str):
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                return {"error": "Invalid JSON query"}
        else:
            query_dict = query
            
        col_name = query_dict.get("collection")
        if not col_name:
            return {"error": "Collection not provided"}
            
        collection = self.client.get_collection(col_name)
        results = collection.query(
            query_texts=query_dict.get("query_texts", []),
            n_results=query_dict.get("n_results", 5)
        )
        return results

    def get_schema(self) -> Dict[str, Any]:
        self.connect()
        collections = self.client.list_collections()
        schema = {}
        for col in collections:
            schema[col.name] = {"count": col.count()}
        return schema
        
    def get_storage_size(self) -> float:
        # Chroma API doesn't easily give "total disk size" via client usually.
        return 0.0


class WeaviateAdapter(BaseDBAdapter):
    def connect(self):
        import weaviate
        url = self.credentials.get("url")
        api_key = self.credentials.get("api_key")
        
        if url:
             args = {"url": url}
             if api_key:
                 args["auth_credentials"] = weaviate.auth.AuthApiKey(api_key)
             self.client = weaviate.connect_to_custom(**args)
        else:
             self.client = weaviate.connect_to_local()

    def execute_query(self, query: Union[str, Dict]) -> Any:
        self.connect()
        try:
            if isinstance(query, str):
                query_dict = json.loads(query)
            else:
                query_dict = query
                
            col_name = query_dict.get("collection")
            near_text = query_dict.get("near_text")
            limit = query_dict.get("limit", 5)
            
            collection = self.client.collections.get(col_name)
            response = collection.query.near_text(
                query=near_text,
                limit=limit
            )
            
            results = []
            for obj in response.objects:
                results.append(obj.properties)
            return results
        finally:
            self.close()

    def get_schema(self) -> Dict[str, Any]:
        self.connect()
        try:
             collections = self.client.collections.list_all()
             schema = {}
             for name, col in collections.items():
                 schema[name] = "Weaviate Collection"
             return schema
        finally:
            self.close()

    def close(self):
        if self.client:
            self.client.close()
            
    def get_storage_size(self) -> float:
        return 0.0


class MilvusAdapter(BaseDBAdapter):
    def connect(self):
        from pymilvus import connections
        alias = "default"
        if connections.has_connection(alias):
            return
            
        host = self.credentials.get("host", "localhost")
        port = self.credentials.get("port", "19530")
        connections.connect(alias=alias, host=host, port=port)

    def execute_query(self, query: Union[str, Dict]) -> Any:
        self.connect()
        from pymilvus import Collection
        
        if isinstance(query, str):
            query_dict = json.loads(query)
        else:
            query_dict = query
            
        col_name = query_dict.get("collection")
        search_data = query_dict.get("data")
        anns_field = query_dict.get("anns_field")
        param = query_dict.get("param", {})
        limit = query_dict.get("limit", 10)
        
        col = Collection(col_name)
        col.load()
        results = col.search(
            data=search_data,
            anns_field=anns_field,
            param=param,
            limit=limit
        )
        
        readable_results = []
        for hits in results:
            for hit in hits:
                readable_results.append({
                    "id": hit.id,
                    "distance": hit.distance,
                })
        return readable_results

    def get_schema(self) -> Dict[str, Any]:
        self.connect()
        from pymilvus import utility
        collections = utility.list_collections()
        schema = {}
        for name in collections:
            schema[name] = {"description": "Milvus Collection"}
        return schema
        
    def get_storage_size(self) -> float:
        return 0.0


class ConnectionFactory:
    @staticmethod
    def get_adapter(db_type: str, credentials: Dict[str, Any]) -> BaseDBAdapter:
        if db_type.lower() == 'postgres':
            return PostgresAdapter(credentials)
        elif db_type.lower() == 'mongodb':
            return MongoDBAdapter(credentials)
        elif db_type.lower() == 'chromadb':
            return ChromaDBAdapter(credentials)
        elif db_type.lower() == 'weaviate':
            return WeaviateAdapter(credentials)
        elif db_type.lower() == 'milvus':
            return MilvusAdapter(credentials)
        else:
            raise ValueError(f"Unsupported database type: {db_type}")
