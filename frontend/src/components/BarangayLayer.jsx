import { useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// Thin, muted boundary line — no fill, no interaction
const LINE_STYLE = {
  fill: false,
  color: 'rgba(0, 0, 0, 0.12)',
  weight: 0.6,
  opacity: 1,
};

function centroid(ring) {
  let lat = 0, lng = 0, n = ring.length;
  for (let i = 0; i < n; i++) { lat += ring[i][1]; lng += ring[i][0]; }
  return [lat / n, lng / n];
}

function getCentroid(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') return centroid(geometry.coordinates[0]);
  if (geometry.type === 'MultiPolygon') {
    let best = null, bestArea = 0;
    for (const poly of geometry.coordinates) {
      const pts = poly[0];
      if (pts.length > bestArea) { bestArea = pts.length; best = centroid(pts); }
    }
    return best;
  }
  return null;
}

export default function BarangayLayer({ visible = true }) {
  const map = useMap();
  const boundaryRef = useRef(null);
  const labelRef = useRef(null);
  const loadedRef = useRef(false);

  const updateLabels = useCallback(() => {
    const zoom = map.getZoom();
    const shouldShow = zoom >= 15;
    if (!labelRef.current) return;
    if (shouldShow) {
      map.addLayer(labelRef.current);
    } else {
      map.removeLayer(labelRef.current);
    }
  }, [map]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    fetch('/barangays-metro-manila.json')
      .then((res) => res.json())
      .then((data) => {
        if (boundaryRef.current) map.removeLayer(boundaryRef.current);
        if (labelRef.current) map.removeLayer(labelRef.current);

        // ── Boundary lines — static, no per-feature handlers ──
        const boundaryLayer = L.geoJSON(data, {
          style: LINE_STYLE,
        });
        boundaryLayer.addTo(map);
        boundaryRef.current = boundaryLayer;

        // ── Labels — non-interactive, shown at zoom >= 15 ──
        const labelLayer = L.layerGroup();
        data.features.forEach((feature) => {
          const name = feature.properties?.NAME_3 || '';
          if (!name) return;
          const pos = getCentroid(feature.geometry);
          if (!pos) return;
          const icon = L.divIcon({
            className: 'brgy-label',
            html: `<span>${name}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });
          labelLayer.addLayer(L.marker(pos, { icon, interactive: false }));
        });
        labelRef.current = labelLayer;

        // Initial check
        if (map.getZoom() >= 15) labelLayer.addTo(map);
        map.on('zoomend', updateLabels);
      })
      .catch((err) => console.error('Failed to load barangay boundaries:', err));

    return () => {
      if (boundaryRef.current) map.removeLayer(boundaryRef.current);
      if (labelRef.current) map.removeLayer(labelRef.current);
      map.off('zoomend', updateLabels);
    };
  }, [map, updateLabels]);

  // Toggle
  useEffect(() => {
    if (boundaryRef.current) {
      if (visible) map.addLayer(boundaryRef.current);
      else map.removeLayer(boundaryRef.current);
    }
  }, [visible, map]);

  return null;
}
