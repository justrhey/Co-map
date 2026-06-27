/**
 * MapView — MapLibre GL map engine (replaces the Leaflet stack).
 *
 * Provides:
 *  - OpenFreeMap "positron" basemap (vector tiles, no API key)
 *  - 3D building extrusions (always on — the map opens tilted)
 *  - Per-complaint photo/icon "pole" markers (bordered head + #id)
 *  - Per-barangay colored fills + boundary lines + labels
 *  - Cool-spots (OSM POIs) overlay
 *  - A draggable report pin dropped by the corner man
 *  - Geolocate + navigation (zoom/rotate/pitch) controls
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Realistic location-pin (📍-style, drawn as SVG) dropped where the man lands.
// Tip sits on the lng/lat (anchor: 'bottom').
const PIN_SVG = `
  <svg viewBox="0 0 32 44" width="32" height="44" fill="none">
    <defs>
      <linearGradient id="rp-grad" x1="0" y1="0" x2="0" y2="44" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ff5a5f"/><stop offset="1" stop-color="#d62b30"/>
      </linearGradient>
    </defs>
    <path d="M16 2C8.8 2 3 7.8 3 15c0 9 10.5 18.7 13 27 2.5-8.3 13-18 13-27 0-7.2-5.8-13-13-13z"
          fill="url(#rp-grad)" stroke="#fff" stroke-width="1.6"/>
    <circle cx="16" cy="15" r="5.4" fill="#fff"/>
  </svg>
`;
const INITIAL_CENTER = [121.035, 14.565]; // [lng, lat]
const INITIAL_ZOOM = 12;

// Keep the camera over Metro Manila (+ Antipolo to the east) — users can't pan
// off into the open ocean or the rest of the world. [SW, NE] as [lng, lat].
const METRO_BOUNDS = [
  [120.82, 14.25],  // south-west
  [121.32, 14.88],  // north-east
];

// Major cities / districts to label boldly as map anchors for the heat.
// [name, lng, lat]
const MAJOR_PLACES = [
  ['Manila', 120.9842, 14.5995],
  ['Quezon City', 121.0437, 14.6760],
  ['Makati', 121.0244, 14.5547],
  ['Taguig', 121.0509, 14.5176],
  ['Pasig', 121.0851, 14.5764],
  ['Mandaluyong', 121.0353, 14.5794],
  ['San Juan', 121.0300, 14.6019],
  ['Pasay', 121.0000, 14.5378],
  ['Parañaque', 121.0198, 14.4793],
  ['Las Piñas', 120.9830, 14.4500],
  ['Muntinlupa', 121.0490, 14.3811],
  ['Marikina', 121.1029, 14.6507],
  ['Caloocan', 120.9700, 14.6510],
  ['Valenzuela', 120.9670, 14.7000],
  ['Malabon', 120.9560, 14.6620],
  ['Navotas', 120.9460, 14.6580],
  ['Antipolo', 121.1760, 14.5860],
  ['Binondo', 120.9750, 14.5996],
  ['Intramuros', 120.9750, 14.5906],
  ['Ortigas', 121.0560, 14.5860],
  ['BGC', 121.0500, 14.5510],
  ['Cubao', 121.0530, 14.6190],
];

const MAJOR_PLACES_GEOJSON = {
  type: 'FeatureCollection',
  features: MAJOR_PLACES.map(([name, lng, lat]) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { name },
  })),
};

// Bubble color by complaint category (matches the hotspot panel palette).
const CATEGORY_COLORS = {
  potholes: '#f59e0b', streetlight: '#06b6d4', graffiti: '#ec4899',
  illegal_dumping: '#ef4444', sidewalk: '#22c55e', traffic: '#eab308',
  noise: '#a855f7', water: '#3b82f6', park: '#10b981', other: '#6366f1',
};

// ── Time-of-day "mood" ───────────────────────────────────────────
// Buildings are colored solids (not outlines), tinted by the local hour.
// Night gives a cozy lit-from-within glow (taller buildings = warmer/brighter);
// day is clean and bright; dusk is a warm transition.
function moodForHour(h) {
  if (h >= 19 || h < 5) return 'night';
  if (h < 7 || h >= 17) return 'dusk';
  return 'day';
}

// Some building tiles carry a present-but-null/non-numeric height, which makes
// MapLibre's expression evaluator throw "Expected number, found null". `to-number`
// coerces those to a usable value (null/NaN → fall through to the 8m default).
const BUILDING_HEIGHT = ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height'], 8], 8];

// ── Building fill ─────────────────────────────────────────────────
// Simple, plain solid colour per time of day — no window pattern, no texture.
// Just clean grey structures; depth comes from the edge outline + lighting.
const BUILDING_FILL = {
  day:   '#d7d7d7',
  dusk:  '#c2c2c2',
  night: '#4a4a50',
};

// Buildings are a plain solid colour. The scene's depth comes from the
// ENVIRONMENT (green land, navy water), the edge outline and the lighting —
// not from any building texture/pattern.

// Environment palette per phase. KEY: land (bg) is a warm desaturated grey-green
// that is clearly NOT blue, so land never reads as water. Water is the only blue.
const BASE_THEME = {
  day:   { bg: '#2f3236', water: '#1c3a5e', park: '#27482f', wood: '#2b4a32', land: '#33373b' },
  dusk:  { bg: '#2b2a2c', water: '#1a3050', park: '#28412c', wood: '#2c4630', land: '#302e30' },
  night: { bg: '#1a1c2e', water: '#12203f', park: '#1a2733', wood: '#1c2935', land: '#1e2138' },
};

// Recolor the base style layers (water/parks/land) to the environment palette.
function applyBaseTheme(map, phase) {
  const t = BASE_THEME[phase] || BASE_THEME.day;
  const set = (layer, prop, val) => { if (map.getLayer(layer)) { try { map.setPaintProperty(layer, prop, val); } catch (e) { /* layer absent in style */ } } };
  // Land base — neutral warm grey, fully opaque so nothing blue shows through.
  set('background', 'background-color', t.bg);
  // Water — the only blue in the scene, fully opaque so it reads as water.
  set('water', 'fill-color', t.water);
  set('water', 'fill-opacity', 1);
  set('waterway', 'line-color', t.water);
  // Parks/woods — green, sitting on the land base.
  set('park', 'fill-color', t.park);
  set('park', 'fill-opacity', 0.95);
  set('landcover_wood', 'fill-color', t.wood);
  set('landcover_wood', 'fill-opacity', 0.6);
  // Residential — a subtle warm overlay on land (kept neutral, never blue).
  set('landuse_residential', 'fill-color', t.land);
  set('landuse_residential', 'fill-opacity', 0.35);
}
// Fully opaque — buildings are solid, never see-through.
const BUILDING_OPACITY = { day: 1, dusk: 1, night: 1 };
// Tilt the camera so the 3D city always reads as a dimensional scene.
const PHASE_PITCH = { day: 40, dusk: 45, night: 52 };

