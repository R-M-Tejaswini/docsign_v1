"""
backend/documents/serializers.py


✅ OPTIMIZED: Cache recipients and status per request
"""

from rest_framework import serializers
from .models import Document, DocumentField


class DocumentFieldSerializer(serializers.ModelSerializer):
    """Serializer for DocumentField."""
    
    class Meta:
        model = DocumentField
        fields = [
            'id', 'field_type', 'label', 'recipient', 'page_number',
            'x_pct', 'y_pct', 'width_pct', 'height_pct',
            'required', 'value', 'locked'
        ]
        read_only_fields = ['id', 'locked']


class DocumentFieldUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating DocumentField properties."""
    
    class Meta:
        model = DocumentField
        fields = ['value', 'recipient', 'label', 'required', 'x_pct', 'y_pct', 'width_pct', 'height_pct']


class DocumentSerializer(serializers.ModelSerializer):
    """Full Document serializer."""
    file_url = serializers.SerializerMethodField()
    signed_file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    recipient_status = serializers.SerializerMethodField()
    fields = DocumentFieldSerializer(many=True, read_only=True)
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count', 'created_at', 'updated_at',
            'file', 'file_url', 'signed_file_url', 'fields', 'recipients', 'recipient_status',
            'signed_pdf_sha256'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'signed_pdf_sha256', 'file_url', 'signed_file_url']
    
    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_signed_file_url(self, obj):
        if obj.signed_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.signed_file.url)
            return obj.signed_file.url
        return None
    
    def get_recipients(self, obj):
        # ✅ OPTIMIZED: Use cached recipient status from context
        context_cache = self.context.get('_recipient_status_cache', {})
        if obj.id in context_cache:
            return sorted(list(context_cache[obj.id].keys()))
        
        from documents.services import get_document_service
        service = get_document_service()
        recipients = service.get_recipients(obj)
        return recipients
    
    def get_recipient_status(self, obj):
        # ✅ OPTIMIZED: Use cached status from context
        context_cache = self.context.get('_recipient_status_cache', {})
        if obj.id in context_cache:
            return context_cache[obj.id]
        
        from documents.services import get_document_service
        service = get_document_service()
        status = service.get_recipient_status(obj)
        return status


# Add these new serializers

# ✅ NEW: Minimal list serializers without expensive SerializerMethodFields
class DocumentMinimalListSerializer(serializers.ModelSerializer):
    """Minimal serializer for document lists - no nested data or computed fields."""
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields


class DocumentListSerializer(serializers.ModelSerializer):
    """Serializer for document lists with basic computed fields."""
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count',
            'created_at', 'updated_at', 'file_url'
        ]
        read_only_fields = fields
    
    def get_file_url(self, obj):
        # ✅ Keep simple field URLs only
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


# Keep DocumentDetailSerializer with full data
class DocumentDetailSerializer(serializers.ModelSerializer):
    """Detailed view for single document."""
    file_url = serializers.SerializerMethodField()
    signed_file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    recipient_status = serializers.SerializerMethodField()
    fields = DocumentFieldSerializer(many=True, read_only=True)
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count', 'created_at', 'updated_at',
            'file_url', 'signed_file_url', 'fields', 'recipients', 'recipient_status',
            'signed_pdf_sha256'
        ]
        read_only_fields = fields
    
    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_signed_file_url(self, obj):
        if obj.signed_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.signed_file.url)
            return obj.signed_file.url
        return None
    
    def get_recipients(self, obj):
        # ✅ OPTIMIZED: Use cached recipient status from context
        context_cache = self.context.get('_recipient_status_cache', {})
        if obj.id in context_cache:
            return sorted(list(context_cache[obj.id].keys()))
        
        from documents.services import get_document_service
        service = get_document_service()
        return service.get_recipients(obj)
    
    def get_recipient_status(self, obj):
        # ✅ OPTIMIZED: Use cached status from context
        context_cache = self.context.get('_recipient_status_cache', {})
        if obj.id in context_cache:
            return context_cache[obj.id]
        
        from documents.services import get_document_service
        service = get_document_service()
        return service.get_recipient_status(obj)


class DocumentCreateSerializer(serializers.Serializer):
    """Create document from file or template."""
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    template_id = serializers.IntegerField(required=False, allow_null=True)
    file = serializers.FileField(required=False, allow_null=True)
    
    def validate(self, data):
        if not data.get('template_id') and not data.get('file'):
            raise serializers.ValidationError('Either template_id or file must be provided')
        return data
    
    def create(self, validated_data):
        from templates.models import Template
        
        template_id = validated_data.pop('template_id', None)
        file = validated_data.pop('file', None)
        
        document = Document.objects.create(**validated_data)
        
        if template_id:
            template = Template.objects.get(id=template_id)
            document.file = template.file
            document.save()
            
            fields_to_create = []
            for tfield in template.fields.all():
                fields_to_create.append(
                    DocumentField(
                        document=document,
                        field_type=tfield.field_type,
                        label=tfield.label,
                        recipient=tfield.recipient,
                        page_number=tfield.page_number,
                        x_pct=tfield.x_pct,
                        y_pct=tfield.y_pct,
                        width_pct=tfield.width_pct,
                        height_pct=tfield.height_pct,
                        required=tfield.required
                    )
                )
            if fields_to_create:
                DocumentField.objects.bulk_create(fields_to_create)
        elif file:
            document.file = file
            document.save()
        
        return document