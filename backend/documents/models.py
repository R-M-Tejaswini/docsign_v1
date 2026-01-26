"""
backend/documents/models.py

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
# Local helpers (none)
# ----------------------------


# ----------------------------
# File upload helpers
# ----------------------------
def document_version_upload_path(instance, filename):
    """
    Generate upload path for document version files.

    What:
    - Constructs a predictable storage path using document id and version number.

    Why:
    - Keeps uploaded files organized in storage and makes it straightforward
      to find files belonging to a specific document/version.
    """
    # If copying from template, preserve original filename
    # Otherwise use the uploaded filename
    ext = os.path.splitext(filename)[1]
    return f'documents/{instance.document_id}/v{instance.version_number}/{filename}'


# ----------------------------
# Core models
# ----------------------------
class Document(models.Model):
    """
    Document represents a signing workflow instance.

    What:
    - Top-level container for versions and meta information like title/description.

    Why:
    - Separates the identity of a contract/document from versions which are immutable
      snapshots used for signing and audit.
    """
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.title


class DocumentVersion(models.Model):
    """
    A version of a document representing a snapshot at a point in time.

    What:
    - Holds the uploaded/file-backed PDF, page count, and signing state.
    - May have a flattened signed_file once signatures are applied.

    Why:
    - Versions enable immutability for signed artifacts and provide an audit-friendly
      model around which fields, tokens and events are attached.
    """
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='versions'
    )
    version_number = models.PositiveIntegerField(default=1)
    file = models.FileField(upload_to=document_version_upload_path)
    signed_file = models.FileField(
        upload_to=document_version_upload_path,
        null=True,
        blank=True,
        help_text="Flattened PDF with all signatures and overlays merged"
    )
    
    # NEW: Flattened PDF integrity hash
    signed_pdf_sha256 = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text="SHA256 hash of the flattened/signed PDF file"
    )
    
    status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'),
            ('locked', 'Locked for signing'),
            ('partially_signed', 'Partially signed'),
            ('completed', 'Fully signed'),
        ],
        default='draft'
    )
    page_count = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-version_number']
    
    def save(self, *args, **kwargs):
        """
        Compute page count and auto-increment version number.

        What:
        - If no prior version exists, version_number becomes 1 otherwise it auto-increments.
        - If a file is present, extracts page count using PyPDF2.

        Why:
        - Keeps versioning consistent and avoids relying on calling code to set version numbers.
        - Ensures page_count reflects the actual PDF pages for positioning fields.
        """
        # Auto-set version_number only if it's not already set
        if not self.version_number or self.version_number == 1:
            last_version = DocumentVersion.objects.filter(
                document=self.document
            ).order_by('-version_number').first()
            self.version_number = (last_version.version_number + 1) if last_version else 1
        
        # Extract page count from PDF if file exists
        if self.file:
            try:
                reader = PdfReader(self.file)
                self.page_count = len(reader.pages)
            except Exception as e:
                print(f"Error reading PDF: {e}")
                self.page_count = 1
        
        super().save(*args, **kwargs)
    
    def get_recipients(self):
        """
        Get list of unique recipients assigned to fields.

        What:
        - Uses distinct query on the related fields to avoid duplicate recipients.

        Why:
        - Useful for building recipient-specific UIs, generating tokens, and summarizing status.
        """
        # Use .distinct() to remove duplicates
        recipients = self.fields.values_list('recipient', flat=True).distinct()
        # Filter out empty strings and sort
        return sorted([r for r in recipients if r and r.strip()])
    
    def get_recipient_status(self):
        """
        Get signing status per recipient.

        Returns:
        - dict mapping recipient -> {total, signed, completed}

        Why:
        - Drives both UI progress indicators and business rules (e.g., when the version
          is considered completed).
        """
        recipients = self.get_recipients()
        status = {}
        
        for recipient in recipients:
            recipient_fields = self.fields.filter(recipient=recipient)
            required_fields = recipient_fields.filter(required=True)
            
            total = required_fields.count()
            signed = required_fields.filter(locked=True).exclude(
                value__isnull=True
            ).exclude(value='').count()
            
            status[recipient] = {
                'total': total,
                'signed': signed,
                'completed': (signed == total) if total > 0 else True
            }
        
        return status
    
    def can_generate_sign_link(self, recipient):
        """
        Check if a sign link can be generated for a specific recipient.

        Rules:
        - Document must be locked (not draft)
        - Recipient must have fields assigned
        - Recipient must not have already signed (all their required fields)
        - No active sign token for this recipient

        Returns:
        - (bool, error_message_or_None)
        """
        if self.status == 'draft':
            return False, "Document must be locked before generating sign links"
        
        # Check if recipient has fields
        recipient_fields = self.fields.filter(recipient=recipient)
        if not recipient_fields.exists():
            return False, f"No fields assigned to {recipient}"
        
        # Check if recipient already completed signing
        recipient_status = self.get_recipient_status()
        if recipient in recipient_status and recipient_status[recipient]['completed']:
            return False, f"{recipient} has already completed signing"
        
        # Check if active sign token exists for this recipient
        active_token = self.tokens.filter(
            recipient=recipient,
            scope='sign',
            revoked=False
        ).filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=timezone.now())
        ).first()
        
        if active_token and not active_token.used:
            return False, f"Active sign link already exists for {recipient}"
        
        return True, None
    
    def can_generate_view_link(self):
        """
        View links can be generated for any non-draft document.

        Returns:
        - (bool, error_message_or_None)
        """
        if self.status == 'draft':
            return False, "Document must be locked before generating view links"
        return True, None
    
    def compute_sha256(self):
        """
        Compute SHA256 hash of the PDF file.

        What:
        - Streams file contents to avoid loading entire file into memory.

        Why:
        - Used to record the document hash at sign time for tamper detection.
        """
        sha256_hash = hashlib.sha256()
        with self.file.open('rb') as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def compute_signed_pdf_hash(self):
        """
        Compute SHA256 hash of the signed/flattened PDF file.

        Returns:
        - hex digest string or None on error/missing file.

        Why:
        - Verifies integrity of the flattened PDF distributed to recipients.
        """
        if not self.signed_file:
            return None
        
        sha256_hash = hashlib.sha256()
        try:
            with self.signed_file.open('rb') as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except Exception as e:
            print(f"❌ Error computing signed PDF hash: {e}")
            return None
    
    def update_signed_pdf_hash(self):
        """
        Update signed_pdf_sha256 field after flattening.

        Why:
        - Called by PDF flattening workflows to keep metadata in sync with the file.
        """
        self.signed_pdf_sha256 = self.compute_signed_pdf_hash()
        self.save(update_fields=['signed_pdf_sha256'])

    def update_status(self):
        """
        Update document status based on recipient completion.

        Behavior:
        - draft: stays draft until manually locked
        - locked: marked locked when no signatures present
        - partially_signed: some recipients signed, others haven't
        - completed: all recipients completed their required fields

        Side effects:
        - When moved to 'completed' the code attempts to auto-generate the flattened signed PDF
          if it does not yet exist.
        """
        if self.status == 'draft':
            return  # Draft stays draft until manually locked
        
        recipient_status = self.get_recipient_status()
        
        if not recipient_status:
            # No recipients/fields - mark as completed
            self.status = 'completed'
        else:
            all_completed = all(rs['completed'] for rs in recipient_status.values())
            any_signed = any(rs['signed'] > 0 for rs in recipient_status.values())
            
            if all_completed:
                self.status = 'completed'
            elif any_signed:
                self.status = 'partially_signed'
            else:
                self.status = 'locked'
        
        self.save(update_fields=['status'])
        
        # Auto-generate signed PDF when completed
        if self.status == 'completed' and not self.signed_file:
            try:
                from .services import get_pdf_flattening_service
                service = get_pdf_flattening_service()
                service.flatten_and_save(self)
            except Exception as e:
                print(f"⚠️  Failed to auto-generate signed PDF: {e}")


class DocumentField(models.Model):
    """
    DocumentField is a field instance on a specific document version.

    What:
    - Represents form inputs (text, signature, date, checkbox) placed on particular pages/positions.
    - Fields are assigned to recipients who must fill them prior to completion.

    Why:
    - Modeling fields separately from versions makes it possible to audit who signed what,
      reproduce layout, and compute recipient-specific progress.
    """
    FIELD_TYPES = [
        ('text', 'Text'),
        ('signature', 'Signature'),
        ('date', 'Date'),
        ('checkbox', 'Checkbox'),
    ]
    
    version = models.ForeignKey(
        DocumentVersion,
        on_delete=models.CASCADE,
        related_name='fields'
    )
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    label = models.CharField(max_length=255)
    recipient = models.CharField(
        max_length=100,
        default='Recipient 1',  # ← Add this
        help_text="Recipient identifier who must fill this field"
    )
    
    # Page and position
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
    
    class Meta:
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def __str__(self):
        return f"{self.label} ({self.recipient}) - {self.version}"
    
    def clean(self):
        """
        Validate recipient is assigned.

        Why:
        - Ensures every field must target a recipient for the signing workflow to operate.
        """
        if not self.recipient or not self.recipient.strip():
            raise ValidationError({'recipient': 'Each field must be assigned to a recipient'})


class SigningToken(models.Model):
    """
    SigningToken controls access to sign or view a document version.

    What:
    - Two scopes: 'sign' (single-use tied to a recipient) and 'view' (view-only).
    - Tracks usage, revocation, and optional expiry.

    Why:
    - Tokens provide a simple authentication-free mechanism for recipients to sign documents
      while enabling single-use semantics and auditability.
    """
    SCOPE_CHOICES = [
        ('view', 'View Only'),
        ('sign', 'Sign'),
    ]
    
    token = models.CharField(max_length=64, unique=True, db_index=True)
    version = models.ForeignKey(
        DocumentVersion,
        on_delete=models.CASCADE,
        related_name='tokens'
    )
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    recipient = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        default=None,  # ← View tokens have no recipient
        help_text="Recipient identifier for sign tokens (null for view tokens)"
    )
    used = models.BooleanField(default=False)
    revoked = models.BooleanField(default=False)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        # Ensure only one active sign token per recipient
        constraints = [
            models.UniqueConstraint(
                fields=['version', 'recipient', 'scope'],
                condition=models.Q(scope='sign', revoked=False, used=False),
                name='unique_active_sign_token_per_recipient'
            )
        ]
    
    def __str__(self):
        recipient_info = f" for {self.recipient}" if self.recipient else ""
        return f"Token {self.token[:8]}... ({self.scope}{recipient_info})"
    
    def clean(self):
        """Validate sign tokens have recipients, view tokens don't require them."""
        if self.scope == 'sign' and not self.recipient:
            raise ValidationError({'recipient': 'Sign tokens must specify a recipient'})
    
    @classmethod
    def generate_token(cls, version, scope='sign', recipient=None, expires_in_days=None):
        """
        Generate a new signing token.

        What:
        - Validates business rules (recipient presence for sign, version readiness).
        - Generates a secure token and optionally sets expires_at.

        Why:
        - Keeps token generation logic centralized so callers don't need to remember validation rules.
        """
        if scope == 'sign':
            if not recipient:
                raise ValidationError('Sign tokens must specify a recipient')
            
            can_generate, error = version.can_generate_sign_link(recipient)
            if not can_generate:
                raise ValidationError(error)
        else:
            # View token
            can_generate, error = version.can_generate_view_link()
            if not can_generate:
                raise ValidationError(error)
        
        token_str = secrets.token_urlsafe(32)
        expires_at = None
        if expires_in_days:
            expires_at = timezone.now() + timedelta(days=expires_in_days)
        
        return cls.objects.create(
            token=token_str,
            version=version,
            scope=scope,
            recipient=recipient,
            expires_at=expires_at
        )
    
    def is_valid(self):
        """
        Check if token is valid for use.

        Returns:
        - (bool, error_message_or_None)
        """
        if self.revoked:
            return False, "This link has been revoked"
        
        if self.expires_at and timezone.now() > self.expires_at:
            return False, "This link has expired"
        
        if self.scope == 'sign' and self.used:
            return False, "This signing link has already been used"
        
        return True, None
    
    def convert_to_view_only(self):
        """
        Convert a sign token to view-only after signing.

        Why:
        - Marks token as used and changes scope to prevent further signing attempts.
        """
        if self.scope == 'sign':
            self.scope = 'view'
            self.used = True
            self.save(update_fields=['scope', 'used'])


