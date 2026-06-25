"""Terrain validation for community complaints.

Validates that a complaint's category makes sense for its geographic terrain.
For example, a pothole report in the middle of a river is rejected.

Uses static Metro Manila water body data for fast local detection, with
the Overpass API as a fallback for features not covered by the static set.
"""
import math
import logging
import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
OVERPASS_TIMEOUT = 10  # seconds

# ═════════════════════════════════════════════════════════════════════
#  STATIC WATER BODIES — Metro Manila
# ═════════════════════════════════════════════════════════════════════
# These catch the obvious cases (pothole in a river/lake/bay) without
# requiring an external API call. Coordinates are approximate and
# should catch reports clearly within a body of water — borderline
# shoreline reports are allowed through to the Overpass fallback.

# ── Bounding boxes (min_lat, max_lat, min_lng, max_lng) ──────────────
_WATER_BOXES = [
    # Manila Bay (western Metro Manila coastline)
    (14.30, 14.72, 120.82, 120.965),

    # Laguna de Bay (south-east of Metro Manila)
    (14.18, 14.47, 121.05, 121.55),

    # La Mesa Dam / Reservoir (north Quezon City)
    (14.69, 14.72, 121.05, 121.09),

    # Lower Wawa Dam / Montalban area (north-east)
    (14.73, 14.78, 121.13, 121.20),
]

# ── River centerlines (lat, lng) with buffer in degrees (~111m/°) ────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance between two coordinates in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _min_distance_to_linestring(lat: float, lng: float, segments: list) -> float:
    """Minimum distance (km) from a point to any segment of a linestring."""
    min_dist = float('inf')
    for i in range(len(segments) - 1):
        lat1, lng1 = segments[i]
        lat2, lng2 = segments[i + 1]
        dist = _point_to_segment_km(lat, lng, lat1, lng1, lat2, lng2)
        if dist < min_dist:
            min_dist = dist
    return min_dist


def _point_to_segment_km(
    plat: float, plng: float,
    lat1: float, lng1: float,
    lat2: float, lng2: float,
) -> float:
    """Perpendicular distance (km) from point *p* to segment *s1-s2*."""
    # Project p onto the segment's line using dot product, then clamp.
    # Work in approximate Cartesian coordinates (km) for the math.
    mid_lat = (lat1 + lat2) / 2
    cos_mid = math.cos(math.radians(mid_lat))

    dx = (lng2 - lng1) * cos_mid * 111.32
    dy = (lat2 - lat1) * 111.32
    seg_len_sq = dx * dx + dy * dy

    if seg_len_sq < 1e-12:
        return _haversine_km(plat, plng, lat1, lng1)

    # Dot product of (p - s1) · (s2 - s1)
    t = (
        ((plat - lat1) * 111.32) * dy +
        ((plng - lng1) * 111.32 * cos_mid) * dx
    ) / seg_len_sq
    t = max(0.0, min(1.0, t))

    proj_lat = lat1 + t * (lat2 - lat1)
    proj_lng = lng1 + t * ((lng2 - lng1) * cos_mid) / cos_mid

    return _haversine_km(plat, plng, proj_lat, proj_lng)


# Pasig River centerline — from Manila Bay to Laguna de Bay
# Each segment is a (lat, lng) vertex.
_PASIG_RIVER = [
    (14.594, 120.972),  # Bay mouth
    (14.590, 120.980),
    (14.580, 120.990),
    (14.571, 121.000),
    (14.568, 121.015),
    (14.566, 121.030),
    (14.565, 121.045),
    (14.568, 121.048),
    (14.562, 121.055),
    (14.555, 121.070),
    (14.545, 121.085),
    (14.535, 121.100),
    (14.520, 121.115),
    (14.510, 121.125),
]
_PASIG_BUFFER_KM = 0.15  # ~150 m

# Marikina River centerline
_MARIKINA_RIVER = [
    (14.650, 121.055),
    (14.640, 121.057),
    (14.630, 121.060),
    (14.620, 121.062),
    (14.610, 121.065),
    (14.600, 121.062),
    (14.590, 121.058),
]
_MARIKINA_BUFFER_KM = 0.08  # ~80 m

# San Juan River / Estero de San Miguel
_SAN_JUAN_RIVER = [
    (14.583, 121.038),
    (14.580, 121.030),
    (14.577, 121.025),
    (14.575, 121.020),
    (14.573, 121.015),
    (14.572, 121.010),
    (14.571, 121.005),
]
_SAN_JUAN_BUFFER_KM = 0.06  # ~60 m

# Tullahan River (north Metro Manila)
_TULLAHAN_RIVER = [
    (14.625, 120.970),
    (14.630, 120.980),
    (14.635, 120.990),
    (14.640, 121.000),
    (14.645, 121.010),
    (14.650, 121.020),
]
_TULLAHAN_BUFFER_KM = 0.06


def _in_static_water(lat: float, lng: float) -> bool:
    """Check if a coordinate falls within a known static water body."""
    # 1. Bounding boxes
    for min_lat, max_lat, min_lng, max_lng in _WATER_BOXES:
        if min_lat <= lat <= max_lat and min_lng <= lng <= max_lng:
            logger.debug(
                'Static water match: coords (%s, %s) inside box [%s..%s, %s..%s]',
                lat, lng, min_lat, max_lat, min_lng, max_lng,
            )
            return True

    # 2. River buffers
    if _min_distance_to_linestring(lat, lng, _PASIG_RIVER) <= _PASIG_BUFFER_KM:
        logger.debug('Static water match: coords (%s, %s) near Pasig River', lat, lng)
        return True
    if _min_distance_to_linestring(lat, lng, _MARIKINA_RIVER) <= _MARIKINA_BUFFER_KM:
        logger.debug('Static water match: coords (%s, %s) near Marikina River', lat, lng)
        return True
    if _min_distance_to_linestring(lat, lng, _SAN_JUAN_RIVER) <= _SAN_JUAN_BUFFER_KM:
        logger.debug('Static water match: coords (%s, %s) near San Juan River', lat, lng)
        return True
    if _min_distance_to_linestring(lat, lng, _TULLAHAN_RIVER) <= _TULLAHAN_BUFFER_KM:
        logger.debug('Static water match: coords (%s, %s) near Tullahan River', lat, lng)
        return True

    return False


# ═════════════════════════════════════════════════════════════════════
#  OVERPASS API FALLBACK
# ═════════════════════════════════════════════════════════════════════

def _overpass_query(query: str) -> dict | None:
    """Send a query to the Overpass API and return the JSON response."""
    try:
        resp = requests.post(
            OVERPASS_URL,
            data={'data': query},
            timeout=OVERPASS_TIMEOUT,
            headers={
                'User-Agent': 'Co-Map/1.0 (complaint terrain validation; co-map.app)',
                'Accept': 'application/json',
            },
        )
        resp.raise_for_status()
        return resp.json()
    except requests.Timeout:
        logger.warning('Overpass API timed out (%ss).', OVERPASS_TIMEOUT)
        return None
    except requests.RequestException as e:
        logger.warning('Overpass API request failed: %s', e)
        return None


def _overpass_water_check(lat: float, lng: float) -> bool | None:
    """Use Overpass API to detect water features near a coordinate.

    Returns ``True`` if water is detected, ``False`` if not, and ``None``
    if the API is unreachable.
    """
    query = (
        '[out:json][timeout:8];\n'
        '(\n'
        f'  way["natural"="water"](around:20, {lat}, {lng});\n'
        f'  way["waterway"](around:20, {lat}, {lng});\n'
        f'  way["landuse"="reservoir"](around:20, {lat}, {lng});\n'
        f'  relation["natural"="water"](around:20, {lat}, {lng});\n'
        f'  relation["waterway"](around:20, {lat}, {lng});\n'
        ');\n'
        'out tags 5;'
    )

    result = _overpass_query(query)
    if result is None:
        return None  # API unavailable

    elements = result.get('elements', [])
    return len(elements) > 0


