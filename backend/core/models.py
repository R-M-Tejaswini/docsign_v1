"""
backend/core/models.py

Base abstract models for shared fields.
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class BaseField(models.Model):
    """✅ FIXED: Abstract base for all field types (template and document)."""
    
    # Field configuration
    field_type = models.CharField(
        max_length=50,
        choices=[
            ('text', 'Text Input'),
            ('signature', 'Signature'),
            ('date', 'Date'),
            ('checkbox', 'Checkbox'),
            ('initials', 'Initials'),
            ('prefilled_text', 'Prefilled Text'),  # ✅ NEW
        ]
    )
    label = models.CharField(max_length=255)
    recipient = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Recipient identifier. Optional for static prefilled fields."
    )
    
    # Position and size (as percentages of page)
    page_number = models.PositiveIntegerField(default=1)
    x_pct = models.FloatField(
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    y_pct = models.FloatField(
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    width_pct = models.FloatField(
        validators=[MinValueValidator(0.01), MaxValueValidator(100)]
    )
    height_pct = models.FloatField(
        validators=[MinValueValidator(0.01), MaxValueValidator(100)]
    )
    
    # Field options
    required = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # ✅ NEW: Prefilled text specific fields
    prefill_value = models.TextField(
        blank=True,
        null=True,
        help_text="Pre-filled text content for prefilled_text field type"
    )
    is_editable_prefill = models.BooleanField(
        default=False,
        help_text="If True, prefilled text can be edited by recipient. If False, text is static/read-only."
    )
    
    class Meta:
        abstract = True
    
    def save(self, *args, **kwargs):
        """✅ FIXED: Don't call full_clean() - DRF serializer handles validation."""
        super().save(*args, **kwargs)
