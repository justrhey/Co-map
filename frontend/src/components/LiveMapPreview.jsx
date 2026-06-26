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

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const GLOBE_CENTER = [121.035, 14.565]; // Metro Manila
const GLOBE_ZOOM = 3.2;

export default function LiveMapPreview({ onEnter }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const driftRef = useRef(null);
  const pauseRef = useRef(true);
  const [count, setCount] = useState(null);
  const visible = useIsVisible(containerRef);

  // Sync visibility to a ref so the rAF callback can read it synchronously.
  useEffect(() => { pauseRef.current = !visible; }, [visible]);

  // Create the map once (not on every visibility change).
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: GLOBE_CENTER,
      zoom: GLOBE_ZOOM,
      projection: 'globe',
      interactive: false,
      attributionControl: false,
      antialias: true,
    });
    mapRef.current = map;

    map.on('load', async () => {
      // Atmospheric glow around the globe.
      map.setFog({
        range: [0.8, 8],
        color: '#0a0e13',
        'high-color': '#111827',
        'space-color': '#000000',
        'horizon-blend': 0.1,
      });

      // Slow 3D globe rotation (pauses via pauseRef when hero is off-screen).
      let angle = 0;
      const rotate = () => {
        if (!mapRef.current) return;
        if (!pauseRef.current) {
          map.setCenter([
            GLOBE_CENTER[0] + angle,
            GLOBE_CENTER[1] + Math.sin(angle * 0.3) * 2,
          ]);
          angle += 0.005;
        }
        driftRef.current = requestAnimationFrame(rotate);
      };
      driftRef.current = requestAnimationFrame(rotate);

      // Clustered source of REAL complaints (shown as glowing pins).
      map.addSource('preview-complaints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 50,
      });
      map.addLayer({
        id: 'preview-clusters',
        type: 'circle',
        source: 'preview-complaints',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(255,90,95,0.9)',
          'circle-stroke-color': 'rgba(255,255,255,0.4)',
          'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 10, 10, 16, 50, 22],
        },
      });
      map.addLayer({
        id: 'preview-cluster-count',
        type: 'symbol',
        source: 'preview-complaints',
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['Noto Sans Regular'], 'text-size': 10 },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'preview-points',
        type: 'circle',
        source: 'preview-complaints',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#ff5a5f',
          'circle-radius': 4,
          'circle-stroke-color': 'rgba(255,255,255,0.6)',
          'circle-stroke-width': 1,
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
