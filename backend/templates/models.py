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

    Why:
    - Keeps template files organized in storage.
    - Avoids relying on mutable fields like title for file paths.
    """
    # Use template ID and preserve original filename
    return f'templates/{instance.id}/{filename}'


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
        Persist template and compute page count if necessary.

        What:
        - Reads the uploaded PDF to determine page count when not explicitly set.

        Why:
        - Page count is required for validating field placement and ensuring
          fields do not reference non-existent pages.
        """
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

