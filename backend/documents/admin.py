from django.contrib import admin
from .models import (
    Document, DocumentField,
    SigningToken, SignatureEvent
)


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'status', 'page_count', 'created_at', 'updated_at')
    list_filter = ('status', 'created_at')
    search_fields = ('title', 'description')
    readonly_fields = ('page_count', 'signed_pdf_sha256', 'created_at', 'updated_at')
    fieldsets = (
        ('Document Info', {
            'fields': ('title', 'description', 'file')
        }),
        ('Status & Metadata', {
            'fields': ('status', 'page_count')
        }),
        ('Signing', {
            'fields': ('signed_file', 'signed_pdf_sha256'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(DocumentField)
class DocumentFieldAdmin(admin.ModelAdmin):
    list_display = ('label', 'document', 'field_type', 'recipient', 'locked', 'required')
    list_filter = ('field_type', 'locked', 'required', 'created_at')
    search_fields = ('label', 'document__title', 'recipient')
    readonly_fields = ('created_at',)
    fieldsets = (
        ('Field Info', {
            'fields': ('document', 'field_type', 'label', 'recipient', 'required')
        }),
        ('Position & Size', {
            'fields': ('page_number', 'x_pct', 'y_pct', 'width_pct', 'height_pct')
        }),
        ('Value', {
            'fields': ('value', 'locked')
        }),
        ('Timestamps', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )


@admin.register(SigningToken)
class SigningTokenAdmin(admin.ModelAdmin):
    list_display = ('token_short', 'document', 'scope', 'recipient', 'used', 'revoked', 'created_at')
    list_filter = ('scope', 'used', 'revoked', 'created_at')
    search_fields = ('token', 'document__title', 'recipient')
    readonly_fields = ('token', 'created_at')
    fieldsets = (
        ('Token Info', {
            'fields': ('token', 'document', 'scope', 'recipient')
        }),
        ('Settings', {
            'fields': ('expires_at',)
        }),
        ('Status', {
            'fields': ('used', 'revoked')
        }),
        ('Metadata', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )
    
    def token_short(self, obj):
        """Display shortened token."""
        return f"{obj.token[:16]}..."
    token_short.short_description = 'Token'


@admin.register(SignatureEvent)
class SignatureEventAdmin(admin.ModelAdmin):
    list_display = ('signer_name', 'recipient', 'document', 'signed_at', 'ip_address')
    list_filter = ('signed_at', 'recipient')
    search_fields = ('signer_name', 'recipient', 'document__title', 'ip_address')
    readonly_fields = ('document_sha256', 'event_hash', 'signed_at')
    fieldsets = (
        ('Signature Info', {
            'fields': ('document', 'token', 'signer_name', 'recipient')
        }),
        ('Audit Data', {
            'fields': ('signed_at', 'ip_address', 'user_agent', 'document_sha256', 'event_hash')
        }),
        ('Field Values', {
            'fields': ('field_values',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('metadata',),
            'classes': ('collapse',)
        }),
    )