// Scene lighting per time of day. `anchor: 'map'` keeps the sun fixed to the
// world (so sides stay consistently shaded as you rotate). Lower intensity +
// warmer/cooler color gives the buildings dimensional, glowing depth.
// Higher intensity = a brighter lit face and a darker shadow face, so the
// directional contrast that gives buildings "structural sighting" is obvious.
const LIGHT = {
  day:   { anchor: 'map', color: '#ffffff', intensity: 0.75, position: [1.4, 200, 40] },
  dusk:  { anchor: 'map', color: '#ffd8a8', intensity: 0.8,  position: [1.5, 240, 25] },
  night: { anchor: 'map', color: '#8a93e0', intensity: 0.85, position: [1.5, 210, 18] },
};

// Per-phase edge color for the building-outline layer. A crisp, slightly
// darker stroke on every roof/footprint edge is what separates one building
// from the next at city zoom — the single biggest "structural" cue.
const BUILDING_EDGE = { day: '#9a9a9a', dusk: '#888888', night: '#7a7a7e' };

// Apply the current mood to an already-loaded map (buildings + dark zones).
// `tilt` only eases the camera on an actual phase change, so we don't fight
// the user's manual pitch every minute.
function applyMood(map, phase, tilt = false) {
  applyBaseTheme(map, phase);  // recolor water/parks/land for this time of day
  if (map.getLayer('3d-buildings')) {
    // Plain solid building colour for this time of day.
    map.setPaintProperty('3d-buildings', 'fill-extrusion-color', BUILDING_FILL[phase]);
    map.setLight(LIGHT[phase]);  // re-light the scene for the new time of day
  }
  // Recolor the crisp edge outline for this time of day.
  if (map.getLayer('building-outline')) {
    map.setPaintProperty('building-outline', 'line-color', BUILDING_EDGE[phase]);
  }
  // Re-tint the tree canopies for this time of day.
  if (map.getLayer('tree-cover-wood') || map.getLayer('tree-cover-park')) {
    try {
      if (map.hasImage('tree-pattern')) map.updateImage('tree-pattern', makeTreePattern(phase));
    } catch (e) { /* image not ready */ }
  }
  // Broken-streetlight reports cast a dark patch — only visible at night.
  if (map.getLayer('dark-zones')) {
    map.setLayoutProperty('dark-zones', 'visibility', phase === 'night' ? 'visible' : 'none');
  }
  // Ease the camera into a tilt that suits the time of day (phase change only).
  if (tilt) map.easeTo({ pitch: PHASE_PITCH[phase] ?? 0, duration: 1800 });
}

