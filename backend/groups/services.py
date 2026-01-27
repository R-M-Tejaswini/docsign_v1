"""
backend/groups/services.py

Purpose:
- Encapsulate business logic for Document Groups.
- Handle version cloning (to ensure isolation).
- Manage the sequential signing flow (determining "next document").
- specific token generation for group items.
"""

from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

# Import from existing apps
from documents.models import Document, DocumentVersion, DocumentField, SigningToken
from templates.models import Template
from .models import DocumentGroup, DocumentGroupItem, DocumentGroupToken
import secrets


class DocumentGroupService:
    """
    Service to handle Document Group operations (Add Item, Sequence Logic).
    """

    @staticmethod
    @transaction.atomic
    def add_existing_document(group, document_id):
        """
        Add an existing document to the group.
        
        Logic:
        1. Fetch the original document.
        2. Create a NEW 'shadow' version (copy of the latest version).
        3. Create a DocumentGroupItem linking to this new version.
        
        Why:
        - We create a copy so that edits made inside the group context
          do not affect the original document's history or other active signing flows.
        """
        try:
            document = Document.objects.get(id=document_id)
        except Document.DoesNotExist:
            raise ValidationError(f"Document {document_id} not found")

        # Get the latest version to use as a base
        latest_version = document.versions.order_by('-version_number').first()
        if not latest_version:
            raise ValidationError("Document has no versions to copy")

        # 1. Create new Version (Copy file reference)
        # Note: version_number will auto-increment via model save()
        new_version = DocumentVersion.objects.create(
            document=document,
            file=latest_version.file,
            status='draft',
            page_count=latest_version.page_count
        )

        # 2. Bulk Copy Fields (Optimized)
        fields_to_create = []
        for field in latest_version.fields.all():
            fields_to_create.append(
                DocumentField(
                    version=new_version,
                    field_type=field.field_type,
                    label=field.label,
                    recipient=field.recipient,
                    page_number=field.page_number,
                    x_pct=field.x_pct,
                    y_pct=field.y_pct,
                    width_pct=field.width_pct,
                    height_pct=field.height_pct,
                    required=field.required
                )
            )
        DocumentField.objects.bulk_create(fields_to_create)

        # 3. Create Group Item
        # Determine order: put at the end of the list
        current_count = group.items.count()
        item = DocumentGroupItem.objects.create(
            group=group,
            document=document,
            version=new_version,
            order=current_count
        )
        
        return item

    @staticmethod
    @transaction.atomic
    def add_template(group, template_id, title_override=None):
        """
        Create a new Document from a Template and add it to the group.
        
        Logic:
        1. Create new Document.
        2. Create Version from Template file.
        3. Copy Template fields.
        4. Add to Group.
        """
        try:
            template = Template.objects.get(id=template_id)
        except Template.DoesNotExist:
            raise ValidationError(f"Template {template_id} not found")

        # 1. Create Document
        document = Document.objects.create(
            title=title_override or f"{template.title} (Group Copy)",
            description=f"Created from template for group {group.title}"
        )

        # 2. Create Initial Version
        version = DocumentVersion.objects.create(
            document=document,
            file=template.file,
            status='draft'
        )

        # 3. Copy Template Fields (Optimized)
        fields_to_create = []
        for tfield in template.fields.all():
            fields_to_create.append(
                DocumentField(
                    version=version,
                    field_type=tfield.field_type,
                    label=tfield.label,
                    recipient=tfield.recipient,
                    page_number=tfield.page_number,
                    x_pct=tfield.x_pct,
                    y_pct=tfield.y_pct,
                    width_pct=tfield.width_pct,
                    height_pct=tfield.height_pct,
                    required=tfield.required
                )
            )
        DocumentField.objects.bulk_create(fields_to_create)

        # 4. Add to Group
        current_count = group.items.count()
        item = DocumentGroupItem.objects.create(
            group=group,
            document=document,
            version=version,
            order=current_count
        )
        return item

    @staticmethod
    def get_next_item_for_recipient(group_token):
        """
        The Core Sequential Logic.
        
        Determines which document the user should sign next.
        
        Returns:
            dict: {
                'status': 'PENDING' | 'COMPLETED',
                'item': DocumentGroupItem (or None),
                'signing_token': SigningToken (or None)
            }
        """
        group = group_token.group
        recipient = group_token.recipient
        
        # Get all items in sequence
        items = group.items.select_related('version').order_by('order')
        
        for item in items:
            version = item.version
            
            # Skip if recipient has no fields in this document
            # (We check this by seeing if the recipient is in the version's recipient list)
            # This is a small optimization to skip irrelevant docs
            if not version.fields.filter(recipient=recipient).exists():
                continue

            # Check status
            status_map = version.get_recipient_status()
            recipient_status = status_map.get(recipient, {})
            
            is_complete = recipient_status.get('completed', False)
            
            if not is_complete:
                # FOUND IT: This is the next document to sign.
                
                # Get or Create a SigningToken for this specific version/recipient
                # This bridges the GroupToken (public) to the specific Version (internal)
                token, created = SigningToken.objects.get_or_create(
                    version=version,
                    recipient=recipient,
                    scope='sign',
                    used=False,
                    defaults={'token': secrets.token_urlsafe(32)}
                )
                
                return {
                    'status': 'PENDING',
                    'item': item,
                    'signing_token': token
                }

        # If loop finishes, all documents for this recipient are done
        return {
            'status': 'COMPLETED',
            'item': None,
            'signing_token': None
        }