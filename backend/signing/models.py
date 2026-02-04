"""
backend/signing/models.py

Signing tokens, signature events, and audit trail.
"""

from django.db import models
from django.core.exceptions import ValidationError
from documents.models import Document


class SigningToken(models.Model):
    """
    SigningToken controls access to sign or view a document.
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
    """SignatureEvent records each signing action by a recipient."""
    
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
        help_text="Additional metadata"
    )
    
    class Meta:
        ordering = ['-signed_at']
    
    def __str__(self):
        return f"{self.signer_name} ({self.recipient}) signed on {self.signed_at}"


# Signal to compute event hash
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=SignatureEvent)
def compute_signature_event_hash(sender, instance, created, **kwargs):
    """Compute event_hash after initial creation."""
    if created and not instance.event_hash:
        from signing.services import get_signature_service
        service = get_signature_service()
        instance.refresh_from_db()
        instance.event_hash = service.compute_event_hash(instance)
        instance.save(update_fields=['event_hash'])
