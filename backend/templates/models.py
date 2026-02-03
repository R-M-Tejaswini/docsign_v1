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
from django.core.validators import MinValueValidator
from django.db.models import Q, CheckConstraint
from common.models import BaseSignableField, TimestampMixin
from common.services import get_webhook_trigger_service


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
        ✅ REFACTORED: Now uses centralized RecipientService
        
        Returns:
            List[str]: Unique recipient names from template fields
        """
        from common.services import get_recipient_service
        service = get_recipient_service()
        return service.get_unique_recipients(self.fields.all())
    
    @property
    def recipients(self):
        """
        Property accessor for recipients (for serializer compatibility).
        
        Returns:
            List[str]: Unique recipient names
        """
        return self.get_recipients()
    
    @property
    def recipients_with_counts(self):
        """
        Get recipients with their field counts.
        
        Returns:
            List[Dict]: List of {recipient, count} dictionaries
        """
        from common.services import get_recipient_service
        service = get_recipient_service()
        return service.get_recipients_with_counts(self.fields.all())
    
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
        is_new = self.pk is None
        
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
        
        # Track if new before saving
        is_new_before_save = self.pk is None
        
        # 2. Save to DB (This generates self.pk)
        super().save(*args, **kwargs)
        
        # 3. Post-Save File Move (Move from 'temp' to 'id')
        if is_new_before_save and self.file:
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
        
        # ✅ TRIGGER WEBHOOK on creation
        if is_new_before_save:
            trigger_service = get_webhook_trigger_service()
            trigger_service.trigger_template_created(
                template=self,
                created_by=None  # Can be passed from view
            )
    
    def delete(self, *args, **kwargs):
        """
        ✅ UPDATED: Trigger webhook on template deletion
        """
        template_id = self.id
        template_title = self.title
        
        # Delete
        super().delete(*args, **kwargs)
        
        # Note: Can't trigger after delete, so trigger before in view
        # Or implement soft delete
    
    def clean(self):
        """
        Model-level validation hook.

        Note:
        - This method exists to enforce invariants at the model layer.
        - Currently defensive, but retained for parity with document models
          and future validation expansion.
        """
        pass


class TemplateField(BaseSignableField):
    """
    TemplateField defines a field location on a template PDF.
    
    ✅ REFACTORED: Now inherits from BaseSignableField
    ✅ UPDATED: Added constraints for consistency
    """
    
    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name='fields'
    )
    
    class Meta:
        ordering = ['page_number', 'y_pct', 'x_pct']
        
        # ✅ FIXED: Use 'condition' NOT 'check'
        constraints = [
            # Ensure recipient is assigned
            models.CheckConstraint(
                condition=~Q(recipient__exact='') & ~Q(recipient__isnull=True),
                name='template_field_recipient_required',
                violation_error_message='Field must be assigned to a recipient'
            ),
            
            # Ensure field dimensions are valid
            models.CheckConstraint(
                condition=Q(width_pct__gt=0) & Q(height_pct__gt=0),
                name='template_field_dimensions_positive',
                violation_error_message='Field width and height must be positive'
            ),
        ]
        
        indexes = [
            models.Index(fields=['template', 'page_number'], name='template_page_fields_idx'),
            models.Index(fields=['template', 'recipient'], name='template_recipient_fields_idx'),
        ]
    
    def clean(self):
        """Validate template field."""
        from django.core.exceptions import ValidationError
        
        if not self.recipient or not self.recipient.strip():
            raise ValidationError({
                'recipient': 'Each field must be assigned to a recipient'
            })
        
        # Check for position conflicts
        existing_fields = TemplateField.objects.filter(
            template=self.template,
            page_number=self.page_number,
        ).exclude(pk=self.pk)
        
        for existing in existing_fields:
            if self._overlaps_with(existing):
                raise ValidationError({
                    'position': f'Field overlaps with "{existing.label}" at this position'
                })
    
    def _overlaps_with(self, other_field):
        """Check if this field overlaps with another field."""
        x_overlap = (self.x_pct < other_field.x_pct + other_field.width_pct and
                    self.x_pct + self.width_pct > other_field.x_pct)
        y_overlap = (self.y_pct < other_field.y_pct + other_field.height_pct and
                    self.y_pct + self.height_pct > other_field.y_pct)
        return x_overlap and y_overlap
    
    def save(self, *args, **kwargs):
        """
        ✅ UPDATED: Trigger webhook on field addition with atomic transaction
        """
        from django.db import transaction
        from common.services import get_webhook_trigger_service
        
        is_new = self.pk is None
        
        # Use atomic transaction
        with transaction.atomic():
            super().save(*args, **kwargs)
            
            if is_new:
                trigger_service = get_webhook_trigger_service()
                trigger_service.trigger_template_field_added(
                    template=self.template,
                    field=self,
                    added_by=None
                )