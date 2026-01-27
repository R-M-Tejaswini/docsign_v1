"""
backend/templates/models.py

Purpose:
- Define database models for reusable document templates and their fields.
- Templates act as blueprints for documents, allowing consistent reuse of PDFs
  and field layouts across multiple document instances.

Design intent:
- Templates are immutable once used indirectly via documents; edits only affect
  future documents created from them.
- Fields are stored separately to allow precise positioning and recipient mapping.
"""

# ----------------------------
# Standard library imports
# ----------------------------
import os

# ----------------------------
# Django imports
# ----------------------------
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError


# ----------------------------
# File upload helpers
# ----------------------------
def template_upload_path(instance, filename):
    """
    Generate upload path for template files.

    What:
    - Builds a deterministic file storage path using the template's ID.
    - Handles the 'Chicken and Egg' problem: If ID doesn't exist yet (creation),
      stores in a temporary staging directory.

    Why:
    - Keeps template files organized in storage.
    - Prevents files being saved to 'templates/None/...'
    """
    if instance.pk:
        # ID exists (Update or post-save move), use permanent path
        return f'templates/{instance.pk}/{filename}'
    else:
        # ID does not exist (Creation), use temporary staging path
        return f'templates/temp/{filename}'


# ----------------------------
# Core template models
# ----------------------------
class Template(models.Model):
    """
    Template represents a reusable PDF blueprint.

    What:
    - Stores a base PDF file along with metadata (title, description, page count).
    - Acts as the source from which document versions are created.

    Why:
    - Allows organizations to standardize document structures
      (contracts, forms, agreements) and reuse them efficiently.
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
        """
        Get list of unique recipients defined in this template.

        What:
        - Aggregates recipient identifiers from all associated TemplateFields.

        Why:
        - Allows clients to preview who will be involved in signing
          before creating a document from this template.
        """
        return sorted(list(
            set(
                self.fields
                    .values_list('recipient', flat=True)
                    .filter(recipient__isnull=False)
            )
        ))
    
    def save(self, *args, **kwargs):
        """
        Persist template, compute page count, and organize file storage.

        What:
        1. Reads PDF to count pages (on creation).
        2. Saves to DB to generate an ID.
        3. Moves file from 'temp/' to 'templates/<id>/' if needed.

        Why:
        - Ensures clean file organization (no 'None' folders).
        - Optimization: Only counts pages on creation (not updates).
        """
        # 1. Optimization: Only calculate page count on creation (when self.pk is None)
        # or if page_count is explicitly default/invalid
        if (not self.pk or self.page_count == 1) and self.file:
            try:
                from PyPDF2 import PdfReader
                # Ensure file is open for reading
                self.file.open('rb')
                pdf = PdfReader(self.file)
                self.page_count = len(pdf.pages)
                
                # CRITICAL FIX: Rewind the file so Django can read it again when saving.
                self.file.seek(0)
            except Exception as e:
                print(f"Error reading PDF: {e}")
                self.page_count = 1
                try:
                    if self.file: self.file.seek(0)
                except:
                    pass
        
        # Track if this is a new object (no ID yet)
        is_new = self.pk is None
        
        # 2. Save to DB (This generates self.pk)
        super().save(*args, **kwargs)
        
        # 3. Post-Save File Move (Move from 'temp' to 'id')
        if is_new and self.file:
            old_file_name = self.file.name
            
            # Check if it was saved to temp
            if 'templates/temp' in old_file_name:
                # Re-opening the file ensures we have the content handle
                self.file.open('rb')
                
                # Re-save the file field. 
                # Since self.pk now exists, template_upload_path will return 'templates/<id>/...'
                self.file.save(os.path.basename(old_file_name), self.file, save=False)
                
                # Save ONLY the file field to the DB (avoid infinite recursion)
                super().save(update_fields=['file'])
                
                # Cleanup: Delete the old temp file from storage
                try:
                    self.file.storage.delete(old_file_name)
                except Exception as e:
                    print(f"Warning: Failed to delete temp file {old_file_name}: {e}")
    
    def clean(self):
        """
        Model-level validation hook.

        Note:
        - This method exists to enforce invariants at the model layer.
        - Currently defensive, but retained for parity with document models
          and future validation expansion.
        """
        pass


class TemplateField(models.Model):
    """
    TemplateField defines a field location on a template PDF.

    What:
    - Stores positional and semantic information for a field
      (type, label, recipient, position).

    Why:
    - Template fields are copied into document versions to form
      the signing structure without redefinition each time.
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
        default='Recipient 1',
        help_text="Recipient identifier (e.g., 'Recipient 1', 'Recipient 2')"
    )
    
    # Page number (1-indexed)
    page_number = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
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
        ordering = ['page_number', 'y_pct', 'x_pct']
    
    def __str__(self):
        return f"{self.label} ({self.recipient}) - Page {self.page_number}"