// Category glyphs for photo-less complaint markers (matches the old pins).
const CAT_SVG = {
  potholes: '<circle cx="12" cy="12" r="5.5"/><path d="M4 12h2M18 12h2"/>',
  streetlight: '<path d="M12 5v15"/><path d="M8 8h8"/><circle cx="12" cy="5" r="3"/><path d="M5 5h2M17 5h2"/>',
  graffiti: '<rect x="8" y="9" width="8" height="12" rx="2"/><path d="M12 9V6"/>',
  illegal_dumping: '<path d="M5 13h14M7 13v7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-7"/><path d="M9 9h6"/>',
  sidewalk: '<circle cx="12" cy="5" r="2"/><path d="M12 7v5M8 12l4 5 4-5"/>',
  traffic: '<rect x="9" y="3" width="6" height="18" rx="2"/><circle cx="12" cy="12" r="2"/>',
  noise: '<path d="M6 10h3l4-4v12l-4-4H6z"/><path d="M15 9a4 4 0 0 1 0 6"/>',
  water: '<path d="M12 2L4 14a8 8 0 0 0 16 0z"/>',
  park: '<path d="M12 4L4 15h16z"/><path d="M12 15v5"/>',
  other: '<circle cx="12" cy="12" r="10"/><path d="M12 9a3 3 0 1 1 0 5v1M12 17v.01"/>',
};

// Build a chat-bubble pin: a solid category-colored frame holding the report's
// photo (or category icon if none), with a tail pointing to the exact location.
function buildComplaintEl(c) {
  const color = CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other;
  const el = document.createElement('div');
  el.className = 'custom-marker marker-bubble';
  el.style.setProperty('--bubble-color', color);
  const inside = c.photo
    ? `<img class="bubble-img" src="${c.photo}" alt=""/>`
    : `<svg class="bubble-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CAT_SVG[c.category] || CAT_SVG.other}</svg>`;
  el.innerHTML = `
    <div class="bubble-body">
      <div class="bubble-square">${inside}</div>
    </div>
    <div class="bubble-tail"></div>`;
  return el;
}

