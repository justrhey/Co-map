"""Vercel Python serverless entrypoint for the Django backend.

Vercel's @vercel/python runtime looks for a module-level `app` (WSGI callable)
in this file. All requests routed here by vercel.json (/api/*, /admin/*,
/accounts/*, /static/*, /media/*) are handed to Django's WSGI application.

Static files are served by WhiteNoise (already in MIDDLEWARE); uploaded media
files are stored in /tmp/mediafiles/ and served by the WhiteNoise WSGI wrapper
below (persist only within a warm instance — configure Supabase S3 for durable
media storage).
"""
import os
import sys
from pathlib import Path

# Make the project root importable (config/, complaints/ live one level up).
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django  # noqa: E402
django.setup()

# Apply database migrations on cold start. Vercel's build step doesn't run
# `migrate`, so schema changes (e.g. new models) would otherwise never reach the
# live DB. A /tmp sentinel keeps this to once per warm instance, and any failure
# is swallowed so a transient DB hiccup can't take the whole API down.
_MIGRATE_SENTINEL = '/tmp/.migrated'
if not os.path.exists(_MIGRATE_SENTINEL):
    try:
        from django.core.management import call_command
        call_command('migrate', '--noinput', verbosity=0)
        with open(_MIGRATE_SENTINEL, 'w') as fh:
            fh.write('ok')
    except Exception as exc:  # never let a migration error break the API
        print(f'migrate on cold start failed: {exc}')

# Collect static into /tmp on cold start so WhiteNoise can serve the Django
# admin / DRF assets. The build step doesn't run collectstatic for the Python
# function, and the function filesystem is read-only except /tmp. Cached for the
# life of the warm instance, so this runs at most once per cold start.
_STATIC_DIR = '/tmp/staticfiles'
if not os.path.isdir(_STATIC_DIR):
    try:
        from django.conf import settings
        settings.STATIC_ROOT = _STATIC_DIR
        from django.core.management import call_command
        call_command('collectstatic', '--noinput', '--clear', verbosity=0)
    except Exception as exc:  # never let static collection break the API
        print(f'collectstatic on cold start failed: {exc}')

# Ensure the django_site domain matches the deployed URL (required by
# django-allauth for OAuth callback URL generation). Idempotent — safe to
# run on every cold start.
try:
    from django.contrib.sites.models import Site
    from django.conf import settings
    host = os.environ.get('FRONTEND_URL', '').removeprefix('https://').removeprefix('http://').rstrip('/')
    if host:
        Site.objects.update_or_create(id=settings.SITE_ID, defaults={'domain': host, 'name': 'Co-Map'})
except Exception as exc:
    print(f'site domain init failed (non-fatal): {exc}')

# Ensure writable media directory exists on Vercel (the app falls back to
# /tmp/mediafiles when no Supabase S3 storage is configured).
_MEDIA_DIR = '/tmp/mediafiles'
if not os.path.isdir(_MEDIA_DIR) and os.environ.get('VERCEL'):
    try:
        os.makedirs(_MEDIA_DIR, exist_ok=True)
    except Exception as exc:
        print(f'media dir creation failed: {exc}')

from django.core.wsgi import get_wsgi_application  # noqa: E402

application = get_wsgi_application()

# Wrap with WhiteNoise to also serve uploaded media from /tmp.
# WhiteNoise middleware in MIDDLEWARE handles STATIC_ROOT (admin/DRF assets);
# this wrapper handles MEDIA_ROOT (/tmp/mediafiles/) so photo URLs resolve.
from whitenoise import WhiteNoise  # noqa: E402
app = WhiteNoise(application)
# Only add the /tmp media directory on Vercel; otherwise use default behavior.
if os.environ.get('VERCEL'):
    app.add_files('/tmp/mediafiles', prefix='media/')
