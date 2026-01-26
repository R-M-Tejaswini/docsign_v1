"""
backend/documents/serializers.py

"""

# ----------------------------
# Standard library imports
# ----------------------------
import secrets

# ----------------------------
# Third-party / Django imports
# ----------------------------
from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

# ----------------------------
# Local app / project imports
# ----------------------------
from templates.models import TemplateField
from .models import (
    Document, DocumentVersion, DocumentField,
    SigningToken, SignatureEvent, Webhook, WebhookEvent, WebhookDeliveryLog
)


# ----------------------------
# Field serializers
# ----------------------------
class DocumentFieldSerializer(serializers.ModelSerializer):
    """
    Serializer for DocumentField.

    What:
    - Serializes a DocumentField's full visible state for clients, including geometry,
      recipient, required flag, current value, and whether the field is locked (signed).

    Why:
    - Used when rendering a version's fields for edit or read-only views so frontends
      can position and represent fields correctly.
    """
    
    class Meta:
        model = DocumentField
        fields = [
            'id', 'field_type', 'label', 'recipient', 'page_number',
            'x_pct', 'y_pct', 'width_pct', 'height_pct',
            'required', 'value', 'locked'
        ]
        read_only_fields = ['id', 'locked']


class DocumentFieldUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating DocumentField properties and/or value.

    What:
    - Permits updating editable attributes (value, recipient, label, required, geometry).
    - Has validation that enforces draft/locked semantics.

    Why:
    - During drafting, authors may change layout and metadata. After locking,
      only safe updates (typically value updates when allowed) should be permitted.
    """
    
    class Meta:
        model = DocumentField
        fields = ['value', 'recipient', 'label', 'required', 'x_pct', 'y_pct', 'width_pct', 'height_pct']
    
    def validate(self, data):
        """
        Ensure the field is editable given version and lock state.

        What:
        - If the parent version is not 'draft', restrict metadata changes and prevent editing
          of locked fields.
        - Ensure recipient is not blank when provided.

        Why:
        - Protects integrity of signed/locked documents while still allowing limited value changes
          where business rules permit.
        """
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


# ----------------------------
# Signature event serializers
# ----------------------------
class SignatureEventSerializer(serializers.ModelSerializer):
    """
    Serializer for SignatureEvent.

    What:
    - Exposes signature metadata and includes a computed 'is_verified' flag which recomputes
      the event hash to detect tampering.

    Why:
    - Signature events are critical audit records; returning verification state simplifies
      client-side display and admin review workflows.
    """
    signer_name_display = serializers.CharField(source='signer_name', read_only=True)
    is_verified = serializers.SerializerMethodField()
    
    class Meta:
        model = SignatureEvent
        fields = [
            'id', 'recipient', 'signer_name_display', 'signed_at',
            'ip_address', 'user_agent', 'document_sha256', 'event_hash',
            'field_values', 'is_verified'
        ]
        read_only_fields = fields
    
    def get_is_verified(self, obj):
        """
        Check if the stored event_hash still matches a recomputed hash.

        What:
        - Returns None if no event_hash exists (unexpected case).
        - Otherwise returns True/False indicating integrity.

        Why:
        - Allows quick programmatic checks for tampering and surfaces verification
          data to API consumers without requiring a separate verification call.
        """
        if not obj.event_hash:
            return None
        current_hash = obj.compute_event_hash()
        return current_hash == obj.event_hash


# ----------------------------
# Document version and document serializers
# ----------------------------
class DocumentVersionSerializer(serializers.ModelSerializer):
    """
    Serializer for DocumentVersion.

    What:
    - Includes related metadata (document id/title/description), file URLs,
      recipients, recipient status, fields, signatures, and signed_pdf_sha256.

    Why:
    - Central representation for version-centric endpoints (list, detail, sign page).
    - Provides convenience fields (file_url, signed_file_url) that build absolute URLs
      when request context is present.
    """
    document_id = serializers.SerializerMethodField()
    document_title = serializers.SerializerMethodField()
    document_description = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    signed_file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    recipient_status = serializers.SerializerMethodField()
    fields = DocumentFieldSerializer(many=True, read_only=True)
    signatures = SignatureEventSerializer(many=True, read_only=True)
    signed_pdf_sha256 = serializers.CharField(read_only=True)
    
    class Meta:
        model = DocumentVersion
        fields = [
            'id', 'version_number', 'status', 'page_count', 'created_at',
            'file', 'file_url', 'signed_file_url', 'fields', 'recipients', 'recipient_status',
            'document_id', 'document_title', 'document_description', 'signatures',
            'signed_pdf_sha256'
        ]
    
    def get_document_id(self, obj):
        return obj.document.id
    
    def get_document_title(self, obj):
        return obj.document.title
    
    def get_document_description(self, obj):
        return obj.document.description
    
    def get_file_url(self, obj):
        """
        Return absolute file URL if request in context, otherwise return stored URL.

        What:
        - Uses request.build_absolute_uri when available so clients receive a usable link.

        Why:
        - Avoids duplication of URL construction logic on clients, simplifies downloads.
        """
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_signed_file_url(self, obj):
        """
        Return signed file URL (absolute when request context exists).

        Why:
        - Signed file may not always exist; returning None when absent avoids errors
          for consumers expecting an optional field.
        """
        if obj.signed_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.signed_file.url)
            return obj.signed_file.url
        return None
    
    def get_recipients(self, obj):
        """Return deduplicated recipients list from model method (already deduped)."""
        return obj.get_recipients()  # Already deduped by model
    
    def get_recipient_status(self, obj):
        """Return recipient signing status mapping provided by the model."""
        return obj.get_recipient_status()


class DocumentDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for Document which includes the latest version.

    What:
    - Exposes core document metadata (title, description) and embeds the most recent version.

    Why:
    - Useful for document detail endpoints where the newest draft or signed version is
      most relevant to consumers.
    """
    latest_version = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = ['id', 'title', 'description', 'created_at', 'updated_at', 'latest_version']
    
    def get_latest_version(self, obj):
        """Return serialized latest version (or None) for the document."""
        latest = obj.versions.order_by('-version_number').first()
        if latest:
            return DocumentVersionSerializer(latest, context={'request': self.context.get('request')}).data
        return None


