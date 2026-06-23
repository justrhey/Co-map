# 🗺️ Community Complaint Map

A community-powered platform where residents can **pin complaints on a map** — report potholes, broken streetlights, graffiti, and more. Built for scale from day one.

## Features

- 📍 **Pin-drop reporting** — tap the map, describe the issue, submit
- 🗺️ **Interactive map** — Leaflet.js with OpenStreetMap tiles + marker clustering
- 🏷️ **Category system** — 10 complaint categories with emoji indicators
- 🔍 **Filter pills** — filter complaints by category on the map
- 👁️ **Detail popups** — click a pin to see full description and details
- 🔒 **Rate limiting** — 10 submissions per hour per IP
- 🛡️ **Moderation panel** — Django admin for approve/hide/resolve workflows
- 📱 **Mobile-first** — responsive design with bottom sheet UI
- 🚀 **Built for scale** — paginated API, database indexes, Docker ready

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 15+ (PostGIS optional for MVP)
- Redis (optional, for persistent rate limiting)
- Docker (optional, for production deployment)

### 1. Clone & Setup

```bash
git clone <repo-url> complaint-map
cd complaint-map
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb complaints_db
createuser complaints_user --pwprompt  # password: complaints_pass
psql complaints_db -c "GRANT ALL ON SCHEMA public TO complaints_user;"
```

### 3. Run Migrations & Seed Data

```bash
python manage.py migrate
python manage.py createsuperuser  # admin / admin123
python manage.py seed_complaints  # optional: load sample data
```

### 4. Start Development Server

```bash
python manage.py runserver 0.0.0.0:8000
```

Visit **http://localhost:8000** for the map UI and **http://localhost:8000/admin/** for moderation.

### Docker (Production)

```bash
docker compose up -d
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/complaints/` | List complaints (paginated, 50/page) |
| `POST` | `/api/complaints/` | Submit a complaint |
| `GET` | `/api/complaints/:id/` | Get complaint details |
| `DELETE` | `/api/complaints/:id/` | Delete a complaint |

**Query params**: `?category=potholes` `?status=pending` `?page=2`

**POST body**:
```json
{
  "latitude": 14.5995,
  "longitude": 120.9842,
  "description": "Pothole on Main St near the gas station",
  "category": "potholes"
}
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Django 6.0 + Django REST Framework |
| **Frontend** | Leaflet.js + MarkerCluster + vanilla JS |
| **Map Tiles** | OpenStreetMap (free, no API key) |
| **Database** | PostgreSQL (PostGIS-ready for spatial queries) |
| **Rate Limiting** | DRF throttle classes (Redis-ready) |
| **Deployment** | Docker Compose (Django + PostGIS + Redis) |

## Project Structure

```
complaint-map/
├── config/              # Django project settings
│   ├── settings.py      # DRF, CORS, throttling, database
│   └── urls.py          # API routes + frontend SPA
├── complaints/          # Core app
│   ├── models.py        # Complaint model (lat/lng, category, status)
│   ├── api.py           # Serializers (list, detail, create)
│   ├── views.py         # ViewSet + rate limiting
│   └── admin.py         # Moderation panel
├── frontend/            # SPA frontend
│   ├── index.html       # Map viewport + bottom sheet
│   ├── app.js           # Leaflet map, pin drop, API calls
│   └── style.css        # Dark theme, responsive, animations
├── docker-compose.yml   # PostGIS + Redis + Django
├── Dockerfile           # Production container
└── README.md            # This file
```

## Next Up (v2)

- [ ] User authentication (community accounts)
- [ ] Photo uploads (stored on S3/CDN)
- [ ] Upvoting / commenting on complaints
- [ ] Real-time notifications (WebSocket)
- [ ] Offline support (PWA service worker)
- [ ] Custom vector tiles (Protomaps for 1M+ complaint scale)

## License

MIT
