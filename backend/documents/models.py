"""
backend/documents/models.py

CONSOLIDATED: Document now contains all properties previously split between
Document and DocumentVersion. No more versioning—each document is independent.
"""

# ----------------------------
# Standard library imports
# ----------------------------
import os
import secrets
import hashlib
import json
from datetime import timedelta
from django.db import transaction
from django.db.models import F
import uuid

# ----------------------------
# Third-party / external libs
# ----------------------------
from PyPDF2 import PdfReader

# ----------------------------
# Django imports
# ----------------------------
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Q

# ----------------------------
# Common base classes
# ----------------------------
from common.models import BaseSignableField, TimestampMixin
from common.services import WebhookEventType


# ----------------------------
# File upload helpers
# ----------------------------
def document_upload_path(instance, filename):
    """Generate upload path for document files."""
    ext = os.path.splitext(filename)[1]
    return f'documents/{instance.id}/{filename}'


# ----------------------------
# Core models
# ----------------------------
class Document(models.Model):
    """
    Document represents a single, independent signing workflow instance.
    
    ✅ CONSOLIDATED: Combines all properties previously in Document + DocumentVersion.
    - No version_number, no versioning semantics
    - Each document is a complete, standalone entity
    - status: draft → locked → partially_signed → completed
    """
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('locked', 'Locked for signing'),
        ('partially_signed', 'Partially signed'),
        ('completed', 'Fully signed'),
    ]
    
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    # ✅ CONSOLIDATED: File and metadata from DocumentVersion
    file = models.FileField(upload_to=document_upload_path)
    signed_file = models.FileField(
        upload_to=document_upload_path,
        null=True,
        blank=True,
        help_text="Flattened PDF with all signatures and overlays merged"
    )
    
    signed_pdf_sha256 = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text="SHA256 hash of the flattened/signed PDF file"
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    page_count = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
        ]
    
    def __str__(self):
        return self.title
    
    def save(self, *args, **kwargs):
        """
        ✅ UPDATED: Trigger webhook on status changes
        """
        # Track old status for webhook trigger
        old_status = None
        if self.pk:
            try:
                old_instance = Document.objects.get(pk=self.pk)
                old_status = old_instance.status
            except Document.DoesNotExist:
                pass
        
        # Call parent save
        super().save(*args, **kwargs)
        
        # Trigger webhook if status changed
        if old_status and old_status != self.status:
            from common.services import get_webhook_trigger_service
            trigger_service = get_webhook_trigger_service()
            trigger_service.trigger_document_status_changed(
                self,
                old_status=old_status,
                new_status=self.status,
                reason='Automatic status update based on signing progress'
            )
    
    def duplicate(self):
        """
        ✅ UPDATED: Use atomic transaction to prevent race conditions
        
        Create a new independent Document by duplicating this one.
        Uses database-level locking to prevent concurrent duplications.
        """
        from django.core.files.base import ContentFile
        from common.services import get_webhook_trigger_service
        import os
        
        # Use atomic transaction with select_for_update to lock source document
        with transaction.atomic():
            # Lock the source document to prevent concurrent modifications
            source_doc = Document.objects.select_for_update().get(pk=self.pk)
            
            # Read the original file
            with source_doc.file.open('rb') as f:
                file_content = f.read()
            
            # Create new document with unique title
            new_doc = Document.objects.create(
                title=f"{source_doc.title} (Copy)",
                description=source_doc.description,
                status='draft',
                page_count=source_doc.page_count
            )
            
            # Save file to new document
            filename = os.path.basename(source_doc.file.name)
            # Add timestamp to filename to ensure uniqueness
            name, ext = os.path.splitext(filename)
            unique_filename = f"{name}_{uuid.uuid4().hex[:8]}{ext}"
            new_doc.file.save(unique_filename, ContentFile(file_content), save=True)
            
            # Duplicate all fields in bulk
            new_fields = []
            for field in source_doc.fields.all():
                new_fields.append(
                    DocumentField(
                        document=new_doc,
                        field_type=field.field_type,
                        label=field.label,
                        recipient=field.recipient,
                        page_number=field.page_number,
                        x_pct=field.x_pct,
                        y_pct=field.y_pct,
                        width_pct=field.width_pct,
                        height_pct=field.height_pct,
                        required=field.required,
                        locked=False,
                        value=None
                    )
                )
            
            if new_fields:
                DocumentField.objects.bulk_create(new_fields)
            
            # Trigger webhook
            trigger_service = get_webhook_trigger_service()
            trigger_service.trigger_document_duplicated(
                original_document=source_doc,
                duplicate_document=new_doc,
                duplicated_by=None
            )
        
        return new_doc
    
    def get_download_url(self):
        """Return the absolute download URL for this document."""
        from django.conf import settings
        return f'{settings.BASE_URL}/api/documents/{self.id}/download/'
    
    def get_audit_url(self):
        """Return the absolute audit export URL for this document."""
        from django.conf import settings
        return f'{settings.BASE_URL}/api/documents/{self.id}/audit_export/'
    
    @property
    def recipients(self):
        """
        ✅ NEW: Get unique recipients for this document.
        Uses centralized RecipientService.
        
        Returns:
            List[str]: Sorted list of unique recipient names
        """
        from common.services import get_recipient_service
        service = get_recipient_service()
        return service.get_unique_recipients(self.fields.all())
    
    @property
    def recipient_status(self):
        """
        ✅ NEW: Get signing status for each recipient.
        Uses centralized RecipientService.
        
        Returns:
            Dict[str, Dict]: Recipient signing status details
        """
        from common.services import get_recipient_service
        service = get_recipient_service()
        return service.get_recipient_signing_status(self)
    
    @property
    def recipient_summary(self):
        """
        ✅ NEW: Get high-level recipient summary.
        Uses centralized RecipientService.
        
        Returns:
            Dict: Summary with counts and lists
        """
        from common.services import get_recipient_service
        service = get_recipient_service()
        return service.get_recipient_summary(self)
    
    @property
    def recipients_with_counts(self):
        """
        Get recipients with their field counts.
        
        Returns:
            List[Dict]: List of {recipient, count} dictionaries
        """
        from common.services import get_recipient_service
        service = get_recipient_service()
        return service.get_recipients_with_counts(self.fields.all())
    
    def get_recipients_needing_signature(self):
        """
        Get list of recipients who haven't signed yet.
        
        Returns:
            List[str]: Recipients who need to sign
        """
        from common.services import get_recipient_service
        service = get_recipient_service()
        return service.get_recipients_needing_signature(self)


