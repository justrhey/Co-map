#!/usr/bin/env bash
# Mirror the CI pipeline locally for debugging (Django backend + Vite frontend).
# Runs the same stages CI runs, so a green local run means a green CI run.
#
#   Usage: ./scripts/ci-local.sh
set -euo pipefail

# Resolve repo root (this script lives in scripts/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Running CI pipeline locally..."

# ── Backend ──
echo "[1/4] Django system checks"
python manage.py check --settings=config.test_settings

echo "[2/4] Backend test suite"
python manage.py test --settings=config.test_settings --parallel

# ── Frontend ──
echo "[3/4] Frontend lint"
( cd frontend && npm run lint )

echo "[4/4] Frontend build"
( cd frontend && npm run build )

echo "Local CI pipeline passed."
