from django import forms
from .models import ConnectionProfile

class ConnectionProfileForm(forms.ModelForm):
    # Common fields
    host = forms.CharField(required=False)
    port = forms.IntegerField(required=False)
    username = forms.CharField(required=False)
    password = forms.CharField(widget=forms.PasswordInput, required=False)
    database = forms.CharField(required=False, label="Database Name")
    sslmode = forms.ChoiceField(choices=[('disable', 'Disable'), ('prefer', 'Prefer'), ('require', 'Require')], required=False, initial='prefer', label="SSL Mode")
    
    # Specific fields
    mongo_uri = forms.CharField(required=False, label="MongoDB URI")
    weaviate_url = forms.CharField(required=False, label="Weaviate Cluster URL")
    
    # Generic (for others if needed, though most covered above)
    api_key = forms.CharField(widget=forms.PasswordInput, required=False, label="API Key")
    path = forms.CharField(required=False, label="File Path (for local DBs)")

    class Meta:
        model = ConnectionProfile
        fields = ['name', 'db_type'] 

    def clean(self):
        cleaned_data = super().clean()
        db_type = cleaned_data.get('db_type')
        credentials = {}
        
        # Validation logic based on db_type
        if db_type == 'postgres':
            if not all([cleaned_data.get('host'), cleaned_data.get('port'), cleaned_data.get('database'), cleaned_data.get('username')]):
                if not cleaned_data.get('host'): self.add_error('host', 'Required for Postgres')
            credentials = {
                'host': cleaned_data.get('host'),
                'port': cleaned_data.get('port'),
                'dbname': cleaned_data.get('database'),
                'user': cleaned_data.get('username'),
                'password': cleaned_data.get('password'),
                'sslmode': cleaned_data.get('sslmode'),
            }
        elif db_type == 'mongodb':
            if not cleaned_data.get('mongo_uri') and not cleaned_data.get('host'):
                 raise forms.ValidationError("MongoDB URI (preferred) or Host is required.")
            if cleaned_data.get('mongo_uri'):
                credentials = {'connection_string': cleaned_data.get('mongo_uri')}
                if cleaned_data.get('database'):
                    credentials['database_name'] = cleaned_data.get('database')
            else:
                credentials = {
                    'host': cleaned_data.get('host'),
                    'port': cleaned_data.get('port'),
                    'username': cleaned_data.get('username'),
                    'password': cleaned_data.get('password'),
                }
                if cleaned_data.get('database'):
                    credentials['database_name'] = cleaned_data.get('database')
        elif db_type == 'weaviate':
            if not cleaned_data.get('weaviate_url') and not cleaned_data.get('host'): 
                raise forms.ValidationError("Weaviate Cluster URL is required.")
            if cleaned_data.get('weaviate_url'):
                credentials = {'url': cleaned_data.get('weaviate_url')}
            if cleaned_data.get('api_key'):
                credentials['api_key'] = cleaned_data.get('api_key')
        elif db_type == 'chromadb':
            credentials = {}
            if cleaned_data.get('path'):
                credentials['path'] = cleaned_data.get('path')
            else:
                 credentials['host'] = cleaned_data.get('host')
                 credentials['port'] = cleaned_data.get('port')
        elif db_type == 'milvus':
            credentials = {}
            credentials['host'] = cleaned_data.get('host')
            credentials['port'] = cleaned_data.get('port')

        self.cleaned_credentials = credentials
        return cleaned_data

    def save(self, commit=True):
        instance = super().save(commit=False)
        # Use encryption method
        if hasattr(self, 'cleaned_credentials'):
            instance.set_credentials(self.cleaned_credentials)
        if commit:
            instance.save()
        return instance
