# CI/CD Pipeline

Co-Map runs its quality pipeline on **GitHub Actions**. It is adapted to this
repo's real stack: a **Django** backend (Python) and a **React + Vite**
frontend. There is no Playwright/Cypress e2e suite; the backend tests are
Django's `manage.py test`.

## Workflows

| File | Trigger | Purpose |
|---|---|---|
| `.github/workflows/test.yml` | push + PR to `main`/`develop` | Lint, build, and test on every change |
| `.github/workflows/burn-in.yml` | PR to `main`/`develop`, weekly cron, manual | Flaky-test detection (suite run 10×) |

## Pipeline stages (`test.yml`)

1. **Backend tests** — `python manage.py test --settings=config.test_settings --parallel`
   - Uses in-memory SQLite (`config/test_settings.py`), so no database service is needed.
   - `python manage.py check` runs first as a fast validation gate.
2. **Frontend lint & build** — `npm run lint` then `npm run build` (Vite).
3. **CI passed** — a single required gate that both lanes must satisfy (use this as the branch-protection status check).

Caching: pip cache keyed on `requirements.txt`, npm cache keyed on
`frontend/package-lock.json`. Concurrency cancels superseded runs on the same ref.

## Burn-in (flaky detection)

`burn-in.yml` runs the Django suite repeatedly (default 10 iterations). A single
failure across the iterations means a test is non-deterministic and must be
fixed before merge. It runs on PRs and weekly, never on every push (too slow).

Run a custom count manually from the Actions tab (`workflow_dispatch` →
`iterations`), or locally:

```bash
./scripts/burn-in.sh 10
```

## Run CI locally

Mirror the whole pipeline before pushing:

```bash
./scripts/ci-local.sh
```

This runs Django checks + tests, then frontend lint + build — the same stages CI runs.

## Runtime versions

- **Python**: 3.12 (Django 5/6 compatible)
- **Node**: 22 (required by Vite 8)

If you pin versions, add a `.nvmrc` (Node) and update `python-version` in both
workflow files.

## Debugging a failed run

- **Backend failure** → download the `backend-test-log` artifact (uploaded on failure) for the full test output.
- **Burn-in failure** → download `burn-in-failures` artifacts; the iteration number in the log name tells you which run flaked.
- **Frontend failure** → check the lint/build step logs; `frontend/dist` is uploaded on failure.

## Secrets

The default pipeline needs **no secrets** (tests use SQLite + locmem email). If
you later add Slack notifications, a real DB service, or coverage upload, see
[`ci-secrets-checklist.md`](./ci-secrets-checklist.md).

## Status badge

Add to the project README once pushed:

```markdown
![CI](https://github.com/justrhey/Co-map/actions/workflows/test.yml/badge.svg)
```
