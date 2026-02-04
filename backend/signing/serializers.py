"""
backend/signing/serializers.py


Signing token and signature event serializers.
"""

from rest_framework import serializers
from django.conf import settings
from documents.models import Document
from .models import SigningToken, SignatureEvent


class SignatureEventSerializer(serializers.ModelSerializer):
    """Serializer for SignatureEvent."""
    signer_name_display = serializers.CharField(source='signer_name', read_only=True)
    is_verified = serializers.SerializerMethodField()
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
        """Check if the signature is valid."""
        from signing.services import get_signature_service
        service = get_signature_service()
        return service.is_signature_valid(obj)


class SigningTokenSerializer(serializers.ModelSerializer):
    """Serializer for creating and viewing signing tokens."""
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
        from signing.services import get_token_service
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
        """✅ OPTIMIZED: Use cached status from context."""
        if obj.scope == 'sign' and obj.recipient:
            # ✅ Check cache first
            context_cache = self.context.get('_recipient_status_cache', {})
            if obj.document.id in context_cache:
                return context_cache[obj.document.id].get(obj.recipient, None)
            
            # ✅ Fallback: compute once
            from documents.services import get_document_service
            service = get_document_service()
            status = service.get_recipient_status(obj.document)
            return status.get(obj.recipient, None)
        return None


class PublicSignPayloadSerializer(serializers.Serializer):
    """Serializer for public sign page payload."""
    signer_name = serializers.CharField(max_length=255)
    field_values = serializers.ListField(
        child=serializers.DictField(child=serializers.CharField())
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
    """Serializer for response after successful signing."""
    signature_id = serializers.IntegerField()
    message = serializers.CharField()
    document_status = serializers.CharField()
    recipient = serializers.CharField()
    link_converted_to_view = serializers.BooleanField()