class DocumentField(BaseSignableField, TimestampMixin):
    """
    DocumentField is a field instance on a document.
    
    ✅ REFACTORED: Now inherits from BaseSignableField
    - Position/size/type fields from base class
    - Document-specific fields (value, locked) added here
    """
    
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='fields'
    )
    
    # ✅ DOCUMENT-SPECIFIC FIELDS (not in base class)
    value = models.TextField(
        blank=True,
        null=True,
        help_text="Filled value for this field"
    )
    
    locked = models.BooleanField(
        default=False,
        help_text="Field is locked after signing and cannot be edited"
    )
    
    class Meta:
        ordering = ['page_number', 'y_pct', 'x_pct']
        
        # ✅ FIXED: Use 'condition' NOT 'check'
        constraints = [
            # Ensure field positions don't overlap on the same page
            models.UniqueConstraint(
                fields=['document', 'page_number', 'x_pct', 'y_pct'],
                condition=Q(locked=False),
                name='unique_field_position_per_page_unlocked',
                violation_error_message='A field already exists at this position on this page'
            ),
            
            # Ensure recipient is always assigned
            models.CheckConstraint(
                condition=~Q(recipient__exact='') & ~Q(recipient__isnull=True),
                name='field_recipient_required',
                violation_error_message='Field must be assigned to a recipient'
            ),
            
            # Ensure field dimensions are valid
            models.CheckConstraint(
                condition=Q(width_pct__gt=0) & Q(height_pct__gt=0),
                name='field_dimensions_positive',
                violation_error_message='Field width and height must be positive'
            ),
        ]
        
        indexes = [
            models.Index(fields=['document', 'page_number']),
            models.Index(fields=['document', 'recipient']),
            models.Index(fields=['locked', 'document']),
        ]
    
    def clean(self):
        """Validate recipient is assigned."""
        from django.core.exceptions import ValidationError
        if not self.recipient or not self.recipient.strip():
            raise ValidationError({
                'recipient': 'Each field must be assigned to a recipient'
            })
        
        # Check for position conflicts
        existing_fields = DocumentField.objects.filter(
            document=self.document,
            page_number=self.page_number,
        ).exclude(pk=self.pk)
        
        for existing in existing_fields:
            if self._overlaps_with(existing):
                raise ValidationError({
                    'position': f'Field overlaps with "{existing.label}" at this position'
                })
    
    def _overlaps_with(self, other_field):
        """Check if this field overlaps with another field."""
        # Check if rectangles overlap
        x_overlap = (self.x_pct < other_field.x_pct + other_field.width_pct and
                    self.x_pct + self.width_pct > other_field.x_pct)
        y_overlap = (self.y_pct < other_field.y_pct + other_field.height_pct and
                    self.y_pct + self.height_pct > other_field.y_pct)
        return x_overlap and y_overlap
    
    def save(self, *args, **kwargs):
        """
        ✅ UPDATED: Use atomic transaction for webhook triggers
        """
        from django.db import transaction
        from common.services import get_webhook_trigger_service
        
        is_new = self.pk is None
        old_instance = None
        changes = {}
        
        # Track changes for update
        if not is_new:
            try:
                old_instance = DocumentField.objects.get(pk=self.pk)
                trackable_fields = ['label', 'recipient', 'value', 'locked', 'required']
                for field in trackable_fields:
                    old_val = getattr(old_instance, field)
                    new_val = getattr(self, field)
                    if old_val != new_val:
                        changes[field] = (old_val, new_val)
            except DocumentField.DoesNotExist:
                pass
        
        # Use atomic transaction to ensure consistency
        with transaction.atomic():
            super().save(*args, **kwargs)
            
            trigger_service = get_webhook_trigger_service()
            
            # Trigger for new field
            if is_new:
                trigger_service.trigger_field_added(
                    document=self.document,
                    field=self,
                    added_by=None
                )
            
            # Trigger for updates
            elif changes:
                trigger_service.trigger_field_updated(
                    document=self.document,
                    field=self,
                    changes=changes,
                    updated_by=None
                )
    

