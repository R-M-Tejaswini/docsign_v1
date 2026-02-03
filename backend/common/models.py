"""
Common abstract models and mixins shared across apps.
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class BaseSignableField(models.Model):
    """
    Abstract base model for fields in templates and documents.
    
    What:
    - Defines common field properties (type, label, position, size)
    - Percentage-based positioning (0.0 to 1.0)
    - Recipient assignment
    
    Why:
    - Eliminates duplication between TemplateField and DocumentField
    - Ensures consistency in field definitions
    - Makes future field types easy to add
    
    Usage:
    - Inherit in TemplateField and DocumentField
    - Add app-specific fields (e.g., 'value', 'locked' for DocumentField)
    """
    
    FIELD_TYPES = [
        ('text', 'Text'),
        ('signature', 'Signature'),
        ('date', 'Date'),
        ('checkbox', 'Checkbox'),
    ]
    
    field_type = models.CharField(
        max_length=20,
        choices=FIELD_TYPES,
        help_text="Type of input field"
    )
    
    label = models.CharField(
        max_length=255,
        help_text="Display label for the field"
    )
    
    recipient = models.CharField(
        max_length=100,
        default='Recipient 1',
        help_text="Recipient identifier (e.g., 'Recipient 1', 'HR Manager')"
    )
    
    # Page positioning (1-indexed)
    page_number = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Page number (1-indexed)"
    )
    
    # Position and size as percentages (0.0 to 1.0)
    x_pct = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="X position as percentage of page width (0.0 to 1.0)"
    )
    
    y_pct = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="Y position as percentage of page height (0.0 to 1.0)"
    )
    
    width_pct = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="Width as percentage of page width (0.0 to 1.0)"
    )
    
    height_pct = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="Height as percentage of page height (0.0 to 1.0)"
    )
    
    required = models.BooleanField(
        default=True,
        help_text="Whether this field must be filled"
    )
    
    class Meta:
        abstract = True
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def __str__(self):
        return f"{self.label} ({self.recipient}) - Page {self.page_number}"


class TimestampMixin(models.Model):
    """
    Mixin for automatic timestamp tracking.
    
    Why:
    - Standard pattern for created_at/updated_at
    - Reusable across all models that need timestamps
    """
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        abstract = True


class SoftDeleteMixin(models.Model):
    """
    Mixin for soft delete functionality.
    
    Why:
    - Allows "deleted" records to be retained for audit trails
    - Can be undeleted if needed
    """
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        abstract = True
    
    def soft_delete(self):
        """Mark as deleted without actually removing from DB."""
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])
    
    def restore(self):
        """Restore a soft-deleted record."""
        self.is_deleted = False
        self.deleted_at = None
        self.save(update_fields=['is_deleted', 'deleted_at'])
