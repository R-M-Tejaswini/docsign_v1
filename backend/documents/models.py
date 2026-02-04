"""
backend/documents/models.py

✅ CLEAN: Document lifecycle and field management ONLY.
No signing tokens, signatures, or webhooks here!
"""

import os
from django.db import models
from django.core.validators import MinValueValidator
from core.models import BaseField


def document_upload_path(instance, filename):
    """Generate upload path for document files."""
    ext = os.path.splitext(filename)[1]
    return f'documents/{instance.id}/{filename}'


class Document(models.Model):
    """
    Document represents a single signing workflow instance.
    Status lifecycle: draft → locked → partially_signed → completed
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('locked', 'Locked for signing'),
        ('partially_signed', 'Partially signed'),
        ('completed', 'Fully signed'),
    ]
    
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to=document_upload_path)
    signed_file = models.FileField(
        upload_to=document_upload_path,
        null=True,
        blank=True,
        help_text="Flattened PDF with all signatures and overlays merged"
    )
    signed_pdf_sha256 = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text="SHA256 hash of the flattened/signed PDF file"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    page_count = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
        ]
    
    def __str__(self):
        return self.title
    
    def save(self, *args, **kwargs):
        """Compute page count from PDF on first save."""
        if not self.pk and self.file:
            try:
                with self.file.open('rb') as f:
                    from PyPDF2 import PdfReader
                    reader = PdfReader(f)
                    self.page_count = len(reader.pages)
            except Exception as e:
                print(f"Error reading PDF: {e}")
                self.page_count = 1
        super().save(*args, **kwargs)
    
    def duplicate(self):
        """Create a new independent Document by duplicating this one."""
        from django.core.files.base import ContentFile
        
        with self.file.open('rb') as f:
            file_content = f.read()
        
        new_doc = Document.objects.create(
            title=f"{self.title} (Copy)",
            description=self.description,
            status='draft',
            page_count=self.page_count
        )
        
        filename = os.path.basename(self.file.name)
        new_doc.file.save(filename, ContentFile(file_content), save=True)
        
        new_fields = []
        for field in self.fields.all():
            new_fields.append(
                DocumentField(
                    document=new_doc,
                    field_type=field.field_type,
                    label=field.label,
                    recipient=field.recipient,
                    page_number=field.page_number,
                    x_pct=field.x_pct,
                    y_pct=field.y_pct,
                    width_pct=field.width_pct,
                    height_pct=field.height_pct,
                    required=field.required,
                    locked=False,
                    value=None
                )
            )
        
        if new_fields:
            DocumentField.objects.bulk_create(new_fields)
        
        return new_doc
    
    def get_download_url(self):
        """Return the absolute download URL for this document."""
        from django.conf import settings
        return f'{settings.BASE_URL}/api/documents/{self.id}/download/'
    
    def get_audit_url(self):
        """Return the absolute audit export URL for this document."""
        from django.conf import settings
        return f'{settings.BASE_URL}/api/documents/{self.id}/audit_export/'


class DocumentField(BaseField):
    """Field instance on a document."""
    
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='fields'
    )
    
    value = models.TextField(blank=True, null=True)
    locked = models.BooleanField(
        default=False,
        help_text="Field is locked after signing and cannot be edited"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def __str__(self):
        return f"{self.label} ({self.recipient})"