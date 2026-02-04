"""
core/models.py


Shared abstract models and base classes used across the application.
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError


class BaseField(models.Model):
    """
    Abstract base model for fields (template and document).
    
    Encapsulates common field properties to avoid duplication.
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
        help_text="Recipient identifier"
    )
    
    page_number = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    x_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    y_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    width_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    height_pct = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    
    required = models.BooleanField(default=True)
    
    class Meta:
        abstract = True
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def clean(self):
        """Validate that field box fits within page bounds."""
        errors = {}
        
        # ✅ ADDED: Validate field doesn't overflow right edge
        if self.x_pct + self.width_pct > 1.0:
            errors['width_pct'] = (
                f'Field extends past right edge: '
                f'{self.x_pct} + {self.width_pct} = {self.x_pct + self.width_pct} > 1.0'
            )
        
        # ✅ ADDED: Validate field doesn't overflow bottom edge
        if self.y_pct + self.height_pct > 1.0:
            errors['height_pct'] = (
                f'Field extends past bottom edge: '
                f'{self.y_pct} + {self.height_pct} = {self.y_pct + self.height_pct} > 1.0'
            )
        
        if errors:
            raise ValidationError(errors)
    
    def save(self, *args, **kwargs):
        """Run full_clean before save."""
        self.full_clean()
        super().save(*args, **kwargs)
