import os
import secrets
import hashlib
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.core.exceptions import ValidationError
from PyPDF2 import PdfReader


def document_upload_path(instance, filename):
    """Generate upload path for document version PDFs."""
    ext = os.path.splitext(filename)[1]
    doc_id = instance.document.id if instance.document else 'temp'
    version = instance.version_number
    return f'documents/{doc_id}/v{version}_{filename}'


class Document(models.Model):
    """
    Document is a container for one or more versions.
    Can be created from a template or uploaded directly.
    """
    title = models.CharField(max_length=255)
    created_from_template = models.ForeignKey(
        'templates.Template',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='documents'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.title


class DocumentVersion(models.Model):
    """
    DocumentVersion represents a specific version of a document.
    Each version has its own PDF file and field instances.
    Status tracks the signing progress.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('locked', 'Locked'),
        ('partially_signed', 'Partially Signed'),
        ('completed', 'Completed'),
    ]
    
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='versions'
    )
    file = models.FileField(upload_to=document_upload_path)
    version_number = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    page_count = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-version_number']
        unique_together = ['document', 'version_number']
    
    def __str__(self):
        return f"{self.document.title} v{self.version_number}"
    
    def save(self, *args, **kwargs):
        """Compute page count and auto-increment version number."""
        is_new = self.pk is None
        
        # Auto-increment version number if not set
        if is_new and not self.version_number:
            last_version = self.document.versions.order_by('-version_number').first()
            self.version_number = (last_version.version_number + 1) if last_version else 1
        
        super().save(*args, **kwargs)
        
        # Compute page count for new uploads
        if is_new and self.file:
            try:
                with self.file.open('rb') as f:
                    pdf = PdfReader(f)
                    self.page_count = len(pdf.pages)
                    DocumentVersion.objects.filter(pk=self.pk).update(page_count=self.page_count)
            except Exception:
                DocumentVersion.objects.filter(pk=self.pk).update(page_count=1)
    
    def can_generate_link(self, scope='sign'):
        """Check if version can generate signing links."""
        if scope == 'view':
            # View-only links can be generated for any non-draft document
            return self.status != 'draft'
        else:
            # Sign links can only be generated for locked or partially signed documents
            # Completed documents cannot have new sign links (all fields are filled)
            return self.status in ['locked', 'partially_signed']
    
    def compute_sha256(self):
        """Compute SHA256 hash of the PDF file."""
        sha256_hash = hashlib.sha256()
        with self.file.open('rb') as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def update_status(self):
        """
        Recompute status based on field completion.
        Called after signing events or locking.
        For multi-use links: status becomes partially_signed until all required fields are filled.
        """
        if self.status == 'draft':
            return  # Draft stays draft until manually locked
        
        # Get all required fields
        required_fields = self.fields.filter(required=True)
        
        if not required_fields.exists():
            # No required fields means it's completed once locked
            if self.status in ['locked', 'partially_signed']:
                self.status = 'completed'
        else:
            # Count filled and locked fields
            filled_fields = required_fields.filter(
                locked=True
            ).exclude(value__isnull=True).exclude(value='')
            
            total_required = required_fields.count()
            filled_count = filled_fields.count()
            
            if filled_count == 0:
                # No fields filled yet
                if self.status not in ['draft']:
                    self.status = 'locked'
            elif filled_count < total_required:
                # Some fields filled - THIS IS KEY FOR MULTI-USE
                self.status = 'partially_signed'
            else:
                # All required fields filled
                self.status = 'completed'
        
        self.save(update_fields=['status'])


class DocumentField(models.Model):
    """
    DocumentField is a field instance on a specific document version.
    Copied from TemplateField or created manually.
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
    
    # Page and position
    page_number = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    x_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    y_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    width_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    height_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    
    required = models.BooleanField(default=True)
    value = models.TextField(blank=True, null=True)
    locked = models.BooleanField(default=False, help_text="Field is locked after signing")
    
    class Meta:
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def __str__(self):
        return f"{self.version} - {self.label}"


class SigningToken(models.Model):
    """
    SigningToken controls access to view or sign a document version.
    Tokens must be unguessable and can be single-use or multi-use.
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
    single_use = models.BooleanField(default=True)
    used = models.BooleanField(default=False)
    revoked = models.BooleanField(default=False)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Token {self.token[:8]}... ({self.scope})"
    
    @classmethod
    def generate_token(cls, version, scope='sign', single_use=True, expires_in_days=None):
        """Generate a new signing token."""
        # Validate version status
        if not version.can_generate_link(scope=scope):
            if scope == 'sign':
                raise ValidationError(
                    'Sign links can only be generated for locked or partially signed documents'
                )
            else:
                raise ValidationError(
                'Links can only be generated for non-draft documents'
            )
        
        token_str = secrets.token_urlsafe(32)
        expires_at = None
        if expires_in_days:
            expires_at = timezone.now() + timezone.timedelta(days=expires_in_days)
        
        return cls.objects.create(
            token=token_str,
            version=version,
            scope=scope,
            single_use=single_use,
            expires_at=expires_at
        )
    
    def is_valid(self):
        """Check if token is valid for use."""
        if self.revoked:
            return False, "Token has been revoked"
        
        # Check expiry only if expires_at is set
        if self.expires_at and timezone.now() > self.expires_at:
            return False, "Token has expired"
        
        # Single-use tokens are converted to view-only after signing
        # They remain valid for viewing
        if self.single_use and self.used and self.scope == 'sign':
            return False, "Token has already been used for signing"
        
        return True, None
    
    def mark_used(self):
        """Mark token as used and potentially convert scope to view."""
        self.used = True
        self.save(update_fields=['used'])
    
    def convert_to_view_only(self):
        """Convert a sign token to view-only after all required fields are filled."""
        if self.scope == 'sign':
            self.scope = 'view'
            self.used = True
            self.save(update_fields=['scope', 'used'])


class SignatureEvent(models.Model):
    """
    SignatureEvent records each signing action.
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
    signer_name = models.CharField(max_length=255)
    signed_at = models.DateTimeField(auto_now_add=True)
    
    # Audit metadata
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    document_sha256 = models.CharField(max_length=64, help_text="SHA256 hash of PDF at sign time")
    
    # Field values at time of signing (JSON)
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
        return f"{self.signer_name} signed {self.version} at {self.signed_at}"
