from django.urls import path
from . import views

app_name = 'explorer'

urlpatterns = [
    path('', views.index, name='index'),
    path('add/', views.add_connection, name='add_connection'),
    path('query/<uuid:connection_id>/', views.query_view, name='query'),
    path('schema/<uuid:connection_id>/', views.schema_view, name='schema'),
    path('table/<uuid:connection_id>/<str:table_name>/', views.table_view, name='table_data'),
    path('delete/<uuid:connection_id>/', views.delete_connection, name='delete_connection'),
]
