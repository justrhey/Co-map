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

from django.core.wsgi import get_wsgi_application  # noqa: E402

app = get_wsgi_application()
