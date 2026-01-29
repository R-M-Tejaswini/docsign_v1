"""
backend/documents/serializers.py
"""

import secrets

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from templates.models import TemplateField
from .models import (
    Document, DocumentField,
    SigningToken, SignatureEvent, Webhook, WebhookEvent, WebhookDeliveryLog
)


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
    
    def validate(self, data):
        """Ensure the field is editable given version and lock state."""
        field = self.instance
        version = field.version
        
        if version.status != 'draft':
            if 'recipient' in data or 'label' in data or 'required' in data:
                raise serializers.ValidationError(
                    'Cannot edit field properties in locked documents'
                )
            if field.locked:
                raise serializers.ValidationError(
                    'This field has been signed and cannot be edited'
                )
        
        if 'recipient' in data and not data['recipient'].strip():
            raise serializers.ValidationError({'recipient': 'Recipient must be specified'})
        
        return data


class SignatureEventSerializer(serializers.ModelSerializer):
    """Serializer for SignatureEvent."""
    signer_name_display = serializers.CharField(source='signer_name', read_only=True)
    is_verified = serializers.SerializerMethodField()
    # ✅ ADDED: Explicitly define ip_address field
    ip_address = serializers.CharField(allow_null=True, allow_blank=True, read_only=True)
    
    class Meta:
        model = SignatureEvent
        fields = [
            'id', 'recipient', 'signer_name_display', 'signed_at',
            'ip_address', 'user_agent', 'document_sha256', 'event_hash',
            'field_values', 'is_verified'
        ]
        read_only_fields = fields
    
    def get_is_verified(self, obj):
        """Check if the signature is valid (not tampered)."""
        from .services import get_signature_service
        service = get_signature_service()
        return service.is_signature_valid(obj)


class DocumentSerializer(serializers.ModelSerializer):
    """Unified Document serializer replacing DocumentVersion serializers."""
    file_url = serializers.SerializerMethodField()
    signed_file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    recipient_status = serializers.SerializerMethodField()
    fields = DocumentFieldSerializer(many=True, read_only=True)
    signatures = SignatureEventSerializer(many=True, read_only=True)
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count', 'created_at', 'updated_at',
            'file', 'file_url', 'signed_file_url', 'fields', 'recipients', 'recipient_status',
            'signatures', 'signed_pdf_sha256'
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
        if hasattr(obj, '_recipients_cache'):
            return obj._recipients_cache
        from .services import get_document_service
        service = get_document_service()
        return service.get_recipients(obj)
    
    def get_recipient_status(self, obj):
        if hasattr(obj, '_recipient_status_cache'):
            return obj._recipient_status_cache
        from .services import get_document_service
        service = get_document_service()
        return service.get_recipient_status(obj)


class DocumentListSerializer(serializers.ModelSerializer):
    """Serializer for document list views."""
    file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    recipient_status = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count',
            'created_at', 'updated_at',
            'file_url', 'recipients', 'recipient_status'  # ✅ ADDED
        ]
        read_only_fields = fields
    
    def get_file_url(self, obj):
        """Get absolute URL for document file."""
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_recipients(self, obj):
        """Get all unique recipients from fields."""
        return list(obj.fields.values_list('recipient', flat=True).distinct())
    
    def get_recipient_status(self, obj):
        """Get signing status per recipient."""
        from .services import get_document_service
        service = get_document_service()
        return service.get_recipient_status(obj)


class DocumentDetailSerializer(serializers.ModelSerializer):
    """Detailed view for single document."""
    file_url = serializers.SerializerMethodField()
    signed_file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    recipient_status = serializers.SerializerMethodField()
    fields = DocumentFieldSerializer(many=True, read_only=True)
    signatures = SignatureEventSerializer(many=True, read_only=True)
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count', 'created_at', 'updated_at',
            'file_url', 'signed_file_url', 'fields', 'recipients', 'recipient_status',
            'signatures', 'signed_pdf_sha256'
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
        if hasattr(obj, '_recipients_cache'):
            return obj._recipients_cache
        from .services import get_document_service
        service = get_document_service()
        return service.get_recipients(obj)
    
    def get_recipient_status(self, obj):
        if hasattr(obj, '_recipient_status_cache'):
            return obj._recipient_status_cache
        from .services import get_document_service
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
        """✅ CONSOLIDATED: Creates Document only (no more version)"""
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


