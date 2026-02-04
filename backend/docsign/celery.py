"""
Celery configuration for async task processing.
"""

import os
from celery import Celery
from celery.schedules import crontab

# Set default Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docsign.settings')

app = Celery('docsign')

# Load config from Django settings with namespace
app.config_from_object('django.conf:settings', namespace='CELERY')

# ✅ CRITICAL: Auto-discover tasks from all registered apps
# This must happen AFTER config_from_object
app.autodiscover_tasks()

# ✅ ADDED: Fix deprecation warning
app.conf.update(
    broker_connection_retry_on_startup=True,
)

# Celery Beat schedule for periodic tasks
app.conf.beat_schedule = {
    'retry-failed-webhooks': {
        'task': 'webhooks.tasks.retry_failed_webhooks',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
    },
}

# Task routing
app.conf.task_routes = {
    'webhooks.tasks.*': {'queue': 'celery'},  # ✅ FIX: Use default 'celery' queue
}

@app.task(bind=True)
def debug_task(self):
    """Test task to verify Celery is working."""
    print(f'Request: {self.request!r}')