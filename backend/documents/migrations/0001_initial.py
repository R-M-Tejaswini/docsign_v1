# ✅ FRESH CONSOLIDATED MIGRATION - Delete all old migrations first!

from django.db import migrations, models
import django.core.validators
import documents.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Document',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('file', models.FileField(upload_to=documents.models.document_upload_path)),
                ('signed_file', models.FileField(blank=True, help_text='Flattened PDF with all signatures and overlays merged', null=True, upload_to=documents.models.document_upload_path)),
                ('signed_pdf_sha256', models.CharField(blank=True, help_text='SHA256 hash of the flattened/signed PDF file', max_length=64, null=True)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('locked', 'Locked for signing'), ('partially_signed', 'Partially signed'), ('completed', 'Fully signed')], default='draft', max_length=20)),
                ('page_count', models.PositiveIntegerField(default=1, validators=[django.core.validators.MinValueValidator(1)])),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Webhook',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('url', models.URLField(help_text='External endpoint URL to receive webhook events')),
                ('subscribed_events', models.JSONField(default=list, help_text="List of events to subscribe to (e.g., ['document.completed'])")),
                ('secret', models.CharField(blank=True, help_text='Secret key for webhook signature verification (HMAC-SHA256)', max_length=255, unique=True)),
                ('is_active', models.BooleanField(default=True, help_text='Whether this webhook is enabled')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('last_triggered_at', models.DateTimeField(blank=True, null=True)),
                ('total_deliveries', models.PositiveIntegerField(default=0)),
                ('successful_deliveries', models.PositiveIntegerField(default=0)),
                ('failed_deliveries', models.PositiveIntegerField(default=0)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='WebhookEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[('document.signature_created', 'Signature Created'), ('document.completed', 'Document Completed'), ('document.locked', 'Document Locked'), ('document.status_changed', 'Status Changed')], help_text="Type of event (e.g., 'document.completed')", max_length=50)),
                ('payload', models.JSONField(help_text='Event data sent to webhook')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('delivered', 'Delivered'), ('failed', 'Failed'), ('retrying', 'Retrying')], default='pending', max_length=20)),
                ('attempt_count', models.PositiveIntegerField(default=0)),
                ('last_error', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('delivered_at', models.DateTimeField(blank=True, null=True)),
                ('next_retry_at', models.DateTimeField(blank=True, null=True)),
                ('webhook', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='webhook_events', to='documents.webhook')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='WebhookDeliveryLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status_code', models.PositiveIntegerField(blank=True, null=True)),
                ('response_body', models.TextField(blank=True)),
                ('error_message', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('duration_ms', models.PositiveIntegerField(blank=True, help_text='How long the HTTP request took in milliseconds', null=True)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='delivery_logs', to='documents.webhookevent')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='SigningToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.CharField(db_index=True, max_length=64, unique=True)),
                ('scope', models.CharField(choices=[('view', 'View Only'), ('sign', 'Sign')], max_length=10)),
                ('recipient', models.CharField(blank=True, default=None, help_text='Recipient identifier for sign tokens (null for view tokens)', max_length=100, null=True)),
                ('used', models.BooleanField(default=False)),
                ('revoked', models.BooleanField(default=False)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tokens', to='documents.document')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='SignatureEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('recipient', models.CharField(default='Recipient 1', help_text='Recipient identifier who signed', max_length=100)),
                ('signer_name', models.CharField(max_length=255)),
                ('signed_at', models.DateTimeField(auto_now_add=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True)),
                ('document_sha256', models.CharField(help_text='SHA256 hash of PDF at sign time', max_length=64)),
                ('event_hash', models.CharField(blank=True, help_text='SHA256 hash of this signature event for tamper detection', max_length=64, null=True)),
                ('field_values', models.JSONField(help_text='Array of {field_id, value} objects signed in this event')),
                ('metadata', models.JSONField(blank=True, default=dict, help_text='Additional metadata (geolocation, device info, etc.)')),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='signatures', to='documents.document')),
                ('token', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='signature_events', to='documents.signingtoken')),
            ],
            options={
                'ordering': ['-signed_at'],
            },
        ),
        migrations.CreateModel(
            name='DocumentField',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_type', models.CharField(choices=[('text', 'Text'), ('signature', 'Signature'), ('date', 'Date'), ('checkbox', 'Checkbox')], max_length=20)),
                ('label', models.CharField(max_length=255)),
                ('recipient', models.CharField(default='Recipient 1', help_text='Recipient identifier who must fill this field', max_length=100)),
                ('page_number', models.PositiveIntegerField(validators=[django.core.validators.MinValueValidator(1)])),
                ('x_pct', models.FloatField(validators=[django.core.validators.MinValueValidator(0.0), django.core.validators.MaxValueValidator(1.0)])),
                ('y_pct', models.FloatField(validators=[django.core.validators.MinValueValidator(0.0), django.core.validators.MaxValueValidator(1.0)])),
                ('width_pct', models.FloatField(validators=[django.core.validators.MinValueValidator(0.0), django.core.validators.MaxValueValidator(1.0)])),
                ('height_pct', models.FloatField(validators=[django.core.validators.MinValueValidator(0.0), django.core.validators.MaxValueValidator(1.0)])),
                ('required', models.BooleanField(default=True)),
                ('value', models.TextField(blank=True, null=True)),
                ('locked', models.BooleanField(default=False, help_text='Field is locked after signing and cannot be edited')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fields', to='documents.document')),
            ],
            options={
                'ordering': ['page_number', 'y_pct', 'x_pct'],
            },
        ),
        # Add indexes
        migrations.AddIndex(
            model_name='document',
            index=models.Index(fields=['status', 'created_at'], name='documents_d_status_created_idx'),
        ),
        migrations.AddIndex(
            model_name='webhook',
            index=models.Index(fields=['is_active', 'created_at'], name='documents_w_is_acti_created_idx'),
        ),
        migrations.AddIndex(
            model_name='webhookevent',
            index=models.Index(fields=['webhook', 'status', 'created_at'], name='documents_we_webhook_status_idx'),
        ),
        migrations.AddIndex(
            model_name='webhookevent',
            index=models.Index(fields=['event_type', 'created_at'], name='documents_we_event_t_created_idx'),
        ),
        migrations.AddIndex(
            model_name='webhookdeliverylog',
            index=models.Index(fields=['event', 'created_at'], name='documents_wd_event_created_idx'),
        ),
        migrations.AddIndex(
            model_name='signingtoken',
            index=models.Index(fields=['document', 'recipient', 'scope'], condition=models.Q(('scope', 'sign'), ('revoked', False), ('used', False)), name='unique_active_sign_token_per_recipient'),
        ),
        migrations.AddIndex(
            model_name='documentfield',
            index=models.Index(fields=['page_number', 'y_pct', 'x_pct'], name='documents_df_page_number_idx'),
        ),
    ]