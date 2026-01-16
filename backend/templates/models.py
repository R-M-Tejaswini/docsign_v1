import os
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError


def template_upload_path(instance, filename):
    """
    Generate upload path for template files.
    Uses the template ID instead of a title field.
    """
    # Use template ID and preserve original filename
    return f'templates/{instance.id}/{filename}'


class Template(models.Model):
    """
    A template is a PDF with predefined fields that can be reused.
    """
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to=template_upload_path)
    page_count = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)]
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.title
    
    def get_recipients(self):
        """Get list of unique recipients for this template."""
        return sorted(list(
            set(self.fields
                .values_list('recipient', flat=True)
                .filter(recipient__isnull=False))
        ))
    
    def save(self, *args, **kwargs):
        # Extract page count from PDF if not set
        if self.page_count == 1 and self.file:
            try:
                from PyPDF2 import PdfReader
                pdf = PdfReader(self.file)
                self.page_count = len(pdf.pages)
            except Exception as e:
                print(f"Error reading PDF: {e}")
                self.page_count = 1
        super().save(*args, **kwargs)
    
    def clean(self):
        """Validate recipient is assigned."""
        if not self.recipient or not self.recipient.strip():
            raise ValidationError({'recipient': 'Each field must be assigned to a recipient'})


class TemplateField(models.Model):
    """
    TemplateField defines a field location on a template PDF.
    Each field is assigned to a recipient.
    """
    FIELD_TYPES = [
        ('text', 'Text'),
        ('signature', 'Signature'),
        ('date', 'Date'),
        ('checkbox', 'Checkbox'),
    ]
    
    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name='fields'
    )
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    label = models.CharField(max_length=255)
    recipient = models.CharField(
        max_length=100,
        default='Recipient 1',  # ← Add this
        help_text="Recipient identifier (e.g., 'Recipient 1', 'Recipient 2')"
    )
    
    # Page number (1-indexed)
    page_number = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    
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
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def __str__(self):
        return f"{self.label} ({self.recipient}) - Page {self.page_number}"
