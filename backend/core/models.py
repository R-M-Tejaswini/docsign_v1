"""
core/models.py

Shared abstract models and base classes used across the application.
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


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
