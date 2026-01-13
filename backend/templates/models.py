import os
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from PyPDF2 import PdfReader


def template_upload_path(instance, filename):
    """Generate upload path for template PDFs."""
    ext = os.path.splitext(filename)[1]
    return f'templates/{instance.id or "temp"}_{filename}'


class Template(models.Model):
    """
    Template represents a reusable PDF with predefined field locations.
    Templates are the source for creating documents.
    """
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to=template_upload_path)
    page_count = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name
    
    def save(self, *args, **kwargs):
        """Override save to compute page count on upload."""
        is_new = self.pk is None
        super().save(*args, **kwargs)
        
        # If new file uploaded, compute page count
        if is_new and self.file:
            try:
                with self.file.open('rb') as f:
                    pdf = PdfReader(f)
                    self.page_count = len(pdf.pages)
                    # Update without triggering save loop
                    Template.objects.filter(pk=self.pk).update(page_count=self.page_count)
            except Exception as e:
                # Fallback to 1 if PDF reading fails
                Template.objects.filter(pk=self.pk).update(page_count=1)


class TemplateField(models.Model):
    """
    TemplateField defines a field location on a template PDF.
    Coordinates are stored as percentages (0.0 to 1.0) relative to page dimensions.
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
        return f"{self.template.name} - {self.label} ({self.field_type})"
    
    def clean(self):
        """Validate page number is within template page count."""
        from django.core.exceptions import ValidationError
        if self.page_number > self.template.page_count:
            raise ValidationError(
                f'Page number {self.page_number} exceeds template page count {self.template.page_count}'
            )