class SigningToken(models.Model):
    """
    SigningToken controls access to sign or view a document.
    
    ✅ CONSOLIDATED: Now points directly to Document (not DocumentVersion)
    ✅ UPDATED: Added constraints to prevent race conditions
    """
    SCOPE_CHOICES = [
        ('view', 'View Only'),
        ('sign', 'Sign'),
    ]
    
    token = models.CharField(max_length=64, unique=True, db_index=True)
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='tokens'
    )
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    recipient = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        default=None,
        help_text="Recipient identifier for sign tokens (null for view tokens)"
    )
    used = models.BooleanField(default=False)
    revoked = models.BooleanField(default=False)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        
        # ✅ FIXED: Use 'condition' NOT 'check'
        constraints = [
            # Only one active sign token per recipient per document
            models.UniqueConstraint(
                fields=['document', 'recipient', 'scope'],
                condition=Q(scope='sign', revoked=False, used=False),
                name='unique_active_sign_token_per_recipient',
                violation_error_message='An active sign link already exists for this recipient'
            ),
            
            # Sign tokens must have recipients, view tokens must not
            models.CheckConstraint(
                condition=(
                    (Q(scope='sign') & ~Q(recipient__isnull=True) & ~Q(recipient__exact='')) |
                    (Q(scope='view') & Q(recipient__isnull=True))
                ),
                name='token_recipient_scope_match',
                violation_error_message='Sign tokens must have recipients, view tokens must not'
            ),
            
            # Token cannot be both used and revoked
            models.CheckConstraint(
                condition=~(Q(used=True) & Q(revoked=True)),
                name='token_not_used_and_revoked',
                violation_error_message='Token cannot be both used and revoked'
            ),
        ]
        
        indexes = [
            models.Index(fields=['token'], name='token_lookup_idx'),
            models.Index(fields=['document', 'recipient', 'scope'], name='doc_recipient_scope_idx'),
            models.Index(fields=['document', 'used', 'revoked'], name='doc_active_tokens_idx'),
            models.Index(fields=['expires_at', 'created_at'], name='token_expiry_idx'),
        ]
    
    def __str__(self):
        recipient_info = f" for {self.recipient}" if self.recipient else ""
        return f"Token {self.token[:8]}... ({self.scope}{recipient_info})"
    
    def clean(self):
        """Validate sign tokens have recipients."""
        if self.scope == 'sign' and not self.recipient:
            raise ValidationError({'recipient': 'Sign tokens must specify a recipient'})
        
        if self.scope == 'view' and self.recipient:
            raise ValidationError({'recipient': 'View tokens should not have a recipient'})