// ── Tree texture ──────────────────────────────────────────────────
// Paint little tree canopies over wooded/park land so green areas read as
// actual foliage instead of flat green blobs. We draw a small tileable canvas
// of canopy dots once and register it as a repeatable fill-pattern image.
function makeTreePattern(phase) {
  const S = 64;
  const cvs = document.createElement('canvas');
  cvs.width = S; cvs.height = S;
  const ctx = cvs.getContext('2d');
  // Canopy colors tuned per time of day (lighter dome + darker base).
  const palette = {
    day:   ['#3f7d4a', '#2f6038'],
    dusk:  ['#3a6f44', '#2a5733'],
    night: ['#1f3a2a', '#16291e'],
  }[phase] || ['#3f7d4a', '#2f6038'];
  // A few canopies scattered so the tile repeats without obvious seams.
  const trees = [
    [16, 18, 9], [44, 12, 7], [30, 38, 10], [52, 46, 8], [10, 50, 7],
  ];
  for (const [x, y, r] of trees) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    g.addColorStop(0, palette[0]);
    g.addColorStop(1, palette[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, S, S);
}

// Register the tree pattern and add fill layers over wood/park areas.
function addTreeCover(map, phase) {
  try {
    if (!map.hasImage || !map.hasImage('tree-pattern')) {
      map.addImage('tree-pattern', makeTreePattern(phase), { pixelRatio: 2 });
    }
    const vectorSrc = firstVectorSourceId(map);
    if (!vectorSrc) return;
    const before = firstSymbolLayerId(map);
    // Wooded landcover (forests, scrub, grass-with-trees).
    if (!map.getLayer('tree-cover-wood')) {
      map.addLayer({
        id: 'tree-cover-wood',
        type: 'fill',
        source: vectorSrc,
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest', 'scrub', 'tree']]],
        minzoom: 12,
        paint: {
          'fill-pattern': 'tree-pattern',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13.5, 0.85],
        },
      }, before);
    }
    // Parks get a lighter scatter so they read as planted, not dense forest.
    if (!map.getLayer('tree-cover-park')) {
      map.addLayer({
        id: 'tree-cover-park',
        type: 'fill',
        source: vectorSrc,
        'source-layer': 'park',
        minzoom: 13,
        paint: {
          'fill-pattern': 'tree-pattern',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 0.55],
        },
      }, before);
    }
  } catch (e) {
    console.warn('Tree cover unavailable for this style:', e?.message);
  }
}

// Find the vector source id in the loaded style (so 3D buildings attach
// to the right source regardless of how the style names it).
function firstVectorSourceId(map) {
  const sources = map.getStyle().sources || {};
  for (const [id, src] of Object.entries(sources)) {
    if (src.type === 'vector') return id;
  }
  return null;
}

// Insert below the first text/symbol layer so labels stay on top.
function firstSymbolLayerId(map) {
  const layers = map.getStyle().layers || [];
  for (const l of layers) {
    if (l.type === 'symbol') return l.id;
  }
  return undefined;
}

