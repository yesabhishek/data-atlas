from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from .models import ConnectionProfile, TelemetryLog, SavedQuery
from .forms import ConnectionProfileForm
from .services import ConnectionFactory
import json
import time

# from django.contrib.auth.decorators import login_required # Removed

def get_session_key(request):
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key

def index(request):
    session_key = get_session_key(request)
    connections = ConnectionProfile.objects.filter(session_id=session_key)
    form = ConnectionProfileForm()
    return render(request, 'explorer/index.html', {'connections': connections, 'form': form})

def add_connection(request):
    session_key = get_session_key(request)
    if request.method == 'POST':
        form = ConnectionProfileForm(request.POST)
        if form.is_valid():
            instance = form.save(commit=False)
            instance.session_id = session_key
            
            try:
                adapter = ConnectionFactory.get_adapter(instance.db_type, form.cleaned_credentials)
                adapter.validate_connection()
                try:
                    schema = adapter.get_schema()
                    instance.schema_metadata = schema
                except Exception as e:
                    print(f"Schema fetch failed: {e}")
                
                instance.save()
                
                # Telemetry Capture
                try:
                    user_agent = request.META.get('HTTP_USER_AGENT', '')
                    device_os = 'Unknown'
                    if 'Mac' in user_agent: device_os = 'Mac'
                    elif 'Win' in user_agent: device_os = 'Windows'
                    elif 'Linux' in user_agent: device_os = 'Linux'
                    elif 'Mobile' in user_agent: device_os = 'Mobile'
                    
                    # Fetch storage size
                    volume = adapter.get_storage_size()
                    
                    table_count = len(instance.schema_metadata.keys()) if instance.schema_metadata else 0
                    
                    TelemetryLog.objects.create(
                        session_id=session_key,
                        db_type=instance.db_type,
                        table_count=table_count,
                        data_volume_mb=volume,
                        device_os=device_os,
                        user_agent=user_agent
                    )
                except Exception as e:
                    print(f"Telemetry failed: {e}")

                messages.success(request, "Connection added successfully.")
                return redirect('explorer:index')
            except Exception as e:
                messages.error(request, f"Connection failed: {str(e)}")
                connections = ConnectionProfile.objects.filter(session_id=session_key)
                return render(request, 'explorer/index.html', {'connections': connections, 'form': form})
        else:
            messages.error(request, "Error adding connection.")
            connections = ConnectionProfile.objects.filter(session_id=session_key)
            return render(request, 'explorer/index.html', {'connections': connections, 'form': form})
    return redirect('explorer:index')

def query_view(request, connection_id):
    session_key = get_session_key(request)
    connection = get_object_or_404(ConnectionProfile, id=connection_id, session_id=session_key)
    results = None
    error = None
    query_str = ""
    duration = None

    if request.method == 'POST':
        mode = request.POST.get('mode', 'raw')
        
        if mode == 'raw':
            query_str = request.POST.get('query_raw')
            if query_str:
                try:
                    start_time = time.time()
                    adapter = ConnectionFactory.get_adapter(connection.db_type, connection.get_credentials())
                    results = adapter.execute_query(query_str)
                    duration = round(time.time() - start_time, 3)
                except Exception as e:
                    error = str(e)
        elif mode == 'nl':
            query_str = request.POST.get('query_nl')
            if query_str:
                error = "Natural Language Query is not yet implemented. Please use Raw SQL."
                
    saved_queries = SavedQuery.objects.filter(session_id=session_key).order_by('-created_at')
    all_connections = ConnectionProfile.objects.filter(session_id=session_key).order_by('created_at')

    return render(request, 'explorer/query.html', {
        'connection': connection,
        'results': results,
        'error': error,
        'query': query_str,
        'saved_queries': saved_queries,
        'all_connections': all_connections,
        'duration': duration
    })

def schema_view(request, connection_id):
    session_key = get_session_key(request)
    connection = get_object_or_404(ConnectionProfile, id=connection_id, session_id=session_key)
    try:
        adapter = ConnectionFactory.get_adapter(connection.db_type, connection.get_credentials())
        schema = adapter.get_schema()
        return render(request, 'explorer/schema.html', {'connection': connection, 'schema': schema})
    except Exception as e:
        messages.error(request, f"Error fetching schema: {str(e)}")
        return redirect('explorer:index')

def table_view(request, connection_id, table_name):
    session_key = get_session_key(request)
    connection = get_object_or_404(ConnectionProfile, id=connection_id, session_id=session_key)
    try:
        adapter = ConnectionFactory.get_adapter(connection.db_type, connection.get_credentials())
        
        if connection.db_type == 'postgres':
             query = f'SELECT * FROM "{table_name}" LIMIT 50'
             results = adapter.execute_query(query)
        elif connection.db_type == 'mongodb':
             query = json.dumps({"collection": table_name, "filter": {}, "limit": 50})
             results = adapter.execute_query(query)
        elif connection.db_type in ['chromadb', 'weaviate', 'milvus']:
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
    session_key = get_session_key(request)
    connection = get_object_or_404(ConnectionProfile, id=connection_id, session_id=session_key)
    if request.method == 'POST':
        connection.delete()
        messages.success(request, "Connection deleted successfully.")
    return redirect('explorer:index')

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt
def flush_session(request):
    if request.method == 'POST':
        session_key = request.session.session_key
        if session_key:
            # Delete connections strictly
            ConnectionProfile.objects.filter(session_id=session_key).delete()
            SavedQuery.objects.filter(session_id=session_key).delete()
            # Flush session to ensure new key on next visit
            request.session.flush()
    return JsonResponse({'status': 'ok'})

def save_query(request):
    session_key = get_session_key(request)
    if request.method == 'POST':
        name = request.POST.get('name')
        sql = request.POST.get('query')
        if name and sql:
            SavedQuery.objects.create(session_id=session_key, name=name, sql=sql)
            messages.success(request, "Query saved!")
        else:
            messages.error(request, "Name and Query are required.")
    
    # Redirect back to where we came from
    referer = request.META.get('HTTP_REFERER')
    return redirect(referer if referer else 'explorer:index')

def delete_query(request, query_id):
    session_key = get_session_key(request)
    query = get_object_or_404(SavedQuery, id=query_id, session_id=session_key)
    if request.method == 'POST':
        query.delete()
        messages.success(request, "Query deleted.")
    
    # Redirect back
    referer = request.META.get('HTTP_REFERER')
    return redirect(referer if referer else 'explorer:index')
