/**
 * LiveMapPreview — a 3D globe on the landing page hero showing *real*
 * complaints from the API. Rotates slowly as a premium showcase.
 * Clicking it enters the full map experience.
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { fetchCachedComplaints } from '../api';

/* ── IntersectionObserver: only renders + animates when visible ── */
function useIsVisible(ref) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { setVisible(entry.isIntersecting); },
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

const GLOBE_CENTER = [121.02, 14.60]; // Metro Manila
const GLOBE_ZOOM = 9.4;               // zoomed onto Metro Manila only
// Keep the view locked over Metro Manila — never drift away across the globe.
const MM_BOUNDS = [
  [120.82, 14.30], // SW
  [121.20, 14.85], // NE
];

// Decide day vs night from the *actual* Manila clock (UTC+8), so the hero shows
// real daylight in the morning and a glowing night city after sunset.
function getManilaScene() {
  const nowUtcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  const manilaHour = new Date(nowUtcMs + 8 * 3600000).getHours();
  const isDay = manilaHour >= 6 && manilaHour < 18;       // 6am–6pm = daytime
  const isGolden = manilaHour >= 5 && manilaHour < 7;      // dawn
  const isDusk = manilaHour >= 17 && manilaHour < 19;      // sunset
  if (isDay) {
    return {
      isDay: true,
      style: 'https://tiles.openfreemap.org/styles/bright',
      fog: { range: [0.6, 9], color: '#bcdcff', 'high-color': '#7fb4ff', 'space-color': '#cfe6ff', 'horizon-blend': 0.18 },
      glowMax: isGolden || isDusk ? 0.55 : 0.28,  // daylight washes out light pollution
    };
  }
  return {
    isDay: false,
    style: 'https://tiles.openfreemap.org/styles/dark',
    fog: { range: [0.8, 8], color: '#0a1228', 'high-color': '#1e3a6e', 'space-color': '#05080f', 'horizon-blend': 0.1 },
    glowMax: 0.92,  // strong light pollution at night
  };
}

export default function LiveMapPreview({ onEnter }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const driftRef = useRef(null);
  const pauseRef = useRef(true);
  const [count, setCount] = useState(null);
  const [isDay] = useState(() => getManilaScene().isDay);
  const visible = useIsVisible(containerRef);

  // Sync visibility to a ref so the rAF callback can read it synchronously.
  useEffect(() => { pauseRef.current = !visible; }, [visible]);

  // Create the map once (not on every visibility change).
  useEffect(() => {
    const scene = getManilaScene();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: scene.style,        // bright basemap by day, dark by night
      center: GLOBE_CENTER,
      zoom: GLOBE_ZOOM,
      pitch: 45,
      bearing: 0,
      projection: 'globe',
      interactive: false,
      attributionControl: false,
      antialias: true,
      maxBounds: MM_BOUNDS,   // hard-lock the view to Metro Manila
    });
    mapRef.current = map;

    map.on('load', async () => {
      // Sky/atmosphere matches the time of day (blue daylight vs navy night).
      // Guard: setFog isn't available on every style/build — a failure here must
      // not abort the rest of load() (which adds the glow + pins).
      try { map.setFog?.(scene.fog); } catch { /* fog unsupported — skip */ }

      // Gentle orbit around Metro Manila — the camera slowly rotates its bearing
      // while staying centered on the metro (pauses when hero is off-screen).
      const rotate = () => {
        if (!mapRef.current) return;
        if (!pauseRef.current) {
          map.setBearing((map.getBearing() + 0.04) % 360);
        }
        driftRef.current = requestAnimationFrame(rotate);
      };
      driftRef.current = requestAnimationFrame(rotate);

      // Source of REAL complaints (no clustering — the heatmap aggregates them
      // into glow on the ground).
      map.addSource('preview-complaints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // ── Light-pollution glow: a heatmap renders ON THE GROUND PLANE (it
      // follows the map's pitch/tilt), not as a flat screen overlay. A warm
      // transparent→amber→white ramp over the dark city reads like the orange
      // sodium-light glow of a real metro seen from above. At night it's full
      // strength; daylight washes it down (scene.glowMax).
      map.addLayer({
        id: 'preview-glow',
        type: 'heatmap',
        source: 'preview-complaints',
        maxzoom: 22,
        paint: {
          'heatmap-weight': 1.4,
          // High intensity so even a sparse scatter of reports builds visible
          // bloom rather than staying below the ramp's first color stop.
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 1.4, 10, 2.6, 14, 3.6],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(0,0,0,0)',
            0.08, 'rgba(150,55,15,0.45)',
            0.25, 'rgba(225,95,25,0.65)',
            0.5,  'rgba(255,150,45,0.82)',
            0.78, 'rgba(255,205,115,0.93)',
            1,    'rgba(255,245,225,1)',
          ],
          // Large soft radius = diffuse light-pollution bloom, not sharp blobs.
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 26, 9, 55, 13, 90],
          'heatmap-opacity': scene.glowMax,
        },
      });

      // Crisp report pins sit on top of the glow so individual reports still read.
      map.addLayer({
        id: 'preview-points',
        type: 'circle',
        source: 'preview-complaints',
        minzoom: 8,
        paint: {
          'circle-color': scene.isDay ? '#e11d2e' : '#ff7a40',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 13, 5],
          'circle-blur': scene.isDay ? 0 : 0.5,   // pins themselves glow softly at night
          'circle-stroke-color': scene.isDay ? 'rgba(255,255,255,0.85)' : 'rgba(255,220,180,0.7)',
          'circle-stroke-width': 1,
          'circle-opacity': 0.95,
        },
      });

      try {
        const { data } = await fetchCachedComplaints({ page: '1' });
        const rows = data.results || [];
        setCount(data.count ?? rows.length);
        const features = rows
          .filter((c) => isFinite(c.latitude) && isFinite(c.longitude))
          .map((c) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
            properties: { id: c.id },
          }));
        const src = mapRef.current?.getSource('preview-complaints');
        if (src) src.setData({ type: 'FeatureCollection', features });
      } catch {
        /* preview is non-critical — leave it empty on failure */
      }
    });

    return () => {
      if (driftRef.current) cancelAnimationFrame(driftRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      className="map-preview-container live"
      style={{ background: isDay ? '#bcdcff' : '#05080f' }}
      onClick={onEnter}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(); }}
      title="Open the live map"
    >
      <div ref={containerRef} className="live-map-canvas" />

      <div className="map-preview-bar">
        <span className="map-preview-bar-text">
          <span className="live-dot" /> Live
        </span>
        <span className="map-preview-bar-text">Metro Manila</span>
        <span className="map-preview-bar-text">
          {count == null ? 'loading…' : `${count} report${count === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  );
}