class SignatureEvent(models.Model):
    """
    SignatureEvent records each signing action by a recipient.

    What:
    - Stores signer metadata, the document hash at sign time, event-level hash and field values.

    Why:
    - Serves as the authoritative audit record for who signed what, when, and from where.
      Event hashes can be used to detect tampering.
    """
    version = models.ForeignKey(
        DocumentVersion,
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
    
    # Audit metadata
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    document_sha256 = models.CharField(max_length=64, help_text="SHA256 hash of PDF at sign time")
    
    # NEW: Event-level integrity hash
    event_hash = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text="SHA256 hash of this signature event for tamper detection"
    )
    
    # Field values at time of signing
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
        return f"{self.signer_name} ({self.recipient}) signed {self.version} on {self.signed_at}"
    
    def compute_event_hash(self):
        """
        Compute tamper-evident hash for this signature event.

        What:
        - Uses stable JSON serialization of a deterministic set of fields
          (document_sha256, sorted field_values, signer_name, recipient, signed_at, token id, version id).

        Why:
        - Creating a deterministic event-level hash allows later verification that the
          event record hasn't been altered after creation.
        """
        import hashlib
        import json
        
        hash_input = {
            'document_sha256': self.document_sha256,
            'field_values': sorted(self.field_values, key=lambda x: x['field_id']),
            'signer_name': self.signer_name,
            'recipient': self.recipient,
            'signed_at': self.signed_at.isoformat(),  # Now safe
            'token_id': self.token.id if self.token else None,
            'version_id': self.version.id,
        }
        
        hash_string = json.dumps(hash_input, sort_keys=True)
        return hashlib.sha256(hash_string.encode()).hexdigest()