class DocumentListSerializer(serializers.ModelSerializer):
    """
    Compact serializer for listing Documents.

    What:
    - Exposes summary information: title, description, computed status of latest version,
      and number of versions.

    Why:
    - Optimized for list views where full version details are unnecessary and would be wasteful.
    """
    status = serializers.SerializerMethodField()
    version_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = ['id', 'title', 'description', 'status', 'version_count', 'created_at']
        read_only_fields = ['id', 'created_at']  # ← Make sure 'title' is NOT here
    
    def get_status(self, obj):
        """Return status of the latest version (defaults to 'draft' when absent)."""
        latest = obj.versions.order_by('-version_number').first()
        return latest.status if latest else 'draft'
    
    def get_version_count(self, obj):
        """Return count of versions for administrative or UI badges."""
        return obj.versions.count()


# ----------------------------
# Document creation serializer
# ----------------------------
class DocumentCreateSerializer(serializers.Serializer):
    """
    Serializer for creating a Document and its initial version.

    What:
    - Accepts title, optional description, either a template_id or file.
    - Ensures exactly one initial version is created (template OR file).

    Why:
    - Encapsulates document creation business rules in a serializer so view logic
      remains simple and transactional boundaries are clear.
    """
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    template_id = serializers.IntegerField(required=False, allow_null=True)
    file = serializers.FileField(required=False, allow_null=True)
    
    def validate(self, data):
        """Ensure either template_id or file is provided to create an initial version."""
        if not data.get('template_id') and not data.get('file'):
            raise serializers.ValidationError(
                'Either template_id or file must be provided'
            )
        return data
    
    def create(self, validated_data):
        """
        Create Document and a single initial DocumentVersion.

        What:
        - Creates the Document record.
        - If template_id provided: fetch Template, copy file and fields into new version.
        - Else if file provided: create a version with the uploaded file.

        Why:
        - Keeps version creation logic centralized and guarantees one initial version
          is produced by the serializer (the view relies on this contract).
        - Optimized with bulk_create to avoid N+1 database queries when copying fields.
        """
        from templates.models import Template
        
        template_id = validated_data.pop('template_id', None)
        file = validated_data.pop('file', None)
        
        # Create document
        document = Document.objects.create(**validated_data)
        
        # Create ONLY ONE initial version
        if template_id:
            template = Template.objects.get(id=template_id)
            version = DocumentVersion.objects.create(
                document=document,
                file=template.file,
                status='draft'
            )
            
            # Optimization: Use bulk_create to copy all template fields in one query
            # instead of looping through and hitting the DB for each field.
            fields_to_create = []
            for tfield in template.fields.all():
                fields_to_create.append(
                    DocumentField(
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
                )
            if fields_to_create:
                DocumentField.objects.bulk_create(fields_to_create)

        elif file:
            version = DocumentVersion.objects.create(
                document=document,
                file=file,
                status='draft'
            )
    
        return document


# ----------------------------
# Signing token serializers
# ----------------------------
class SigningTokenSerializer(serializers.ModelSerializer):
    """
    Serializer for SigningToken objects.

    What:
    - Includes token metadata, a generated public_url for frontends, associated signatures,
      and the recipient's status when applicable.

    Why:
    - Exposes token info required by admin UIs and for auditing token usage.
    """
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
        """Return the frontend URL where the recipient would sign/view the document."""
        base_url = settings.FRONTEND_BASE_URL
        return f'{base_url}/sign/{obj.token}'
    
    def get_signatures(self, obj):
        """Return serialized signatures that were created using this token."""
        signature_events = obj.signature_events.all()
        return SignatureEventSerializer(signature_events, many=True).data
    
    def get_recipient_status(self, obj):
        """
        If token is a 'sign' token, return the recipient-specific status mapping.

        Why:
        - Useful to display progress for the recipient associated with a token.
        """
        if obj.scope == 'sign' and obj.recipient:
            status = obj.version.get_recipient_status()
            return status.get(obj.recipient, None)
        return None


class SigningTokenCreateSerializer(serializers.Serializer):
    """
    Serializer for creating SigningToken.

    What:
    - Accepts scope ('view' or 'sign'), optional recipient, and expiry information.
    - Validates recipient presence for sign tokens.

    Why:
    - Encapsulates token creation rules and delegates actual token generation to the model.
    """
    scope = serializers.ChoiceField(choices=['view', 'sign'])
    recipient = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    expires_in_days = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    
    def validate(self, data):
        """Ensure recipient is provided when creating sign tokens."""
        if data['scope'] == 'sign' and not data.get('recipient'):
            raise serializers.ValidationError({
                'recipient': 'Recipient must be specified for sign links'
            })
        return data
    
    def create(self, validated_data):
        """Create and return a SigningToken using the model utility method."""
        version = self.context.get('version')
        expires_in_days = validated_data.pop('expires_in_days', None)
        
        token = SigningToken.generate_token(
            version=version,
            scope=validated_data['scope'],
            recipient=validated_data.get('recipient'),
            expires_in_days=expires_in_days
        )
        return token


# ----------------------------
# Public signing payload/response serializers
# ----------------------------
class PublicSignPayloadSerializer(serializers.Serializer):
    """
    Serializer for payload sent by public sign page.

    What:
    - Expects signer_name and a list of field_values with field_id and value.

    Why:
    - Ensures a consistent payload format when anonymous recipients submit signatures.
    """
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
    """
    Serializer for the response returned after successful public signing.

    What:
    - Returns the created signature id, a message, version status, recipient, and whether the
      sign token was converted to a view-only link.

    Why:
    - Encapsulates expected client response after signing for easier parsing on frontend.
    """
    signature_id = serializers.IntegerField()
    message = serializers.CharField()
    version_status = serializers.CharField()
    recipient = serializers.CharField()
    link_converted_to_view = serializers.BooleanField()


# ----------------------------
# Webhook serializers
# ----------------------------
class WebhookDeliveryLogSerializer(serializers.ModelSerializer):
    """
    Serializer for webhook delivery log entries.

    What:
    - Exposes HTTP status, response body, any error message, duration and timestamp.

    Why:
    - Delivery logs are crucial for debugging webhook delivery issues; this serializer
      gives sufficient information for diagnostics.
    """
    
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
    """
    Serializer for webhook events.

    What:
    - Includes the payload and a nested list of delivery logs.

    Why:
    - Useful for admins to inspect what was sent and how deliveries were attempted.
    """
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
    """
    Serializer for webhook configuration.

    What:
    - Serializes webhook core fields and computes derived values like events_list and success_rate.
    - Logic for secret generation is handled in the Model.save() method.

    Why:
    - Centralizes webhook creation and exposes helpful derived metadata for admin UIs.
    """
    events_list = serializers.SerializerMethodField()
    success_rate = serializers.SerializerMethodField()
    
    class Meta:
        model = Webhook
        fields = [
            'id',
            'url',
            'subscribed_events',  # ✅ CHANGED from 'events'
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
        """
        Return human-readable event names for the subscribed_events list.

        What:
        - Maps event keys to readable labels via Webhook.EVENTS mapping.

        Why:
        - Makes webhook configuration UIs friendlier by showing readable event names.
        """
        return [
            dict(Webhook.EVENTS).get(event, event)
            for event in obj.subscribed_events  # ✅ CHANGED from obj.events
        ]
    
    def get_success_rate(self, obj):
        """
        Compute the percentage success rate of delivery attempts.

        What:
        - Returns None when there have been no delivery attempts to avoid dividing by zero.
        - Otherwise returns a rounded percentage.

        Why:
        - Provides a quick health metric for webhook reliability in admin dashboards.
        """
        if obj.total_deliveries == 0:
            return None
        return round((obj.successful_deliveries / obj.total_deliveries) * 100, 2)