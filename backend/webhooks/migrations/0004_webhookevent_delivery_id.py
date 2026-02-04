from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('webhooks', '0003_remove_old_event_types'),  # or whatever the last migration is
    ]

    operations = [
        migrations.AddField(
            model_name='webhookevent',
            name='delivery_id',
            field=models.CharField(
                db_index=True,
                help_text='Unique ID for this delivery attempt (for idempotency)',
                max_length=64,
                unique=True
            ),
        ),
    ]