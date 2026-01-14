from rest_framework import serializers
from django.utils import timezone
from django.conf import settings
from templates.models import TemplateField
from .models import (
    Document, DocumentVersion, DocumentField,
    SigningToken, SignatureEvent
)



class DocumentFieldSerializer(serializers.ModelSerializer):
    """Serializer for DocumentField with recipient info."""
    
    class Meta:
        model = DocumentField
        fields = [
            'id', 'field_type', 'label', 'recipient', 'page_number',
            'x_pct', 'y_pct', 'width_pct', 'height_pct',
            'required', 'value', 'locked'
        ]
        read_only_fields = ['id', 'locked']


class DocumentFieldUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating document fields (draft only)."""
    
    class Meta:
        model = DocumentField
        fields = ['value', 'recipient', 'label', 'required', 'x_pct', 'y_pct', 'width_pct', 'height_pct']
    
    def validate(self, data):
        """Ensure field is editable (draft mode only)."""
        field = self.instance
        version = field.version
        
        if version.status != 'draft':
            # In locked mode, can only update value if field is not locked
            if 'recipient' in data or 'label' in data or 'required' in data:
                raise serializers.ValidationError(
                    'Cannot edit field properties in locked documents'
                )
            if field.locked:
                raise serializers.ValidationError(
                    'This field has been signed and cannot be edited'
                )
        
        # Validate recipient is assigned
        if 'recipient' in data and not data['recipient'].strip():
            raise serializers.ValidationError({'recipient': 'Recipient must be specified'})
        
        return data


class DocumentVersionSerializer(serializers.ModelSerializer):
    """Serializer for DocumentVersion with fields and recipient status."""
    fields = DocumentFieldSerializer(many=True, read_only=True)
    file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    recipient_status = serializers.SerializerMethodField()
    
    class Meta:
        model = DocumentVersion
        fields = [
            'id', 'version_number', 'status', 'page_count',
            'file', 'file_url', 'created_at', 'fields',
            'recipients', 'recipient_status'
        ]
        read_only_fields = ['id', 'version_number', 'page_count', 'created_at']
    
    def get_file_url(self, obj):
        """Generate file URL."""
        if obj.file:
            # Return just the relative path - frontend will prepend the API base URL
            return obj.file.url  # This returns /media/documents/1/v1/file.pdf
        return None
    
    def get_recipients(self, obj):
        """Get list of unique recipients."""
        return obj.get_recipients()
    
    def get_recipient_status(self, obj):
        """Get signing status per recipient."""
        return obj.get_recipient_status()


class DocumentDetailSerializer(serializers.ModelSerializer):
    """Serializer for Document detail with latest version."""
    latest_version = DocumentVersionSerializer(read_only=True)
    
    class Meta:
        model = Document
        fields = ['id', 'title', 'description', 'created_at', 'updated_at', 'latest_version']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def to_representation(self, instance):
        """Include latest version."""
        data = super().to_representation(instance)
        latest = instance.versions.order_by('-version_number').first()
        if latest:
            data['latest_version'] = DocumentVersionSerializer(
                latest,
                context=self.context
            ).data
        return data


class DocumentListSerializer(serializers.ModelSerializer):
    """Serializer for Document list view."""
    status = serializers.SerializerMethodField()
    version_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = ['id', 'title', 'description', 'status', 'version_count', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_status(self, obj):
        """Get status of latest version."""
        latest = obj.versions.order_by('-version_number').first()
        return latest.status if latest else 'draft'
    
    def get_version_count(self, obj):
        """Get number of versions."""
        return obj.versions.count()


class DocumentCreateSerializer(serializers.Serializer):
    """Serializer for creating a document."""
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    template_id = serializers.IntegerField(required=False, allow_null=True)
    file = serializers.FileField(required=False, allow_null=True)
    
    def validate(self, data):
        """Ensure either template or file is provided."""
        if not data.get('template_id') and not data.get('file'):
            raise serializers.ValidationError(
                'Either template_id or file must be provided'
            )
        return data
    
    def create(self, validated_data):
        """Create document with initial version."""
        from templates.models import Template
        
        template_id = validated_data.pop('template_id', None)
        file = validated_data.pop('file', None)
        
        # Create document
        document = Document.objects.create(**validated_data)
        
        # Create initial version
        if file and template_id:
            # Both file and template provided - use file but copy template fields
            template = Template.objects.get(id=template_id)
            version = DocumentVersion.objects.create(
                document=document,
                file=file,
                version_number=1,
                status='draft'
            )
            
            # Copy template fields with recipients
            for tfield in template.fields.all():
                DocumentField.objects.create(
                    version=version,
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
        elif template_id:
            # Only template provided - use its file
            template = Template.objects.get(id=template_id)
            version = DocumentVersion.objects.create(
                document=document,
                file=template.file,
                version_number=1,
                status='draft'
            )
            
            # Copy template fields with recipients
            for tfield in template.fields.all():
                DocumentField.objects.create(
                    version=version,
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
        elif file:
            # Only file provided - create empty version
            version = DocumentVersion.objects.create(
                document=document,
                file=file,
                version_number=1,
                status='draft'
            )
        
        return document


class SignatureEventSerializer(serializers.ModelSerializer):
    """Serializer for SignatureEvent."""
    signer_name_display = serializers.CharField(source='signer_name', read_only=True)
    
    class Meta:
        model = SignatureEvent
        fields = [
            'id', 'recipient', 'signer_name_display', 'signed_at',
            'ip_address', 'document_sha256', 'field_values'
        ]
        read_only_fields = fields


class SigningTokenSerializer(serializers.ModelSerializer):
    """Serializer for SigningToken with recipient info."""
    public_url = serializers.SerializerMethodField()
    signatures = serializers.SerializerMethodField()
    version_id = serializers.IntegerField(source='version.id', read_only=True)
    recipient_status = serializers.SerializerMethodField()
    
    class Meta:
        model = SigningToken
        fields = [
            'id', 'token', 'version_id', 'scope', 'recipient', 'used',
            'revoked', 'expires_at', 'created_at', 'public_url', 
            'signatures', 'recipient_status'
        ]
        read_only_fields = [
            'id', 'token', 'used', 'created_at', 'public_url', 
            'signatures', 'version_id', 'recipient_status'
        ]
    
    def get_public_url(self, obj):
        """Generate public signing URL."""
        base_url = settings.FRONTEND_BASE_URL
        return f'{base_url}/sign/{obj.token}'
    
    def get_signatures(self, obj):
        """Get all signatures associated with this token."""
        signature_events = obj.signature_events.all()
        return SignatureEventSerializer(signature_events, many=True).data
    
    def get_recipient_status(self, obj):
        """Get status of this recipient if it's a sign token."""
        if obj.scope == 'sign' and obj.recipient:
            status = obj.version.get_recipient_status()
            return status.get(obj.recipient, None)
        return None


class SigningTokenCreateSerializer(serializers.Serializer):
    """Serializer for creating a signing token."""
    scope = serializers.ChoiceField(choices=['view', 'sign'])
    recipient = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    expires_in_days = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    
    def validate(self, data):
        """Validate recipient for sign tokens."""
        if data['scope'] == 'sign' and not data.get('recipient'):
            raise serializers.ValidationError({
                'recipient': 'Recipient must be specified for sign links'
            })
        return data
    
    def create(self, validated_data):
        """Create a new signing token."""
        version = self.context.get('version')
        expires_in_days = validated_data.pop('expires_in_days', None)
        
        token = SigningToken.generate_token(
            version=version,
            scope=validated_data['scope'],
            recipient=validated_data.get('recipient'),
            expires_in_days=expires_in_days
        )
        return token


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
    recipient = serializers.CharField()
    link_converted_to_view = serializers.BooleanField()