class SigningTokenSerializer(serializers.ModelSerializer):
    """✅ CONSOLIDATED: Updated to use Document instead of DocumentVersion"""
    public_url = serializers.SerializerMethodField()
    document_id = serializers.IntegerField(source='document.id', read_only=True)
    recipient_status = serializers.SerializerMethodField()
    
    # Fields for creation
    scope = serializers.ChoiceField(choices=['view', 'sign'], write_only=False)
    recipient = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    expires_in_days = serializers.IntegerField(required=False, allow_null=True, min_value=1, write_only=True)
    
    class Meta:
        model = SigningToken
        fields = [
            'id', 'token', 'document_id', 'scope', 'recipient', 'used', 'revoked',
            'expires_at', 'created_at', 'public_url', 'recipient_status', 'expires_in_days'
        ]
        read_only_fields = ['id', 'token', 'used', 'created_at', 'public_url', 'document_id', 'recipient_status', 'expires_at']
    
    def validate(self, data):
        if self.instance is None:  # create only
            if data.get('scope') == 'sign' and not data.get('recipient'):
                raise serializers.ValidationError({'recipient': 'Recipient required for sign links'})
        return data
    
    def create(self, validated_data):
        from .services import get_token_service
        document = self.context.get('document')
        
        service = get_token_service()
        token = service.generate_token(
            document=document,
            scope=validated_data.get('scope', 'view'),
            recipient=validated_data.get('recipient'),
            expires_in_days=validated_data.get('expires_in_days')
        )
        return token
    
    def get_public_url(self, obj):
        base_url = settings.FRONTEND_BASE_URL
        return f'{base_url}/sign/{obj.token}'
    
    def get_recipient_status(self, obj):
        if obj.scope == 'sign' and obj.recipient:
            from .services import get_document_service
            service = get_document_service()
            status = service.get_recipient_status(obj.document)
            return status.get(obj.recipient, None)
        return None


class PublicSignPayloadSerializer(serializers.Serializer):
    """Serializer for payload sent by public sign page."""
    signer_name = serializers.CharField(max_length=255)
    field_values = serializers.ListField(
        child=serializers.DictField(
            child=serializers.CharField()
        )
    )
    
    def validate_field_values(self, value):
        """Ensure each entry contains field_id and value keys."""
        for item in value:
            if 'field_id' not in item or 'value' not in item:
                raise serializers.ValidationError(
                    'Each field value must have field_id and value'
                )
        return value


class PublicSignResponseSerializer(serializers.Serializer):
    """Serializer for the response after successful signing."""
    signature_id = serializers.IntegerField()
    message = serializers.CharField()
    document_status = serializers.CharField()  # ✅ FIXED: Changed from 'version_status'
    recipient = serializers.CharField()
    link_converted_to_view = serializers.BooleanField()


class WebhookDeliveryLogSerializer(serializers.ModelSerializer):
    """Serializer for webhook delivery log entries."""
    
    class Meta:
        model = WebhookDeliveryLog
        fields = [
            'id',
            'status_code',
            'response_body',
            'error_message',
            'duration_ms',
            'created_at',
        ]
        read_only_fields = fields


class WebhookEventSerializer(serializers.ModelSerializer):
    """Serializer for webhook events."""
    delivery_logs = WebhookDeliveryLogSerializer(many=True, read_only=True)
    
    class Meta:
        model = WebhookEvent
        fields = [
            'id',
            'webhook',
            'event_type',
            'payload',
            'status',
            'attempt_count',
            'last_error',
            'created_at',
            'delivered_at',
            'next_retry_at',
            'delivery_logs',
        ]
        read_only_fields = fields


class WebhookSerializer(serializers.ModelSerializer):
    """Serializer for webhook configuration."""
    events_list = serializers.SerializerMethodField()
    success_rate = serializers.SerializerMethodField()
    
    class Meta:
        model = Webhook
        fields = [
            'id',
            'url',
            'subscribed_events',
            'events_list',
            'secret',
            'is_active',
            'created_at',
            'updated_at',
            'last_triggered_at',
            'total_deliveries',
            'successful_deliveries',
            'failed_deliveries',
            'success_rate',
        ]
        read_only_fields = [
            'id',
            'secret',
            'created_at',
            'updated_at',
            'last_triggered_at',
            'total_deliveries',
            'successful_deliveries',
            'failed_deliveries',
        ]
    
    def get_events_list(self, obj):
        """Return human-readable event names."""
        return [
            dict(Webhook.EVENTS).get(event, event)
            for event in obj.subscribed_events
        ]
    
    def get_success_rate(self, obj):
        """Compute the percentage success rate."""
        if obj.total_deliveries == 0:
            return None
        return round((obj.successful_deliveries / obj.total_deliveries) * 100, 2)