"""
backend/groups/models.py

Purpose:
- Define data structures for grouping documents into ordered bundles.
- Manage the sequential signing workflow state.

Design Principles (Additive):
- Imports existing models (Document, DocumentVersion) as ForeignKeys.
- Does not modify existing Document schema.
- Uses 'DocumentGroupItem' to act as the join table with ordering and locking state.
"""

# ----------------------------
# Standard library imports
# ----------------------------
import secrets
from datetime import timedelta

# ----------------------------
# Django imports
# ----------------------------
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError

# ----------------------------
# Local app imports
# ----------------------------
from documents.models import Document, DocumentVersion


class DocumentGroup(models.Model):
    """
    DocumentGroup acts as a container for multiple ordered documents.

    What:
    - Stores metadata (title, description) and the master lock state.
    - Acts as the parent object for audit exports and group-level webhooks.

    Why:
    - Allows users to send a single "package" of documents that must be signed in order.
    """
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='document_groups'
    )
    
    # Lock State
    is_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    def lock(self):
        """
        Lock the group.
        
        Validation Logic:
        - All items must be locked individually before the group can be locked.
        """
        if self.items.filter(is_locked=False).exists():
            raise ValidationError("All group items must be locked before locking the group.")
        
        self.is_locked = True
        self.locked_at = timezone.now()
        self.save(update_fields=['is_locked', 'locked_at'])


class DocumentGroupItem(models.Model):
    """
    An individual item within a Document Group.

    What:
    - Links a Group to a specific DocumentVersion.
    - Stores the 'order' index (0, 1, 2...).
    - Maintains its own lock state (is_locked).

    Why:
    - We link to a *specific* DocumentVersion (created specifically for this group)
      so that edits to this item do not affect the original document templates or other instances.
    """
    group = models.ForeignKey(
        DocumentGroup,
        on_delete=models.CASCADE,
        related_name='items'
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='group_associations'
    )
    version = models.ForeignKey(
        DocumentVersion,
        on_delete=models.CASCADE,
        related_name='group_items',
        help_text="The specific version copy created for this group instance."
    )
    
    order = models.PositiveIntegerField(default=0)
    is_locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']
        unique_together = ['group', 'version'] # One version instance shouldn't be in the group twice

    def __str__(self):
        return f"{self.order}. {self.document.title} (Group: {self.group.title})"


class DocumentGroupToken(models.Model):
    """
    Public access token for the entire group.

    What:
    - Represents a unique link for a specific recipient to sign the sequence.
    - Does NOT replace SigningToken; acts as a wrapper that helps the backend
      figure out *which* SigningToken to serve next.

    Why:
    - Allows sending one link (e.g. /group-sign/xyz...) that persists across
      multiple documents in the sequence.
    """
    group = models.ForeignKey(
        DocumentGroup,
        on_delete=models.CASCADE,
        related_name='tokens'
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    recipient = models.CharField(max_length=100)
    
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"GroupToken for {self.recipient} ({self.group.title})"

    @classmethod
    def generate(cls, group, recipient):
        """Generate a new secure token for the group/recipient pair."""
        return cls.objects.create(
            group=group,
            recipient=recipient,
            token=secrets.token_urlsafe(32)
        )
