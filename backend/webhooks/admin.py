from django.contrib import admin
from .models import Webhook, WebhookEvent, WebhookDeliveryLog



@admin.register(Webhook)
class WebhookAdmin(admin.ModelAdmin):
    list_display = ('url', 'is_active', 'total_deliveries', 'successful_deliveries', 'failed_deliveries', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('url',)
    readonly_fields = ('secret', 'created_at', 'updated_at')
    fieldsets = (
        ('Webhook Configuration', {
            'fields': ('url', 'subscribed_events', 'secret', 'is_active')
        }),
        ('Statistics', {
            'fields': ('total_deliveries', 'successful_deliveries', 'failed_deliveries', 'last_triggered_at'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'webhook', 'status', 'attempt_count', 'created_at')
    list_filter = ('event_type', 'status', 'created_at')
    search_fields = ('webhook__url', 'event_type')
    readonly_fields = ('webhook', 'event_type', 'payload', 'created_at')
    fieldsets = (
        ('Event Information', {
            'fields': ('webhook', 'event_type', 'payload')
        }),
        ('Delivery Status', {
            'fields': ('status', 'attempt_count', 'last_error', 'next_retry_at')
        }),
        ('Metadata', {
            'fields': ('created_at', 'delivered_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(WebhookDeliveryLog)
class WebhookDeliveryLogAdmin(admin.ModelAdmin):
    list_display = ('event', 'status_code', 'duration_ms', 'created_at')
    list_filter = ('status_code', 'created_at')
    search_fields = ('event__webhook__url',)
    readonly_fields = ('status_code', 'response_body', 'error_message', 'duration_ms', 'created_at')
    fieldsets = (
        ('Delivery Log', {
            'fields': ('event', 'status_code', 'duration_ms')
        }),
        ('Response', {
            'fields': ('response_body', 'error_message'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )
