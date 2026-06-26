"""Vercel Python serverless entrypoint for the Django backend.

Vercel's @vercel/python runtime looks for a module-level `app` (WSGI callable)
in this file. All requests routed here by vercel.json (/api/*, /admin/*,
/accounts/*, /static/*) are handed to Django's WSGI application.

Static files are served by WhiteNoise (already in MIDDLEWARE); media is served
from Supabase Storage, so the function itself never touches the filesystem.
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

from django.core.wsgi import get_wsgi_application  # noqa: E402

app = get_wsgi_application()