export default function MapView({
  complaints,
  showCoolSpots,
  onMarkerClick,
  onCenterChange,
  onMapReady,
  reportPin,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const pinMarkerRef = useRef(null);
  const complaintMarkersRef = useRef(new Map());
  const reconcileRef = useRef(null);
  const coolFetchKeyRef = useRef('');
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState(() => moodForHour(new Date().getHours()));
  const zoomLabelRef = useRef(null);

  // Keep latest callbacks without re-initializing the map.
  const cbRef = useRef({});
  useEffect(() => {
    cbRef.current = { onMarkerClick, onCenterChange, onMapReady };
  });

  // ── Init map once ──────────────────────────────────────────────
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 10,
      maxZoom: 18,
      maxBounds: METRO_BOUNDS,   // can't pan beyond Metro Manila
      pitch: PHASE_PITCH[moodForHour(new Date().getHours())] ?? 0,
      bearing: 0,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        showUserLocation: false,
      }),
      'top-right'
    );

    // Write the zoom label straight to the DOM — avoids a React re-render
    // on every frame of the zoom animation (which is what caused the lag).
    map.on('zoom', () => {
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `Z${map.getZoom().toFixed(1)}`;
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      cbRef.current.onCenterChange?.({ lat: c.lat, lng: c.lng });
    });

    map.on('load', () => {
      // Recolor the basemap (water/parks/land) for the current time of day —
      // this is where the scene's color depth comes from.
      applyBaseTheme(map, moodForHour(new Date().getHours()));

      // Scatter tree canopies over wooded/park areas so greenery reads as foliage.
      addTreeCover(map, moodForHour(new Date().getHours()));

      // ── Native 3D building extrusions — simple plain solid colour ──
      const vectorSrc = firstVectorSourceId(map);
      const phase = moodForHour(new Date().getHours());
      map.setLight(LIGHT[phase]);
      if (vectorSrc) {
        try {
          map.addLayer(
            {
              id: '3d-buildings',
              source: vectorSrc,
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 13,
              layout: { visibility: 'visible' },
              paint: {
                // Plain solid colour — clean, simple structures.
                'fill-extrusion-color': BUILDING_FILL[phase],
                'fill-extrusion-height': BUILDING_HEIGHT,
                'fill-extrusion-base': [
                  'to-number',
                  ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
                  0,
                ],
                'fill-extrusion-opacity': BUILDING_OPACITY[phase],
                'fill-extrusion-vertical-gradient': true,
              },
            },
            firstSymbolLayerId(map)
          );
          // Crisp edge outline on every building footprint/roof — this is the
          // main "structural sighting" cue, separating each building at zoom.
          map.addLayer(
            {
              id: 'building-outline',
              source: vectorSrc,
              'source-layer': 'building',
              type: 'line',
              minzoom: 14,
              paint: {
                'line-color': BUILDING_EDGE[phase],
                'line-opacity': 0.7,
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  14, 0.4,
                  17, 1.2,
                  20, 2,
                ],
              },
            },
            firstSymbolLayerId(map)
          );
        } catch (e) {
          console.warn('3D buildings unavailable for this style:', e?.message);
        }
      }

      // Complaints render as individual HTML "pole" markers (see effect below).

      // ── Barangay boundaries + labels ──
      // No colorful tint anymore — the basemap stays clean and neutral so the
      // 3D buildings carry the visual weight. Just faint boundary lines + labels.
      const groundBefore = map.getLayer('3d-buildings') ? '3d-buildings' : firstSymbolLayerId(map);
      fetch('/barangays-metro-manila.json')
        .then((r) => r.json())
        .then((data) => {
          if (!map.getSource('barangays')) {
            map.addSource('barangays', { type: 'geojson', data });
            map.addLayer({
              id: 'barangay-lines',
              type: 'line',
              source: 'barangays',
              paint: {
                'line-color': 'rgba(255,255,255,0.10)',
                'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 16, 1],
              },
            }, groundBefore);
            map.addLayer({
              id: 'barangay-labels',
              type: 'symbol',
              source: 'barangays',
              minzoom: 15,
              layout: {
                'text-field': ['coalesce', ['get', 'NAME_3'], ''],
                'text-font': ['Noto Sans Regular'],
                'text-size': 11,
              },
              paint: {
                'text-color': 'rgba(200,208,218,0.7)',
                'text-halo-color': 'rgba(5,7,13,0.6)',
                'text-halo-width': 1,
              },
            });
          }
        })
        .catch((err) => console.error('Failed to load barangay boundaries:', err));

      // ── Complaints: unclustered GeoJSON source ──
      // Every report shows as its own chat-bubble marker at all zooms (no
      // numbered cluster circles). The reconcile effect below mounts one HTML
      // marker per point currently in view.
      map.addSource('complaints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: false,
      });

      // ── Dark zones: broken-streetlight reports make the area go dark ──
      // A soft black halo, blended to "subtract" light. Only shown at night
      // (toggled in applyMood). Fed from the complaints effect below.
      map.addSource('dark-zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'dark-zones',
        type: 'circle',
        source: 'dark-zones',
        layout: { visibility: moodForHour(new Date().getHours()) === 'night' ? 'visible' : 'none' },
        paint: {
          // Grows with zoom so it reads as a patch of street, not a dot.
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 12, 14, 16, 70, 18, 180],
          'circle-color': '#05070d',
          'circle-opacity': 0.55,
          'circle-blur': 1,
        },
      }, map.getLayer('3d-buildings') ? '3d-buildings' : firstSymbolLayerId(map));

      // ── Complaint heat map ────────────────────────────────────
      // A heat-bloom that shows WHERE problems concentrate, weighted so open /
      // unresolved (and dangerous) reports burn hotter than resolved ones. Most
      // visible when zoomed out; fades as the real pins take over up close.
      map.addSource('complaint-heat', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'complaint-heat',
        type: 'heatmap',
        source: 'complaint-heat',
        maxzoom: 16,
        paint: {
          // Per-point weight comes from the feature's `weight` property
          // (open/dangerous = higher → hotter).
          'heatmap-weight': ['coalesce', ['get', 'weight'], 1],
          // Intensity ramps with zoom so it stays readable at every altitude.
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 13, 1.4, 16, 2.2],
          // Cool → hot color ramp (transparent → blue → green → amber → red).
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.15, 'rgba(59,130,246,0.45)',
            0.35, 'rgba(34,197,94,0.55)',
            0.55, 'rgba(245,158,11,0.7)',
            0.8, 'rgba(239,68,68,0.85)',
            1, 'rgba(220,38,38,0.95)',
          ],
          // Radius grows with zoom for a soft, blooming patch.
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 18, 12, 36, 15, 60],
          // Fade the whole layer out as pins take over.
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.9, 15, 0.5, 16, 0],
        },
      }, firstSymbolLayerId(map));

      // ── Bold major-city / district labels (map anchors) ───────
      map.addSource('major-places', { type: 'geojson', data: MAJOR_PLACES_GEOJSON });
      map.addLayer({
        id: 'major-places',
        type: 'symbol',
        source: 'major-places',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 13, 12, 17, 15, 21],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-allow-overlap': false,
          'text-padding': 6,
        },
        paint: {
          'text-color': '#f0f4f8',
          'text-halo-color': 'rgba(5,7,13,0.85)',
          'text-halo-width': 1.8,
          'text-halo-blur': 0.4,
          // Slightly dim the labels up close so they don't fight the pins.
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 14, 1, 16, 0.65],
        },
      });

      // ── Cool-spots overlay source (data filled on demand) ──
      map.addSource('cool-spots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'cool-spots-points',
        type: 'circle',
        source: 'cool-spots',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 6,
          'circle-color': '#6366f1',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'cool-spots-labels',
        type: 'symbol',
        source: 'cool-spots',
        layout: {
          visibility: 'none',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#4338ca',
          'text-halo-color': 'rgba(255,255,255,0.9)',
          'text-halo-width': 1,
        },
      });

      setReady(true);
      cbRef.current.onMapReady?.(map);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Feed the dark-zones (night) + heatmap sources from complaint data ──
  // (Complaint markers are mounted directly from the prop in the effect below.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const valid = (complaints || []).filter((c) => isFinite(c.latitude) && isFinite(c.longitude));

    // Heatmap: weight open/unresolved hotter; resolved cool down.
    const heatSrc = map.getSource('complaint-heat');
    if (heatSrc) {
      heatSrc.setData({
        type: 'FeatureCollection',
        features: valid.map((c) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
          properties: { weight: c.status === 'resolved' ? 0.4 : c.status === 'approved' ? 0.8 : 1.2 },
        })),
      });
    }

    // Dark zones: broken streetlights still unresolved leave the area dark.
    const darkSrc = map.getSource('dark-zones');
    if (darkSrc) {
      darkSrc.setData({
        type: 'FeatureCollection',
        features: valid
          .filter((c) => c.category === 'streetlight' && c.status !== 'resolved')
          .map((c) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
            properties: { id: c.id },
          })),
      });
    }
  }, [complaints, ready]);

  // ── Time-of-day mood: re-tint buildings + toggle dark zones each minute ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let prev = null;
    const tick = () => {
      const p = moodForHour(new Date().getHours());
      applyMood(map, p, p !== prev); // tilt only when the phase actually changes
      prev = p;
      setPhase(p);
    };
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, [ready]);


  // ── Mount one HTML chat-bubble marker per report, in the viewport ──
  // Driven directly by the `complaints` prop (not the map source), so markers
  // don't depend on a rendered layer to exist. Only points within the padded
  // viewport get a DOM node, which keeps the count low when zoomed in; zoomed
  // out, the whole (Metro-Manila-scoped) set is small enough to show in full.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const markers = complaintMarkersRef.current; // Map<id, maplibregl.Marker>
    const points = (complaints || [])
      .filter((c) => isFinite(c.latitude) && isFinite(c.longitude));

    const reconcile = () => {
      const bounds = map.getBounds();
      // Pad the bounds a little so markers near the edge don't pop in/out.
      const pad = 0.15;
      const west = bounds.getWest() - pad, east = bounds.getEast() + pad;
      const south = bounds.getSouth() - pad, north = bounds.getNorth() + pad;
      const seen = new Set();

      for (const c of points) {
        if (c.latitude < south || c.latitude > north || c.longitude < west || c.longitude > east) continue;
        seen.add(c.id);
        if (markers.has(c.id)) continue;
        const el = buildComplaintEl(c);
        el.addEventListener('click', (ev) => { ev.stopPropagation(); cbRef.current.onMarkerClick?.(c.id); });
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([c.longitude, c.latitude])
          .addTo(map);
        markers.set(c.id, marker);
      }
      // Drop markers that scrolled out of view or are no longer in the data.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) { marker.remove(); markers.delete(id); }
      }
    };
    reconcileRef.current = reconcile;

    map.on('moveend', reconcile);
    reconcile();
    return () => {
      map.off('moveend', reconcile);
      for (const [, marker] of markers) marker.remove();
      markers.clear();
    };
  }, [complaints, ready]);

  // ── Place / move the dropped report pin ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!reportPin) {
      if (pinMarkerRef.current) { pinMarkerRef.current.remove(); pinMarkerRef.current = null; }
      return;
    }
    if (!pinMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'report-pin';
      el.innerHTML = PIN_SVG;
      pinMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([reportPin.lng, reportPin.lat])
        .addTo(map);
    } else {
      pinMarkerRef.current.setLngLat([reportPin.lng, reportPin.lat]);
    }
  }, [reportPin, ready]);

  // ── Cool-spots: toggle visibility + fetch on move when visible ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setVis = (v) => {
      ['cool-spots-points', 'cool-spots-labels'].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
      });
    };

    const fetchSpots = async () => {
      const b = map.getBounds();
      const pad = 0.005;
      const bbox = `${b.getSouth() - pad},${b.getWest() - pad},${b.getNorth() + pad},${b.getEast() + pad}`;
      const key = `${map.getCenter().lat.toFixed(3)},${map.getCenter().lng.toFixed(3)}`;
      if (coolFetchKeyRef.current === key) return;
      coolFetchKeyRef.current = key;
      const query = `[out:json];(
        node["tourism"~"attraction|museum|artwork"](${bbox});
        node["leisure"~"park|garden|playground"](${bbox});
        node["amenity"~"library|theatre|cinema|townhall|community_centre|place_of_worship"](${bbox});
        node["historic"~"monument|memorial"](${bbox});
      );out center 50;`;
      try {
        const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        const seen = new Set();
        const features = (data.elements || [])
          .map((el) => ({ lat: el.lat ?? el.center?.lat, lng: el.lon ?? el.center?.lon, name: el.tags?.name }))
          .filter((p) => p.lat && p.lng && p.name)
          .filter((p) => { const k = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`; if (seen.has(k)) return false; seen.add(k); return true; })
          .slice(0, 50)
          .map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { name: p.name } }));
        const src = map.getSource('cool-spots');
        if (src) src.setData({ type: 'FeatureCollection', features });
      } catch { /* silently ignore */ }
    };

    const run = () => {
      if (!map.isStyleLoaded()) { map.once('idle', run); return; }
      setVis(showCoolSpots);
      if (showCoolSpots) fetchSpots();
    };
    run();

    if (!showCoolSpots) return;
    map.on('moveend', fetchSpots);
    return () => map.off('moveend', fetchSpots);
  }, [showCoolSpots]);

  return (
    <>
      <div ref={containerRef} className={`map-container${ready ? ' map-loaded' : ''}`} />
      {/* Loading skeleton — shown until map style + tiles load */}
      {!ready && (
        <div className="map-skeleton" aria-hidden="true">
          <div className="map-skeleton-shimmer" />
          <div className="map-skeleton-label">Loading map...</div>
        </div>
      )}
      {/* Empty state — shown when map is loaded but no complaints exist */}
      {ready && complaints && complaints.length === 0 && (
        <div className="map-empty" aria-label="No reports yet">
          <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="24" cy="24" r="20" />
            <line x1="24" y1="16" x2="24" y2="24" />
            <line x1="24" y1="30" x2="24.01" y2="30" />
          </svg>
          <p className="map-empty-title">No reports in this area</p>
          <p className="map-empty-sub">Tap the + or drag the marker to report an issue</p>
        </div>
      )}
      {/* Atmosphere: warm at dusk, deep-blue cozy at night, nothing by day. */}
      <div className={`map-atmosphere mood-${phase}`} aria-hidden="true" />
      <div className="zoom-indicator" ref={zoomLabelRef}>Z{INITIAL_ZOOM}</div>
    </>
  );
}