# ═════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═════════════════════════════════════════════════════════════════════

# ── Category → terrain restrictions ─────────────────────────────────
# Categories not listed here are allowed anywhere.
RESTRICTIONS = {
    'potholes': {
        'forbidden': ['water'],
        'message': (
            "A pothole/road damage report doesn't make sense at this location — "
            "it appears to be on a water body. Please verify the location pin."
        ),
    },
    'streetlight': {
        'forbidden': ['water'],
        'message': (
            "A broken streetlight report doesn't make sense at this location — "
            "it appears to be on a water body. Please verify the location pin."
        ),
    },
    'sidewalk': {
        'forbidden': ['water'],
        'message': (
            "A damaged sidewalk report doesn't make sense at this location — "
            "it appears to be on a water body. Please verify the location pin."
        ),
    },
    'traffic': {
        'forbidden': ['water'],
        'message': (
            "A traffic sign/signal report doesn't make sense at this location — "
            "it appears to be on a water body. Please verify the location pin."
        ),
    },
    'park': {
        'forbidden': ['water'],
        'message': (
            "A park/public space report doesn't make sense at this location — "
            "it appears to be on a water body. Please verify the location pin."
        ),
    },
    'graffiti': {
        'forbidden': ['water'],
        'message': (
            "A graffiti/vandalism report doesn't make sense at this location — "
            "it appears to be on a water body. Please verify the location pin."
        ),
    },
    'noise': {
        'forbidden': ['water'],
        'message': (
            "A noise complaint doesn't make sense at this location — "
            "it appears to be on a water body. Please verify the location pin."
        ),
    },
    'illegal_dumping': {
        'forbidden': ['water'],
        'message': (
            "An illegal dumping report doesn't make sense at this location — "
            "it appears to be on a water body. Please drag the pin to a land location."
        ),
    },
    'water': {
        'forbidden': ['water'],
        'message': (
            "A water/drainage issue report doesn't make sense from inside a water body. "
            "Please place the pin on land near the affected area."
        ),
    },
}


def is_water_terrain(lat: float, lng: float) -> bool:
    """Check whether a coordinate is in or very near a water body.

    Two-layer approach:
    1. Static water body data (fast, local, no API dependency)
    2. Overpass API fallback for areas not covered by static data

    Results are cached per ~111-metre grid cell (3 decimal places).
    Returns *False* when the Overpass fallback is unreachable (fail-open).
    """
    cache_key = f'terrain_water_{round(lat, 3)}_{round(lng, 3)}'

    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Layer 1: static data — fast, local, no network
    if _in_static_water(lat, lng):
        cache.set(cache_key, True, 3600)
        return True

    # Layer 2: Overpass API fallback — disabled by default so the submission
    # request never blocks on a synchronous external call. Enable explicitly
    # via TERRAIN_OVERPASS_ENABLED once it runs off the request path.
    if not getattr(settings, 'TERRAIN_OVERPASS_ENABLED', False):
        return False

    result = _overpass_water_check(lat, lng)

    if result is None:
        # API failed — allow the submission. Cache briefly to avoid hammering.
        cache.set(cache_key, False, 60)
        return False

    cache.set(cache_key, result, 3600)
    return result


def classify_terrain(lat: float, lng: float) -> str:
    """Classify terrain at a coordinate.

    Currently detects ``water`` vs everything else (``land``).
    Returns one of ``{'water', 'land'}``.
    """
    return 'water' if is_water_terrain(lat, lng) else 'land'


def validate_complaint_terrain(
    category: str, lat: float, lng: float,
) -> tuple[bool, str | None]:
    """Validate a complaint category against the terrain at *(lat, lng)*.

    Returns ``(is_valid, error_message)``. When valid, *error_message* is
    ``None``. When invalid, *error_message* explains why so it can be shown
    directly to the user.
    """
    restriction = RESTRICTIONS.get(category)
    if not restriction:
        return True, None

    terrain = classify_terrain(lat, lng)

    if terrain in restriction['forbidden']:
        return False, restriction['message']

    return True, None
