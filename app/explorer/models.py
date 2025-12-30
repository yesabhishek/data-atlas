from django.db import models
import uuid

class ConnectionProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    db_type = models.CharField(max_length=50, choices=[
        ('postgres', 'PostgreSQL'),
        ('mongodb', 'MongoDB'),
        ('chromadb', 'ChromaDB'),
        ('weaviate', 'Weaviate'),
        ('milvus', 'Milvus'),
    ])
    encrypted_credentials = models.TextField(blank=True, null=True, help_text="Encrypted credentials string")
    schema_metadata = models.JSONField(default=dict, blank=True, help_text="Cached schema information")
    session_id = models.CharField(max_length=40, db_index=True, null=True, blank=True, help_text="Django Session Key")
    # user = models.ForeignKey('auth.User', on_delete=models.CASCADE, null=True, blank=True) # Removing user
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.db_type})"

    def set_credentials(self, creds_dict):
        """Encrypts and stores credentials."""
        import json
        from cryptography.fernet import Fernet
        from django.conf import settings
        import base64
        
        # Ensure we have a valid key. For POC using a fixed dev key derivation if not set.
        # In prod, settings.SECRET_KEY should be 32 url-safe base64 bytes or we hash it.
        # Simple derivation:
        key = base64.urlsafe_b64encode(settings.SECRET_KEY[:32].encode().ljust(32, b'x'))
        f = Fernet(key)
        
        if not creds_dict:
            return

        json_bytes = json.dumps(creds_dict).encode('utf-8')
        self.encrypted_credentials = f.encrypt(json_bytes).decode('utf-8')

    def get_credentials(self):
        """Decrypts and returns credentials dict."""
        import json
        from cryptography.fernet import Fernet
        from django.conf import settings
        import base64

        if not self.encrypted_credentials:
            return {}
            
        key = base64.urlsafe_b64encode(settings.SECRET_KEY[:32].encode().ljust(32, b'x'))
        f = Fernet(key)
        
        try:
            decrypted = f.decrypt(self.encrypted_credentials.encode())
            return json.loads(decrypted.decode())
        except Exception:
            return {} # Fail safe


class TelemetryLog(models.Model):
    session_id = models.CharField(max_length=40, db_index=True)
    db_type = models.CharField(max_length=20)
    table_count = models.IntegerField(default=0)
    data_volume_mb = models.FloatField(default=0.0, help_text="Size in MB")
    device_os = models.CharField(max_length=50, blank=True, null=True)
    user_agent = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.session_id} - {self.db_type} - {self.created_at}"
