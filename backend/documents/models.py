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
        """Compute page count from PDF on first save."""
        if not self.pk and self.file:
            try:
                with self.file.open('rb') as f:
                    reader = PdfReader(f)
                    self.page_count = len(reader.pages)
            except Exception as e:
                print(f"Error reading PDF: {e}")
                self.page_count = 1
        
        super().save(*args, **kwargs)
    
    def duplicate(self):
        """
        Create a new independent Document by duplicating this one.
        
        ✅ NEW: Replaces copy_version() concept
        - Creates a completely new Document with same file and fields
        - New document has fresh ID, independent status
        - All fields are duplicated (unlocked, in draft state)
        - No relationship or version chain
        
        Returns:
            Document: The newly created duplicate document
        """
        from django.core.files.base import ContentFile
        
        # Read the original file
        with self.file.open('rb') as f:
            file_content = f.read()
        
        # Create new document
        new_doc = Document.objects.create(
            title=f"{self.title} (Copy)",
            description=self.description,
            status='draft',
            page_count=self.page_count
        )
        
        # Save file to new document
        filename = os.path.basename(self.file.name)
        new_doc.file.save(filename, ContentFile(file_content), save=True)
        
        # Duplicate all fields (unlocked, in draft state)
        new_fields = []
        for field in self.fields.all():
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
                    locked=False,  # Reset to unlocked
                    value=None  # Clear values
                )
            )
        
        if new_fields:
            DocumentField.objects.bulk_create(new_fields)
        
        return new_doc
    
    def get_download_url(self):
        """Return the absolute download URL for this document."""
        from django.conf import settings
        return f'{settings.BASE_URL}/api/documents/{self.id}/download/'
    
    def get_audit_url(self):
        """Return the absolute audit export URL for this document."""
        from django.conf import settings
        return f'{settings.BASE_URL}/api/documents/{self.id}/audit_export/'


class DocumentField(models.Model):
    """
    DocumentField is a field instance on a document.
    
    ✅ CONSOLIDATED: Now points directly to Document (not DocumentVersion)
    """
    FIELD_TYPES = [
        ('text', 'Text'),
        ('signature', 'Signature'),
        ('date', 'Date'),
        ('checkbox', 'Checkbox'),
    ]
    
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='fields'
    )
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    label = models.CharField(max_length=255)
    recipient = models.CharField(
        max_length=100,
        default='Recipient 1',
        help_text="Recipient identifier who must fill this field"
    )
    
    page_number = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    x_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    y_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    width_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    height_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    
    required = models.BooleanField(default=True)
    value = models.TextField(blank=True, null=True)
    locked = models.BooleanField(
        default=False,
        help_text="Field is locked after signing and cannot be edited"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def __str__(self):
        return f"{self.label} ({self.recipient})"
    
    def clean(self):
        """Validate recipient is assigned."""
        if not self.recipient or not self.recipient.strip():
            raise ValidationError({'recipient': 'Each field must be assigned to a recipient'})


class SigningToken(models.Model):
    """
    SigningToken controls access to sign or view a document.
    
    ✅ CONSOLIDATED: Now points directly to Document (not DocumentVersion)
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
        constraints = [
            models.UniqueConstraint(
                fields=['document', 'recipient', 'scope'],
                condition=models.Q(scope='sign', revoked=False, used=False),
                name='unique_active_sign_token_per_recipient'
            )
        ]
    
    def __str__(self):
        recipient_info = f" for {self.recipient}" if self.recipient else ""
        return f"Token {self.token[:8]}... ({self.scope}{recipient_info})"
    
    def clean(self):
        """Validate sign tokens have recipients."""
        if self.scope == 'sign' and not self.recipient:
            raise ValidationError({'recipient': 'Sign tokens must specify a recipient'})


class SignatureEvent(models.Model):
    """
    SignatureEvent records each signing action by a recipient.
    
    ✅ CONSOLIDATED: Now points directly to Document (not DocumentVersion)
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
    
    def __str__(self):
        return f"{self.signer_name} ({self.recipient}) signed on {self.signed_at}"


@receiver(post_save, sender=SignatureEvent)
def compute_signature_event_hash(sender, instance, created, **kwargs):
    """Compute event_hash after initial creation."""
    if created and not instance.event_hash:
        from .services import get_signature_service
        service = get_signature_service()
        instance.refresh_from_db()
        instance.event_hash = service.compute_event_hash(instance)
        instance.save(update_fields=['event_hash'])


# ----------------------------
# Webhooks & delivery models
# ----------------------------
class Webhook(models.Model):
    """Webhook registration for external systems to listen to events."""
    EVENTS = [
        ('document.signature_created', 'Signature Created'),
        ('document.completed', 'Document Completed'),
        ('document.locked', 'Document Locked'),
        ('document.status_changed', 'Status Changed'),
    ]

    url = models.URLField(
        help_text="External endpoint URL to receive webhook events"
    )
    subscribed_events = models.JSONField(
        default=list,
        help_text="List of events to subscribe to (e.g., ['document.completed'])"
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