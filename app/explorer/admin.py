from django.contrib import admin
from .models import ConnectionProfile

@admin.register(ConnectionProfile)
class ConnectionProfileAdmin(admin.ModelAdmin):
    list_display = ('name', 'db_type', 'created_at')
    list_filter = ('db_type', 'created_at')
    search_fields = ('name', 'credentials')
    readonly_fields = ('created_at',)
    
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        # We could enhance the widget for credentials here if we wanted to
        # e.g. using a JSON widget if available, or keep strictly key-value text
        return form

from .models import TelemetryLog

@admin.register(TelemetryLog)
class TelemetryLogAdmin(admin.ModelAdmin):
    list_display = ('session_id', 'db_type', 'query_count', 'time_spent', 'device_os', 'data_volume_mb', 'table_count', 'updated_at')
    list_filter = ('db_type', 'device_os', 'created_at', 'updated_at')
    search_fields = ('session_id', 'user_agent', 'connection_id')
    readonly_fields = ('created_at', 'updated_at', 'time_spent')

    def time_spent(self, obj):
        if obj.updated_at and obj.created_at:
            return obj.updated_at - obj.created_at
        return None
    time_spent.short_description = 'Session Duration'
