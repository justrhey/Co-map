"""Custom DRF exception handler.

DRF's default handler already turns known API errors (validation, permission,
throttling, 404) into clean JSON. The risk is *unhandled* exceptions: by default
they become a 500 whose body, when DEBUG=True, contains a full traceback — and
even with DEBUG=False a stray exception can leak the str(exc) of a database error
(table/column names useful for SQLi probing).

This handler logs the full detail server-side (so Sentry / platform logs still
capture it) and returns a fixed, information-free message to the client.
"""
import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler

log = logging.getLogger('django.request')


def safe_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        # Unhandled — would otherwise be a raw 500. Record everything, reveal nothing.
        request = context.get('request')
        log.exception(
            'Unhandled API error at %s',
            getattr(request, 'path', '<unknown>'),
            exc_info=exc,
        )
        return Response({'detail': 'Internal server error.'}, status=500)
    return response
