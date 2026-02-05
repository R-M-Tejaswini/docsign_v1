"""
backend/templates/models.py

✅ OPTIMIZED: Store in temp/ initially, migrate after ID assigned
"""

import os
from django.db import models
from django.core.validators import MinValueValidator
from core.models import BaseField


def template_upload_path(instance, filename):
    """
    ✅ FIXED: Generate upload path based on whether template has ID yet
    
    - NEW templates (no ID): templates/temp/{filename}
    - SAVED templates (has ID): templates/{id}/{filename}
    """
    if instance.pk:
        # ✅ Template has been saved, use proper ID-based path
        return f'templates/{instance.pk}/{filename}'
    else:
        # ✅ Template hasn't been saved yet, use temp folder
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
        """
        ✅ FIXED: Handle file migration from temp/ to proper location
        """
        is_new = not self.pk
        
        # ✅ Step 1: Compute page count from PDF on first save only
        if is_new and self.file:
            try:
                # ✅ Read file content WITHOUT closing the stream
                file_content = self.file.read()
                
                # ✅ Reset file pointer so Django can read it again during save
                if hasattr(self.file, 'seek'):
                    self.file.seek(0)
                
                # ✅ Now count pages
                from io import BytesIO
                from PyPDF2 import PdfReader
                
                pdf_buffer = BytesIO(file_content)
                reader = PdfReader(pdf_buffer)
                self.page_count = len(reader.pages)
                
                print(f"📊 PDF page count: {self.page_count}")
                
            except Exception as e:
                print(f"⚠️ Warning: Error reading PDF page count: {e}")
                self.page_count = 1
        
        # ✅ Step 2: Save to database (this creates the ID)
        super().save(*args, **kwargs)
        
        # ✅ Step 3: Move file from temp/ to proper location if needed
        if is_new and self.file:
            current_path = self.file.name
            
            # Check if file is in temp directory
            if 'templates/temp/' in current_path:
                print(f"📁 Moving template file from temp: {current_path}")
                
                # Extract filename without path
                filename = os.path.basename(current_path)
                
                # Create new path using the now-assigned ID
                new_path = f'templates/{self.pk}/{filename}'
                
                try:
                    # Read current file
                    with self.file.open('rb') as f:
                        file_content = f.read()
                    
                    # Delete old file from storage
                    if self.file.storage.exists(current_path):
                        self.file.storage.delete(current_path)
                        print(f"🗑️ Deleted temp file: {current_path}")
                    
                    # Save to new location
                    from django.core.files.base import ContentFile
                    self.file.save(
                        filename,
                        ContentFile(file_content),
                        save=False  # Don't trigger save() again
                    )
                    
                    # Update database with new path
                    Template.objects.filter(pk=self.pk).update(file=self.file.name)
                    
                    print(f"✅ Template file moved to: {self.file.name}")
                    
                except Exception as e:
                    print(f"⚠️ Error moving template file: {e}")
    
    def duplicate(self):
        """Create a new independent Template by duplicating this one."""
        from django.core.files.base import ContentFile
        
        # ✅ OPTIMIZED: Read file once, reuse for both save and hashing
        with self.file.open('rb') as f:
            file_content = f.read()
        
        new_template = Template.objects.create(
            title=f"{self.title} (Copy)",
            description=self.description,
            page_count=self.page_count  # ✅ Copy page_count, don't re-read PDF
        )
        
        filename = os.path.basename(self.file.name)
        new_template.file.save(filename, ContentFile(file_content), save=True)
        
        # ✅ OPTIMIZED: Bulk create fields in one query
        new_fields = []
        for field in self.fields.all():
            new_fields.append(
                TemplateField(
                    template=new_template,
                    field_type=field.field_type,
                    label=field.label,
                    recipient=field.recipient,
                    page_number=field.page_number,
                    x_pct=field.x_pct,
                    y_pct=field.y_pct,
                    width_pct=field.width_pct,
                    height_pct=field.height_pct,
                    required=field.required,
                )
            )
        
        if new_fields:
            TemplateField.objects.bulk_create(new_fields)
        
        return new_template


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