class SignatureEvent(models.Model):
    """
    SignatureEvent records each signing action by a recipient.
    
    ✅ CONSOLIDATED: Now points directly to Document (not DocumentVersion)
    ✅ UPDATED: Added constraints and atomic operations
    """
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='signatures'
    )
    token = models.ForeignKey(
        SigningToken,
        on_delete=models.SET_NULL,
        null=True,
        related_name='signature_events'
    )
    recipient = models.CharField(
        max_length=100,
        default='Recipient 1',
        help_text="Recipient identifier who signed"
    )
    signer_name = models.CharField(max_length=255)
    signed_at = models.DateTimeField(auto_now_add=True)
    
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    document_sha256 = models.CharField(max_length=64, help_text="SHA256 hash of PDF at sign time")
    
    event_hash = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text="SHA256 hash of this signature event for tamper detection"
    )
    
    field_values = models.JSONField(
        help_text="Array of {field_id, value} objects signed in this event"
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional metadata (geolocation, device info, etc.)"
    )
    
    class Meta:
        ordering = ['-signed_at']
        
        # ✅ FIXED: Use 'condition' NOT 'check'
        constraints = [
            # Only one signature per token (one-time use)
            models.UniqueConstraint(
                fields=['token'],
                condition=Q(token__isnull=False),
                name='unique_signature_per_token',
                violation_error_message='This signing link has already been used'
            ),
            
            # Ensure document_sha256 is recorded
            models.CheckConstraint(
                condition=~Q(document_sha256__exact=''),
                name='signature_document_hash_required',
                violation_error_message='Document hash must be recorded for signatures'
            ),
            
            # Ensure at least one field was signed
            models.CheckConstraint(
                condition=Q(field_values__len__gt=0),
                name='signature_has_fields',
                violation_error_message='At least one field must be signed'
            ),
        ]
        
        indexes = [
            models.Index(fields=['document', 'recipient'], name='doc_recipient_signatures_idx'),
            models.Index(fields=['document', 'signed_at'], name='doc_time_signatures_idx'),
            models.Index(fields=['token', 'signed_at'], name='token_signature_time_idx'),
        ]
    
    def __str__(self):
        return f"{self.signer_name} ({self.recipient}) signed on {self.signed_at}"


@receiver(post_save, sender=SignatureEvent)
def compute_signature_event_hash(sender, instance, created, **kwargs):
    """Compute event_hash after initial creation."""
    if created and not instance.event_hash:
        from .services import get_signature_service
        instance.refresh_from_db()
        instance.event_hash = get_signature_service().compute_event_hash(instance)
        instance.save(update_fields=['event_hash'])


# ----------------------------
# Webhooks & delivery models
# ----------------------------
class Webhook(models.Model):
    """Webhook registration for external systems to listen to events."""
    
    # ✅ UPDATED: Use centralized event types
    EVENTS = [
        (event_type, event_type)
        for event_type in WebhookEventType.get_all_events()
    ]
    
    url = models.URLField(
        help_text="External endpoint URL to receive webhook events"
    )
    subscribed_events = models.JSONField(
        default=list,
        help_text="List of events to subscribe to"
    )
    secret = models.CharField(
        max_length=255,
        unique=True,
        blank=True,
        help_text="Secret key for webhook signature verification (HMAC-SHA256)"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this webhook is enabled"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    
    total_deliveries = models.PositiveIntegerField(default=0)
    successful_deliveries = models.PositiveIntegerField(default=0)
    failed_deliveries = models.PositiveIntegerField(default=0)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['is_active', 'created_at']),
        ]
    
    def __str__(self):
        return f"Webhook: {self.url}"

    def save(self, *args, **kwargs):
        """Auto-generate secret if not present."""
        if not self.secret:
            self.secret = secrets.token_urlsafe(50)
        super().save(*args, **kwargs)


class WebhookEvent(models.Model):
    """Record of each webhook event fired."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('retrying', 'Retrying'),
    ]
    
    webhook = models.ForeignKey(
        Webhook,
        on_delete=models.CASCADE,
        related_name='webhook_events'
    )
    event_type = models.CharField(
        max_length=50,
        choices=Webhook.EVENTS,
        help_text="Type of event (e.g., 'document.completed')"
    )
    payload = models.JSONField(
        help_text="Event data sent to webhook"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    attempt_count = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['webhook', 'status', 'created_at']),
            models.Index(fields=['event_type', 'created_at']),
        ]
    
    def __str__(self):
        return f"{self.event_type} - {self.status}"


class WebhookDeliveryLog(models.Model):
    """Detailed log of each delivery attempt."""
    event = models.ForeignKey(
        WebhookEvent,
        on_delete=models.CASCADE,
        related_name='delivery_logs'
    )
    status_code = models.PositiveIntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    duration_ms = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="How long the HTTP request took in milliseconds"
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['event', 'created_at']),
        ]
    
    def __str__(self):
        return f"Delivery Log - {self.event} (HTTP {self.status_code})"