"""
backend/templates/models.py


Reusable document templates and their field definitions.
"""

import os
from django.db import models
from django.core.validators import MinValueValidator
from core.models import BaseField


def template_upload_path(instance, filename):
    """Generate upload path for template files."""
    if instance.pk:
        return f'templates/{instance.pk}/{filename}'
    else:
        return f'templates/temp/{filename}'


class Template(models.Model):
    """Reusable PDF template with metadata."""
    
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
        """Get list of unique recipients defined in this template."""
        return sorted(list(
            set(
                self.fields
                    .values_list('recipient', flat=True)
                    .filter(recipient__isnull=False)
            )
        ))
    
    def save(self, *args, **kwargs):
        """Persist template and compute page count."""
        if (not self.pk or self.page_count == 1) and self.file:
            try:
                from PyPDF2 import PdfReader
                self.file.open('rb')
                pdf = PdfReader(self.file)
                self.page_count = len(pdf.pages)
                self.file.seek(0)
            except Exception as e:
                print(f"Error reading PDF: {e}")
                self.page_count = 1
                try:
                    if self.file:
                        self.file.seek(0)
                except:
                    pass
        
        is_new = self.pk is None
        super().save(*args, **kwargs)
        
        if is_new and self.file:
            old_file_name = self.file.name
            if 'templates/temp' in old_file_name:
                self.file.open('rb')
                self.file.save(os.path.basename(old_file_name), self.file, save=False)
                super().save(update_fields=['file'])
                try:
                    self.file.storage.delete(old_file_name)
                except Exception as e:
                    print(f"Warning: Failed to delete temp file {old_file_name}: {e}")


class TemplateField(BaseField):
    """Field definition on a template."""
    
    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name='fields'
    )
    
    class Meta:
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def __str__(self):
        return f"{self.label} ({self.recipient}) - Page {self.page_number}"