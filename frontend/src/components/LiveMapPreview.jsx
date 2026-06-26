/**
 * LiveMapPreview — a small, non-interactive instance of the *real* map,
 * showing *real* complaints from the API. Used on the landing page so the
 * hero preview is the actual product, not a mockup. Clicking it enters the
 * full map experience.
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { fetchComplaints } from '../api';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const PREVIEW_CENTER = [121.035, 14.565]; // Metro Manila
const PREVIEW_ZOOM = 11.2;

export default function LiveMapPreview({ onEnter }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [count, setCount] = useState(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: PREVIEW_CENTER,
      zoom: PREVIEW_ZOOM,
      interactive: false, // no scroll-jacking on the landing page
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', async () => {
      // Slow ambient drift so the preview feels alive.
      let bearing = 0;
      const drift = () => {
        if (!mapRef.current) return;
        bearing = (bearing + 0.02) % 360;
        map.setBearing(bearing);
        requestAnimationFrame(drift);
      };
      drift();

      // Clustered source of REAL complaints.
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
          'circle-color': 'rgba(255,255,255,0.85)',
          'circle-stroke-color': 'rgba(0,0,0,0.15)',
          'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 12, 10, 18, 50, 26],
        },
      });
      map.addLayer({
        id: 'preview-cluster-count',
        type: 'symbol',
        source: 'preview-complaints',
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
        paint: { 'text-color': '#0d1117' },
      });
      map.addLayer({
        id: 'preview-points',
        type: 'circle',
        source: 'preview-complaints',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#ff5a5f',
          'circle-radius': 5,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      });

      try {
        const data = await fetchComplaints({ page: '1' });
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

    return () => { map.remove(); mapRef.current = null; };
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
