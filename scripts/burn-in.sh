#!/usr/bin/env bash
# Standalone burn-in: run the Django suite N times to catch flaky tests.
# Even ONE failure means a test is non-deterministic and must be fixed.
#
#   Usage: ./scripts/burn-in.sh [iterations]   (default: 10)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ITER="${1:-10}"
echo "Burn-in: running the test suite $ITER times..."

for i in $(seq 1 "$ITER"); do
  echo "--- Burn-in iteration $i/$ITER ---"
  if ! python manage.py test --settings=config.test_settings --verbosity 1; then
    echo "FLAKY: suite failed on iteration $i/$ITER"
    exit 1
  fi
done

echo "All $ITER iterations passed — suite is stable."
