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
    list_display = ('session_id', 'db_type', 'device_os', 'data_volume_mb', 'table_count', 'created_at')
    list_filter = ('db_type', 'device_os', 'created_at')
    search_fields = ('session_id', 'user_agent')
    readonly_fields = ('created_at',)
