from django.contrib import admin
from .models import (
    Document, DocumentVersion, DocumentField,
    SigningToken, SignatureEvent
)


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'created_at', 'updated_at')
    search_fields = ('title',)
    list_filter = ('created_at',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(DocumentVersion)
class DocumentVersionAdmin(admin.ModelAdmin):
    list_display = ('document', 'version_number', 'status', 'page_count', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('document__title',)
    readonly_fields = ('version_number', 'page_count', 'created_at')
    fieldsets = (
        ('Version Info', {
            'fields': ('document', 'version_number', 'file')
        }),
        ('Status', {
            'fields': ('status', 'page_count')
        }),
        ('Metadata', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )


@admin.register(DocumentField)
class DocumentFieldAdmin(admin.ModelAdmin):
    list_display = ('label', 'version', 'field_type', 'recipient', 'locked', 'required')
    list_filter = ('field_type', 'locked', 'required')
    search_fields = ('label', 'version__document__title', 'recipient')
    fieldsets = (
        ('Field Info', {
            'fields': ('version', 'field_type', 'label', 'recipient', 'required')
        }),
        ('Position & Size', {
            'fields': ('page_number', 'x_pct', 'y_pct', 'width_pct', 'height_pct')
        }),
        ('Value', {
            'fields': ('value', 'locked')
        }),
    )


@admin.register(SigningToken)
class SigningTokenAdmin(admin.ModelAdmin):
    list_display = ('token_short', 'version', 'scope', 'recipient', 'used', 'revoked', 'created_at')
    list_filter = ('scope', 'used', 'revoked', 'created_at')
    search_fields = ('token', 'version__document__title', 'recipient')
    readonly_fields = ('token', 'created_at')
    fieldsets = (
        ('Token Info', {
            'fields': ('token', 'version', 'scope', 'recipient')
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
    list_display = ('signer_name', 'recipient', 'version', 'signed_at', 'ip_address')
    list_filter = ('signed_at',)
    search_fields = ('signer_name', 'recipient', 'version__document__title', 'ip_address')
    readonly_fields = ('document_sha256', 'signed_at')
    fieldsets = (
        ('Signature Info', {
            'fields': ('version', 'token', 'signer_name', 'recipient')
        }),
        ('Audit Data', {
            'fields': ('signed_at', 'ip_address', 'user_agent', 'document_sha256')
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
