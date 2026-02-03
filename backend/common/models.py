"""
backend/common/models.py

Shared abstract models used across multiple apps.
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError


class BaseSignableField(models.Model):
    """
    Abstract base model for fields that can be placed on documents or templates.
    
    Shared structure:
    - field_type: Type of field (text, signature, date, checkbox)
    - label: Display label for the field
    - recipient: Who must fill this field
    - page_number: Which page the field appears on
    - Position & size as percentages (0.0 to 1.0 of page dimensions)
    - required: Whether the field must be filled
    
    Why abstract:
    - TemplateField and DocumentField share 90% of their structure
    - Centralizes validation and field type choices
    - Reduces code duplication while keeping separate tables
    
    Child models should add:
    - Foreign key to parent (Template or Document)
    - Additional fields specific to their use case (e.g., DocumentField.value, DocumentField.locked)
    """
    
    FIELD_TYPES = [
        ('text', 'Text'),
        ('signature', 'Signature'),
        ('date', 'Date'),
        ('checkbox', 'Checkbox'),
    ]
    
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    label = models.CharField(max_length=255)
    recipient = models.CharField(
        max_length=100,
        default='Recipient 1',
        help_text="Recipient identifier who must interact with this field"
    )
    
    # Page positioning
    page_number = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Page number (1-indexed)"
    )
    
    # Position and size as percentages (0.0 to 1.0)
    x_pct = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="X position as percentage of page width"
    )
    y_pct = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="Y position as percentage of page height"
    )
    width_pct = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="Width as percentage of page width"
    )
    height_pct = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="Height as percentage of page height"
    )
    
    required = models.BooleanField(default=True)
    
    class Meta:
        abstract = True
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def clean(self):
        """
        Shared validation for all field types.
        
        Validates:
        - Recipient is not empty
        - Field dimensions are positive
        - Coordinates are within bounds
        """
        super().clean()
        
        if not self.recipient or not self.recipient.strip():
            raise ValidationError({
                'recipient': 'Each field must be assigned to a recipient'
            })
        
        if self.width_pct <= 0 or self.height_pct <= 0:
            raise ValidationError(
                'Field dimensions (width_pct, height_pct) must be positive'
            )
        
        # Check if field would extend beyond page bounds
        if self.x_pct + self.width_pct > 1.0:
            raise ValidationError(
                'Field extends beyond right edge of page (x_pct + width_pct > 1.0)'
            )
        
        if self.y_pct + self.height_pct > 1.0:
            raise ValidationError(
                'Field extends beyond bottom edge of page (y_pct + height_pct > 1.0)'
            )
