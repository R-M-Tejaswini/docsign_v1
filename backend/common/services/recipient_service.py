"""
Centralized recipient calculation and management service.

This service handles all recipient-related logic for templates and documents:
- Extracting unique recipients from fields
- Calculating signing status per recipient
- Counting fields per recipient
- Validating recipient assignments

Why centralized:
- Single source of truth for recipient logic
- Eliminates duplication across models/serializers/views
- Easy to add caching and optimization
- Consistent behavior across all apps
"""

from typing import List, Dict, Set, Optional, Union
from collections import defaultdict


class RecipientService:
    """Service for all recipient-related calculations."""
    
    # ========================================
    # CORE RECIPIENT EXTRACTION
    # ========================================
    
    @staticmethod
    def get_unique_recipients(fields) -> List[str]:
        """
        Extract unique recipient names from a queryset or list of fields.
        
        Args:
            fields: QuerySet or list of field objects with 'recipient' attribute
            
        Returns:
            List[str]: Sorted list of unique recipient names
            
        Example:
            >>> fields = document.fields.all()
            >>> recipients = RecipientService.get_unique_recipients(fields)
            >>> print(recipients)
            ['HR Manager', 'Legal Team', 'Recipient 1']
        """
        recipients = set()
        for field in fields:
            if field.recipient and field.recipient.strip():
                recipients.add(field.recipient.strip())
        
        # Return sorted list for consistent ordering
        return sorted(recipients)
    
    @staticmethod
    def get_recipient_field_counts(fields) -> Dict[str, int]:
        """
        Count how many fields are assigned to each recipient.
        
        Args:
            fields: QuerySet or list of field objects
            
        Returns:
            Dict[str, int]: Mapping of recipient name to field count
            
        Example:
            >>> counts = RecipientService.get_recipient_field_counts(document.fields.all())
            >>> print(counts)
            {'Recipient 1': 5, 'HR Manager': 3, 'Legal Team': 2}
        """
        counts = defaultdict(int)
        for field in fields:
            if field.recipient and field.recipient.strip():
                counts[field.recipient.strip()] += 1
        
        return dict(counts)
    
    @staticmethod
    def get_recipients_with_counts(fields) -> List[Dict[str, Union[str, int]]]:
        """
        Get recipients with their field counts.
        
        Args:
            fields: QuerySet or list of field objects
            
        Returns:
            List[Dict]: List of {recipient, count} dictionaries
            
        Example:
            >>> data = RecipientService.get_recipients_with_counts(document.fields.all())
            >>> print(data)
            [
                {'recipient': 'HR Manager', 'count': 3},
                {'recipient': 'Legal Team', 'count': 2},
                {'recipient': 'Recipient 1', 'count': 5}
            ]
        """
        counts = RecipientService.get_recipient_field_counts(fields)
        
        # Convert to list of dicts, sorted by recipient name
        result = [
            {'recipient': recipient, 'count': count}
            for recipient, count in sorted(counts.items())
        ]
        
        return result
    
    # ========================================
    # DOCUMENT-SPECIFIC RECIPIENT STATUS
    # ========================================
    
    @staticmethod
    def get_recipient_signing_status(document) -> Dict[str, Dict[str, Union[bool, int, str]]]:
        """
        Calculate signing status for each recipient on a document.
        
        Args:
            document: Document instance
            
        Returns:
            Dict[str, Dict]: Mapping of recipient to their status
            
        Example:
            >>> status = RecipientService.get_recipient_signing_status(document)
            >>> print(status)
            {
                'Recipient 1': {
                    'has_signed': True,
                    'total_fields': 5,
                    'signed_fields': 5,
                    'status': 'completed'
                },
                'HR Manager': {
                    'has_signed': True,
                    'total_fields': 3,
                    'signed_fields': 2,
                    'status': 'partial'
                },
                'Legal Team': {
                    'has_signed': False,
                    'total_fields': 2,
                    'signed_fields': 0,
                    'status': 'pending'
                }
            }
        """
        # Get all fields for this document
        all_fields = list(document.fields.all())
        
        # Get signature events
        signature_events = list(document.signatures.all())
        
        # Get unique recipients from fields
        recipients = RecipientService.get_unique_recipients(all_fields)
        
        # Initialize status for each recipient
        status = {}
        for recipient in recipients:
            # Count total fields for this recipient
            recipient_fields = [f for f in all_fields if f.recipient == recipient]
            total_fields = len(recipient_fields)
            
            # Check if this recipient has signed
            has_signed = any(sig.recipient == recipient for sig in signature_events)
            
            # Count how many of their fields are filled/signed
            signed_fields = sum(
                1 for f in recipient_fields 
                if f.value and f.value.strip()
            )
            
            # Determine overall status
            if not has_signed:
                recipient_status = 'pending'
            elif signed_fields == total_fields:
                recipient_status = 'completed'
            else:
                recipient_status = 'partial'
            
            status[recipient] = {
                'has_signed': has_signed,
                'total_fields': total_fields,
                'signed_fields': signed_fields,
                'status': recipient_status
            }
        
        return status
    
    @staticmethod
    def get_recipient_summary(document) -> Dict[str, Union[int, List[str]]]:
        """
        Get high-level summary of recipients for a document.
        
        Args:
            document: Document instance
            
        Returns:
            Dict: Summary with counts and lists
            
        Example:
            >>> summary = RecipientService.get_recipient_summary(document)
            >>> print(summary)
            {
                'total_recipients': 3,
                'signed_recipients': 1,
                'pending_recipients': 2,
                'all_recipients': ['HR Manager', 'Legal Team', 'Recipient 1'],
                'signed': ['Recipient 1'],
                'pending': ['HR Manager', 'Legal Team']
            }
        """
        status = RecipientService.get_recipient_signing_status(document)
        
        signed = [r for r, s in status.items() if s['has_signed']]
        pending = [r for r, s in status.items() if not s['has_signed']]
        
        return {
            'total_recipients': len(status),
            'signed_recipients': len(signed),
            'pending_recipients': len(pending),
            'all_recipients': sorted(status.keys()),
            'signed': sorted(signed),
            'pending': sorted(pending),
        }
    
    # ========================================
    # VALIDATION HELPERS
    # ========================================
    
    @staticmethod
    def validate_recipient_exists(recipient: str, available_recipients: List[str]) -> bool:
        """
        Check if a recipient exists in the available recipients list.
        
        Args:
            recipient: Recipient name to check
            available_recipients: List of valid recipients
            
        Returns:
            bool: True if recipient exists, False otherwise
        """
        return recipient.strip() in available_recipients
    
    @staticmethod
    def validate_all_recipients_assigned(document) -> Dict[str, Union[bool, List[str]]]:
        """
        Validate that all recipients have at least one field assigned.
        
        Args:
            document: Document instance
            
        Returns:
            Dict: Validation result with any unassigned recipients
            
        Example:
            >>> result = RecipientService.validate_all_recipients_assigned(document)
            >>> print(result)
            {
                'is_valid': False,
                'unassigned_recipients': ['Legal Team']
            }
        """
        # Get all unique recipients from document
        all_recipients = RecipientService.get_unique_recipients(document.fields.all())
        
        # Get recipients with field counts
        field_counts = RecipientService.get_recipient_field_counts(document.fields.all())
        
        # Find recipients with zero fields
        unassigned = [r for r in all_recipients if field_counts.get(r, 0) == 0]
        
        return {
            'is_valid': len(unassigned) == 0,
            'unassigned_recipients': unassigned
        }
    
    @staticmethod
    def get_recipients_needing_signature(document) -> List[str]:
        """
        Get list of recipients who haven't signed yet.
        
        Args:
            document: Document instance
            
        Returns:
            List[str]: Recipients who need to sign
        """
        status = RecipientService.get_recipient_signing_status(document)
        return [
            recipient 
            for recipient, info in status.items() 
            if not info['has_signed']
        ]
    
    # ========================================
    # TEMPLATE-SPECIFIC HELPERS
    # ========================================
    
    @staticmethod
    def get_template_recipients_summary(template) -> Dict[str, Union[int, List[Dict]]]:
        """
        Get recipient summary for a template.
        
        Args:
            template: Template instance
            
        Returns:
            Dict: Summary of recipients with field counts
            
        Example:
            >>> summary = RecipientService.get_template_recipients_summary(template)
            >>> print(summary)
            {
                'total_recipients': 2,
                'recipients': [
                    {'recipient': 'HR Manager', 'count': 3},
                    {'recipient': 'Recipient 1', 'count': 5}
                ]
            }
        """
        recipients_with_counts = RecipientService.get_recipients_with_counts(
            template.fields.all()
        )
        
        return {
            'total_recipients': len(recipients_with_counts),
            'recipients': recipients_with_counts
        }


# ========================================
# SINGLETON PATTERN
# ========================================

_recipient_service = None


def get_recipient_service() -> RecipientService:
    """
    Get singleton instance of RecipientService.
    
    Returns:
        RecipientService: Singleton instance
    """
    global _recipient_service
    if _recipient_service is None:
        _recipient_service = RecipientService()
    return _recipient_service