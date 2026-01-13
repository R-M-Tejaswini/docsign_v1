from rest_framework import serializers
from django.utils import timezone
from django.conf import settings
from .models import (
    Document, DocumentVersion, DocumentField,
    SigningToken, SignatureEvent
)
from templates.models import TemplateField
from documents.services import calculate_expiry


class DocumentFieldSerializer(serializers.ModelSerializer):
    """Serializer for DocumentField."""
    
    class Meta:
        model = DocumentField
        fields = [
            'id', 'field_type', 'label', 'page_number',
            'x_pct', 'y_pct', 'width_pct', 'height_pct',
            'required', 'value', 'locked'
        ]
        read_only_fields = ['id', 'locked']


class DocumentFieldUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating document fields (draft only)."""
    
    class Meta:
        model = DocumentField
        fields = ['value']
    
    def validate(self, data):
        """Ensure field is not locked and version is draft."""
        field = self.instance
        version = field.version
        
        if version.status != 'draft':
            raise serializers.ValidationError(
                'Cannot edit fields in a locked or completed version'
            )
        if field.locked:
            raise serializers.ValidationError(
                'This field has been locked and cannot be edited'
            )
        return data


class DocumentVersionSerializer(serializers.ModelSerializer):
    """Serializer for DocumentVersion with fields."""
    fields = DocumentFieldSerializer(many=True, read_only=True)
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = DocumentVersion
        fields = [
            'id', 'version_number', 'status', 'page_count',
            'created_at', 'fields', 'file_url'
        ]
    
    def get_file_url(self, obj):
        """Get the full URL for the PDF file."""
        request = self.context.get('request')
        if obj.file:
            if request:
                return request.build_absolute_uri(obj.file.url)
            else:
                # Fallback if request not in context
                return f"{settings.BASE_URL}{obj.file.url}"
        return None


class DocumentDetailSerializer(serializers.ModelSerializer):
    """Serializer for Document detail with latest version."""
    latest_version = serializers.SerializerMethodField()
    versions = DocumentVersionSerializer(many=True, read_only=True)
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'created_from_template', 'created_at',
            'latest_version', 'versions'
        ]
    
    def get_latest_version(self, obj):
        """Get the latest version of the document."""
        latest = obj.versions.first()
        if latest:
            serializer = DocumentVersionSerializer(
                latest, 
                context=self.context
            )
            return serializer.data
        return None


class DocumentListSerializer(serializers.ModelSerializer):
    """Serializer for Document list view."""
    
    class Meta:
        model = Document
        fields = ['id', 'title', 'created_from_template', 'created_at']


class DocumentCreateSerializer(serializers.Serializer):
    """Serializer for creating a document."""
    title = serializers.CharField(max_length=255)
    created_from_template = serializers.IntegerField(required=False, allow_null=True)
    file = serializers.FileField(required=False, allow_null=True)
    
    def validate(self, data):
        """Ensure either template or file is provided."""
        if not data.get('created_from_template') and not data.get('file'):
            raise serializers.ValidationError(
                'Either a template or a file must be provided'
            )
        return data
    
    def create(self, validated_data):
        """Create document with initial version."""
        from templates.models import Template
        
        file = validated_data.pop('file', None)
        template_id = validated_data.pop('created_from_template', None)
        template = None
        
        if template_id:
            try:
                template = Template.objects.get(id=template_id)
            except Template.DoesNotExist:
                raise serializers.ValidationError('Template not found')
        
        # Create document
        document = Document.objects.create(**validated_data)
        
        # Create initial version
        if file:
            version = DocumentVersion.objects.create(
                document=document,
                file=file,
                version_number=1,
                status='draft'
            )
            
            # Copy template fields if template was used
            if template:
                for tfield in template.fields.all():
                    DocumentField.objects.create(
                        version=version,
                        field_type=tfield.field_type,
                        label=tfield.label,
                        page_number=tfield.page_number,
                        x_pct=tfield.x_pct,
                        y_pct=tfield.y_pct,
                        width_pct=tfield.width_pct,
                        height_pct=tfield.height_pct,
                        required=tfield.required
                    )
        elif template:
            # If only template provided, use its file
            version = DocumentVersion.objects.create(
                document=document,
                file=template.file,
                version_number=1,
                status='draft'
            )
            
            # Copy template fields
            for tfield in template.fields.all():
                DocumentField.objects.create(
                    version=version,
                    field_type=tfield.field_type,
                    label=tfield.label,
                    page_number=tfield.page_number,
                    x_pct=tfield.x_pct,
                    y_pct=tfield.y_pct,
                    width_pct=tfield.width_pct,
                    height_pct=tfield.height_pct,
                    required=tfield.required
                )
        
        return document


class SigningTokenSerializer(serializers.ModelSerializer):
    """Serializer for SigningToken."""
    public_url = serializers.SerializerMethodField()
    signatures = serializers.SerializerMethodField()
    version_id = serializers.IntegerField(source='version.id', read_only=True)
    
    class Meta:
        model = SigningToken
        fields = [
            'id', 'token', 'version_id', 'scope', 'single_use', 'used',
            'revoked', 'expires_at', 'created_at', 'public_url', 'signatures'
        ]
        read_only_fields = [
            'id', 'token', 'used', 'created_at', 'public_url', 'signatures', 'version_id'
        ]
    
    def get_public_url(self, obj):
        """Generate public signing URL."""
        from django.conf import settings
        base_url = settings.FRONTEND_BASE_URL
        return f'{base_url}/sign/{obj.token}'
    
    def get_signatures(self, obj):
        """Get all signatures associated with this token."""
        signature_events = obj.signature_events.all()
        return SignatureEventSerializer(signature_events, many=True).data


class SigningTokenCreateSerializer(serializers.Serializer):
    """Serializer for creating a signing token."""
    scope = serializers.ChoiceField(choices=['view', 'sign'])
    single_use = serializers.BooleanField(default=True)
    expires_in_days = serializers.IntegerField(required=False, allow_null=True)
    
    def create(self, validated_data):
        """Create a new signing token."""
        version = self.context.get('version')
        expires_in_days = validated_data.pop('expires_in_days', None)
        
        token = SigningToken.generate_token(
            version=version,
            scope=validated_data['scope'],
            single_use=validated_data['single_use'],
            expires_in_days=expires_in_days
        )
        return token


class SignatureEventSerializer(serializers.ModelSerializer):
    """Serializer for SignatureEvent."""
    signer_name_display = serializers.CharField(source='signer_name', read_only=True)
    
    class Meta:
        model = SignatureEvent
        fields = [
            'id', 'signer_name_display', 'signed_at',
            'ip_address', 'document_sha256', 'field_values'
        ]


class PublicSignPayloadSerializer(serializers.Serializer):
    """Serializer for public signing payload."""
    signer_name = serializers.CharField(max_length=255)
    field_values = serializers.ListField(
        child=serializers.DictField(
            child=serializers.CharField()
        )
    )
    
    def validate_field_values(self, value):
        """Validate field values format."""
        for item in value:
            if 'field_id' not in item or 'value' not in item:
                raise serializers.ValidationError(
                    'Each field value must have field_id and value'
                )
        return value


class PublicSignResponseSerializer(serializers.Serializer):
    """Serializer for public signing response."""
    signature_id = serializers.IntegerField()
    message = serializers.CharField()
    version_status = serializers.CharField()
    is_single_use = serializers.BooleanField()