from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from .models import ConnectionProfile
from .forms import ConnectionProfileForm
from .services import ConnectionFactory
import json

def index(request):
    connections = ConnectionProfile.objects.all()
    form = ConnectionProfileForm()
    return render(request, 'explorer/index.html', {'connections': connections, 'form': form})

def add_connection(request):
    if request.method == 'POST':
        form = ConnectionProfileForm(request.POST)
        if form.is_valid():
            # Create instance but don't save to DB yet
            instance = form.save(commit=False)
            
            # Retrieve credentials from the form's processed instance
            # Note: form.save() logic in forms.py already populated instance.credentials
            
            try:
                adapter = ConnectionFactory.get_adapter(instance.db_type, instance.credentials)
                adapter.validate_connection()
                instance.save()
                messages.success(request, "Connection added successfully.")
                return redirect('explorer:index')
            except Exception as e:
                messages.error(request, f"Connection failed: {str(e)}")
                # We want to re-render the form with errors, but since we use the index view for the form,
                # passing it back is tricky without a separate template or context.
                # For now, redirect to index but maybe keep data? 
                # Simplest for this POC: Redirect to index (form clears), but show error.
                # Ideally: Render index with bound form.
                connections = ConnectionProfile.objects.all()
                return render(request, 'explorer/index.html', {'connections': connections, 'form': form})
        else:
            messages.error(request, "Error adding connection.")
            connections = ConnectionProfile.objects.all()
            return render(request, 'explorer/index.html', {'connections': connections, 'form': form})
    return redirect('explorer:index')

def query_view(request, connection_id):
    connection = get_object_or_404(ConnectionProfile, id=connection_id)
    results = None
    error = None
    query_str = ""

    if request.method == 'POST':
        mode = request.POST.get('mode', 'raw')
        
        if mode == 'raw':
            query_str = request.POST.get('query_raw')
            if query_str:
                try:
                    adapter = ConnectionFactory.get_adapter(connection.db_type, connection.credentials)
                    results = adapter.execute_query(query_str)
                except Exception as e:
                    error = str(e)
        elif mode == 'nl':
            query_str = request.POST.get('query_nl')
            # Stub for NL
            if query_str:
                error = "Natural Language Query is not yet implemented. Please use Raw SQL."
                
    return render(request, 'explorer/query.html', {
        'connection': connection,
        'results': results,
        'error': error,
        'query': query_str
    })

def schema_view(request, connection_id):
    connection = get_object_or_404(ConnectionProfile, id=connection_id)
    try:
        adapter = ConnectionFactory.get_adapter(connection.db_type, connection.credentials)
        schema = adapter.get_schema()
        # schema for PG is {table: [cols]}, Mongo {col: [fields]}
        return render(request, 'explorer/schema.html', {'connection': connection, 'schema': schema})
    except Exception as e:
        messages.error(request, f"Error fetching schema: {str(e)}")
        return redirect('explorer:index')

def table_view(request, connection_id, table_name):
    connection = get_object_or_404(ConnectionProfile, id=connection_id)
    try:
        adapter = ConnectionFactory.get_adapter(connection.db_type, connection.credentials)
        # We need a method to get data. validate_query or specific fetch method?
        # execute_query is generic. For PG "SELECT * FROM table LIMIT 50".
        # For others it varies.
        
        if connection.db_type == 'postgres':
             query = f'SELECT * FROM "{table_name}" LIMIT 50'
             results = adapter.execute_query(query)
        elif connection.db_type == 'mongodb':
             query = json.dumps({"collection": table_name, "filter": {}, "limit": 50})
             results = adapter.execute_query(query)
        # Vector DBs usually don't have "tables" in same way, but collection list works.
        elif connection.db_type in ['chromadb', 'weaviate', 'milvus']:
             # Vector DB browse might need specific logic or just "query"
             # For POC let's just show top 10 if possible or redirect to query
             messages.info(request, "Browsing not fully implemented for Vector DBs, use Query interface.")
             return redirect('explorer:query', connection_id=connection.id)
        
        return render(request, 'explorer/table_data.html', {
            'connection': connection, 
            'table_name': table_name, 
            'results': results
        })

    except Exception as e:
        messages.error(request, f"Error loading table data: {str(e)}")
        return redirect('explorer:schema', connection_id=connection.id)

def delete_connection(request, connection_id):
    connection = get_object_or_404(ConnectionProfile, id=connection_id)
    if request.method == 'POST':
        connection.delete()
        messages.success(request, "Connection deleted successfully.")
    return redirect('explorer:index')
