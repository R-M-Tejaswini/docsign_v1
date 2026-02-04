from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webhooks', '0002_alter_webhookevent_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='webhookevent',
            name='event_type',
            field=models.CharField(
                choices=[
                    ('document.signature_created', 'Signature Created'),
                    ('document.completed', 'Document Completed'),
                    ('document.status_changed', 'Status Changed'),
                ],
                db_index=True,
                help_text="Type of event (e.g., 'document.completed')",
                max_length=50,
            ),
        ),
    ]