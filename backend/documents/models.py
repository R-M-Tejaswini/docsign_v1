import os
import secrets
import hashlib
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.core.exceptions import ValidationError
from PyPDF2 import PdfReader


def document_version_upload_path(instance, filename):
    """
    Generate upload path for document version files.
    Uses document ID and version number for organization.
    """
    # If copying from template, preserve original filename
    # Otherwise use the uploaded filename
    ext = os.path.splitext(filename)[1]
    return f'documents/{instance.document_id}/v{instance.version_number}/{filename}'


class Document(models.Model):
    """
    Document represents a signing workflow instance.
    Can be created from a template or uploaded PDF.
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
            ('completed', 'Fully signed'),
        ],
        default='draft'
    )
    page_count = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-version_number']
    
    def save(self, *args, **kwargs):
        """Compute page count and auto-increment version number."""
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
        """Get list of unique recipients assigned to fields."""
        # Use .distinct() to remove duplicates
        recipients = self.fields.values_list('recipient', flat=True).distinct()
        # Filter out empty strings and sort
        return sorted([r for r in recipients if r and r.strip()])
    
    def get_recipient_status(self):
        """
        Get signing status per recipient.
        Returns dict: {recipient: {'total': int, 'signed': int, 'completed': bool}}
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
        """View links can be generated for any non-draft document."""
        if self.status == 'draft':
            return False, "Document must be locked before generating view links"
        return True, None
    
    def compute_sha256(self):
        """Compute SHA256 hash of the PDF file."""
        sha256_hash = hashlib.sha256()
        with self.file.open('rb') as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def compute_signed_pdf_hash(self):
        """Compute SHA256 hash of the signed/flattened PDF file."""
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
        """Update signed_pdf_sha256 after flattening."""
        self.signed_pdf_sha256 = self.compute_signed_pdf_hash()
        self.save(update_fields=['signed_pdf_sha256'])

    def update_status(self):
        """
        Update document status based on recipient completion.
        - draft: stays draft until manually locked
        - locked: just locked, no signatures yet
        - partially_signed: some recipients signed, others haven't
        - completed: all recipients completed their required fields
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
    Each field is assigned to a recipient who must fill it.
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
        """Validate recipient is assigned."""
        if not self.recipient or not self.recipient.strip():
            raise ValidationError({'recipient': 'Each field must be assigned to a recipient'})


class SigningToken(models.Model):
    """
    SigningToken controls access to sign or view a document version.
    Sign tokens are ALWAYS single-use and tied to a specific recipient.
    View tokens are unlimited-use and have no recipient.
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
        """Generate a new signing token."""
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
            expires_at = timezone.now() + timezone.timedelta(days=expires_in_days)
        
        return cls.objects.create(
            token=token_str,
            version=version,
            scope=scope,
            recipient=recipient,
            expires_at=expires_at
        )
    
    def is_valid(self):
        """Check if token is valid for use."""
        if self.revoked:
            return False, "This link has been revoked"
        
        if self.expires_at and timezone.now() > self.expires_at:
            return False, "This link has expired"
        
        if self.scope == 'sign' and self.used:
            return False, "This signing link has already been used"
        
        return True, None
    
    def convert_to_view_only(self):
        """Convert a sign token to view-only after signing."""
        if self.scope == 'sign':
            self.scope = 'view'
            self.used = True
            self.save(update_fields=['scope', 'used'])


class SignatureEvent(models.Model):
    """
    SignatureEvent records each signing action by a recipient.
    Stores metadata for audit trail and verification.
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
        Called AFTER signed_at is set by auto_now_add.
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

# Signal handler - add OUTSIDE the class
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

@receiver(post_save, sender=SignatureEvent)
def compute_signature_event_hash(sender, instance, created, **kwargs):
    """Compute event_hash after initial creation (when signed_at is populated)."""
    if created and not instance.event_hash:
        instance.event_hash = instance.compute_event_hash()
        instance.save(update_fields=['event_hash'])