# ----------------------------
# Signal handlers
# ----------------------------
@receiver(post_save, sender=SignatureEvent)
def compute_signature_event_hash(sender, instance, created, **kwargs):
    """
    Compute event_hash after initial creation (when signed_at is populated).

    What:
    - On creation, compute and save the event_hash field using compute_event_hash().

    Why:
    - signed_at is populated by auto_now_add only after the DB write completes; computing
      the event_hash in a post_save ensures signed_at is stable and included in the hash.
    """
    if created and not instance.event_hash:
        instance.event_hash = instance.compute_event_hash()
        instance.save(update_fields=['event_hash'])


# ----------------------------
# Webhooks & delivery models
# ----------------------------
class Webhook(models.Model):
    """
    Webhook registration for external systems to listen to events.

    What:
    - Stores endpoint URL, subscribed event types, signing secret and delivery stats.

    Why:
    - External systems can receive events such as 'document.completed' and verify origin
      with the HMAC signature generated from the stored secret.
    """
    EVENTS = [
        ('document.signature_created', 'Signature Created'),
        ('document.completed', 'Document Completed'),
        ('document.locked', 'Document Locked'),
        ('document.status_changed', 'Status Changed'),
    ]

    url = models.URLField(
        help_text="External endpoint URL to receive webhook events"
    )
    # ✅ RENAMED from 'events' to 'subscribed_events'
    subscribed_events = models.JSONField(
        default=list,
        help_text="List of events to subscribe to (e.g., ['document.completed'])"
    )
    secret = models.CharField(
        max_length=255,
        unique=True,
        help_text="Secret key for webhook signature verification (HMAC-SHA256)"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this webhook is enabled"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    
    # Stats
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
    
    def generate_signature(self, payload: dict) -> str:
        """
        Generate HMAC-SHA256 signature for webhook payload.

        What:
        - Serializes payload with stable key order and computes HMAC with stored secret.

        Why:
        - Consumers can verify payload authenticity using the returned signature.
        """
        payload_str = json.dumps(payload, sort_keys=True)
        signature = hashlib.new(
            'sha256',
            msg=payload_str.encode(),
            # hmac usage: hashlib alone won't HMAC; use hmac below to preserve original logic
        )
        # Use hmac for correct HMAC. Keep the string signature using hashlib for compatibility.
        import hmac
        signature = hmac.new(
            self.secret.encode(),
            payload_str.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature
    
    def increment_delivery_attempt(self, success: bool):
        """
        Track delivery statistics.

        What:
        - Updates counters and last_triggered_at timestamp.

        Why:
        - Provides quick reliability metrics and is used by admin UIs for health checks.
        """
        self.total_deliveries += 1
        if success:
            self.successful_deliveries += 1
        else:
            self.failed_deliveries += 1
        self.last_triggered_at = timezone.now()
        self.save(update_fields=[
            'total_deliveries',
            'successful_deliveries',
            'failed_deliveries',
            'last_triggered_at'
        ])


class WebhookEvent(models.Model):
    """
    Record of each webhook event fired (for audit trail and debugging).

    What:
    - Stores payload, event_type, delivery status, retry info and timestamps.

    Why:
    - Enables reliable retry logic and provides an auditable history of notifications sent.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('retrying', 'Retrying'),
    ]
    
    webhook = models.ForeignKey(
        Webhook,
        on_delete=models.CASCADE,
        related_name='webhook_events'  # ✅ Explicit related_name to avoid clash
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
    
    # Timestamps
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
    """
    Detailed log of each delivery attempt (for debugging).

    What:
    - Captures HTTP status, response, error message, duration and timestamp.

    Why:
    - Essential for debugging failed deliveries and understanding transient errors.
    """
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

