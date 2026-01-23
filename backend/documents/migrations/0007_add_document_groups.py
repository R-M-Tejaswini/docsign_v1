# Generated migration – adjust date as needed

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("documents", "0006_webhook_webhookevent_webhookdeliverylog_and_more"),
    ]

    operations = [
        # Add DocumentGroup model
        migrations.CreateModel(
            name="DocumentGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        
        # Add DocumentGroupItem model
        migrations.CreateModel(
            name="DocumentGroupItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("order", models.PositiveIntegerField(help_text="Position in group sequence (0-indexed)")),
                ("title", models.CharField(max_length=255)),
                ("source", models.CharField(
                    choices=[("upload", "Uploaded PDF"), ("template", "From Template"), ("existing", "From Existing Document")],
                    help_text="How this item was added to the group",
                    max_length=20,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("group", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="documents.documentgroup")),
                ("version", models.ForeignKey(
                    help_text="Immutable snapshot version for this group item",
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="group_items",
                    to="documents.documentversion",
                )),
            ],
            options={
                "ordering": ["order"],
            },
        ),
        
        # Add GroupSession model
        migrations.CreateModel(
            name="GroupSession",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("recipient", models.CharField(max_length=100)),
                ("current_index", models.PositiveIntegerField(default=0, help_text="Index of the current item (0-based)")),
                ("status", models.CharField(
                    choices=[("pending", "Pending"), ("in_progress", "In Progress"), ("completed", "Completed"), ("cancelled", "Cancelled")],
                    default="pending",
                    max_length=20,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("group", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sessions", to="documents.documentgroup")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        
        # Add fields to SigningToken
        migrations.AddField(
            model_name="signingtoken",
            name="group_session",
            field=models.ForeignKey(
                blank=True,
                help_text="Group session this token belongs to (null for non-group tokens)",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="signing_tokens",
                to="documents.groupsession",
            ),
        ),
        migrations.AddField(
            model_name="signingtoken",
            name="group_index",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Index of the group item for this token (null for non-group tokens)",
                null=True,
            ),
        ),
        
        # Add unique constraint for DocumentGroupItem
        migrations.AddConstraint(
            model_name="documentgroupitem",
            constraint=models.UniqueConstraint(
                fields=["group", "order"],
                name="unique_group_item_order",
            ),
        ),
    ]