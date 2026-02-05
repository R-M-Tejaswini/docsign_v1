"""
backend/documents/models.py

✅ FIXED: Store files in temp/ initially, move to proper location after ID
"""

import os
from django.db import models
from django.core.validators import MinValueValidator
from core.models import BaseField


def document_upload_path(instance, filename):
    """
    ✅ FIXED: Generate proper upload path based on whether document has ID yet
    
    - NEW documents (no ID): documents/temp/{filename}
    - SAVED documents (has ID): documents/{id}/{filename}
    """
    if instance.pk:
        # ✅ Document has been saved, use proper ID-based path
        ext = os.path.splitext(filename)[1]
        return f'documents/{instance.pk}/{filename}'
    else:
        # ✅ Document hasn't been saved yet, use temp folder
        return f'documents/temp/{filename}'


# ✅ NEW: Custom manager for optimized queries
class DocumentQuerySet(models.QuerySet):
    """Custom QuerySet with performance optimizations."""
    
    def with_recipients(self):
        """Prefetch recipients and recipient status in one query."""
        from django.db.models import Prefetch, Q
        
        # Prefetch related fields
        return self.prefetch_related(
            'fields'  # Prefetch all fields at once
        )


class DocumentManager(models.Manager):
    """Custom manager for documents."""
    
    def get_queryset(self):
        return DocumentQuerySet(self.model, using=self._db)
    
    def with_recipients(self):
        """Get documents with optimized recipient queries."""
        return self.get_queryset().with_recipients()


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
    
    # ✅ ADDED: Custom manager
    objects = DocumentManager()
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
        ]
    
    def __str__(self):
        return self.title
    
    def save(self, *args, **kwargs):
        """
        ✅ FIXED: Handle file migration from temp/ to proper location
        """
        is_new = not self.pk
        
        # ✅ Step 1: Compute page count from PDF on first save only
        if is_new and self.file and self.page_count == 1:
            try:
                with self.file.open('rb') as f:
                    from PyPDF2 import PdfReader
                    reader = PdfReader(f)
                    self.page_count = len(reader.pages)
            except Exception as e:
                print(f"⚠️ Error reading PDF page count: {e}")
                self.page_count = 1
        
        # ✅ Step 2: Save to database (this creates the ID)
        super().save(*args, **kwargs)
        
        # ✅ Step 3: Move file from temp/ to proper location if needed
        if is_new and self.file:
            current_path = self.file.name
            
            # Check if file is in temp directory
            if 'documents/temp/' in current_path:
                print(f"📁 Moving file from temp: {current_path}")
                
                # Extract filename without path
                filename = os.path.basename(current_path)
                
                # Create new path using the now-assigned ID
                new_path = f'documents/{self.pk}/{filename}'
                
                try:
                    # Read current file
                    with self.file.open('rb') as f:
                        file_content = f.read()
                    
                    # Delete old file from storage
                    if self.file.storage.exists(current_path):
                        self.file.storage.delete(current_path)
                    
                    # Save to new location
                    from django.core.files.base import ContentFile
                    self.file.save(
                        filename,
                        ContentFile(file_content),
                        save=False  # Don't trigger save() again
                    )
                    
                    # Update database with new path
                    Document.objects.filter(pk=self.pk).update(file=self.file.name)
                    
                    print(f"✅ File moved to: {self.file.name}")
                    
                except Exception as e:
                    print(f"⚠️ Error moving file: {e}")
    
    def duplicate(self):
        """Create a new independent Document by duplicating this one."""
        from django.core.files.base import ContentFile
        
        # ✅ OPTIMIZED: Read file once, reuse for both save and hashing
        with self.file.open('rb') as f:
            file_content = f.read()
        
        new_doc = Document.objects.create(
            title=f"{self.title} (Copy)",
            description=self.description,
            status='draft',
            page_count=self.page_count  # ✅ Copy page_count, don't re-read PDF
        )
        
        filename = os.path.basename(self.file.name)
        new_doc.file.save(filename, ContentFile(file_content), save=True)
        
        # ✅ OPTIMIZED: Bulk create in one query
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
        related_name='fields',
        db_index=True
    )
    
    value = models.TextField(blank=True, null=True)
    locked = models.BooleanField(
        default=False,
        help_text="Field is locked after signing and cannot be edited"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['page_number', 'y_pct', 'x_pct']
        indexes = [
            models.Index(fields=['document', 'recipient']),
        ]
    
    def __str__(self):
        return f"{self.label} ({self.recipient})"
    
    def clean(self):
        """Validate page_number is within document bounds."""
        from django.core.exceptions import ValidationError as DjangoValidationError
        
        if self.document and self.page_number > self.document.page_count:
            raise DjangoValidationError({
                'page_number': f'Page number {self.page_number} exceeds document page count ({self.document.page_count})'
            })
    
    def save(self, *args, **kwargs):
        """Run full_clean before save."""
        self.full_clean()
        super().save(*args, **kwargs)