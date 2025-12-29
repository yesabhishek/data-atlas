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
    credentials = models.JSONField(help_text="JSON containing host, port, etc.")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.db_type})"
