from django.contrib import admin
from .models import SigningToken, SignatureEvent


@admin.register(SigningToken)
class SigningTokenAdmin(admin.ModelAdmin):
    list_display = ('token_short', 'document', 'scope', 'recipient', 'used', 'revoked', 'created_at')
    list_filter = ('scope', 'used', 'revoked', 'created_at')
    search_fields = ('token', 'document__title', 'recipient')
    readonly_fields = ('token', 'created_at')
    
    def token_short(self, obj):
        return f"{obj.token[:16]}..."
    token_short.short_description = 'Token'


@admin.register(SignatureEvent)
class SignatureEventAdmin(admin.ModelAdmin):
    list_display = ('signer_name', 'recipient', 'document', 'signed_at', 'ip_address')
    list_filter = ('signed_at', 'recipient')
    search_fields = ('signer_name', 'recipient', 'document__title', 'ip_address')
    readonly_fields = ('document_sha256', 'event_hash', 'signed_at')
