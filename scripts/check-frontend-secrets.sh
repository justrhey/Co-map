#!/usr/bin/env bash
# Fail the build if a real secret pattern lands in the frontend source.
# Anything Vite ships is PUBLIC (baked into the JS bundle), so only
# publishable/DSN-style values may appear there. Wire this into CI before
# `npm run build`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/frontend/src"

# Google OAuth client secret, Google API key, Stripe live key, AWS key id,
# Supabase service-role JWT marker, and PEM private keys.
PATTERN='GOCSPX-|AIza[0-9A-Za-z_-]{20,}|sk_live_|AKIA[0-9A-Z]{16}|service_role|-----BEGIN'

if grep -rEnI "$PATTERN" "$TARGET"; then
  echo "❌ Possible secret found in frontend source (see matches above)." >&2
  echo "   Frontend env vars (VITE_*) are public — never put secrets there." >&2
  exit 1
fi

echo "✅ No secret patterns in frontend/src"
