/**
 * Cool Spots Layer — Points of Interest overlay.
 * Fetches POIs from OpenStreetMap Overpass API within the current map view.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// Throttle: don't re-fetch if the viewport center hasn't moved this much (degrees)
const FETCH_THROTTLE_DIST = 0.01;

const INTEREST_TAGS = [
  'landmark', 'park', 'garden', 'playground', 'library', 'museum',
  'theatre', 'cinema', 'fountain', 'monument', 'marketplace',
  'community_centre', 'townhall', 'place_of_worship',
];

const CATEGORY_ICONS = {
  park: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="2"><path d="M12 4L4 15h16z"/><path d="M12 15v5"/></svg>`,
  garden: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="2"><path d="M12 2v4M8 6h8M6 10h12"/><path d="M4 14h16"/><path d="M12 14v6"/></svg>`,
  playground: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l4-4 4 4"/><path d="M8 16l4-4 4 4"/></svg>`,
  library: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  museum: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M12 2l8 5H4z"/><path d="M4 9h16v2H4z"/><rect x="8" y="11" width="8" height="10"/></svg>`,
  default: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6366f1" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
};

function getIconForTag(tags) {
  for (const [cat, icon] of Object.entries(CATEGORY_ICONS)) {
    if (tags?.[cat]) return icon;
  }
  for (const t of INTEREST_TAGS) {
    if (tags?.[t]) return CATEGORY_ICONS[t] || CATEGORY_ICONS.default;
  }
  return CATEGORY_ICONS.default;
}

function getLabel(tags, type) {
  return tags?.name || type || 'Point of Interest';
}

function getType(tags) {
  for (const t of INTEREST_TAGS) {
    if (tags?.[t]) return t.replace(/_/g, ' ');
  }
  return 'Place';
}

let _cache = new Map();

export default function CoolSpotsLayer({ visible }) {
  const map = useMap();
  const layerRef = useRef(null);
  const lastKeyRef = useRef('');
  const [spots, setSpots] = useState([]);

  const fetchSpots = useCallback(async (bounds) => {
    const pad = 0.005;
    const bbox = `${bounds.getSouth() - pad},${bounds.getWest() - pad},${bounds.getNorth() + pad},${bounds.getEast() + pad}`;

    const query = `[out:json];
      (
        node["tourism"="attraction"](${bbox});
        node["tourism"="museum"](${bbox});
        node["tourism"="artwork"](${bbox});
        node["leisure"="park"](${bbox});
        node["leisure"="garden"](${bbox});
        node["leisure"="playground"](${bbox});
        node["amenity"="library"](${bbox});
        node["amenity"="theatre"](${bbox});
        node["amenity"="cinema"](${bbox});
        node["amenity"="townhall"](${bbox});
        node["amenity"="community_centre"](${bbox});
        node["amenity"="place_of_worship"](${bbox});
        node["historic"="monument"](${bbox});
        node["historic"="memorial"](${bbox});
        way["leisure"="park"](${bbox});
        way["leisure"="garden"](${bbox});
      );
      out center 15;`;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Overpass fetch failed');
      const data = await res.json();

      const elements = data.elements || [];
      const pois = elements
        .filter(el => el.tags && (el.tags.name || el.tags.leisure || el.tags.amenity || el.tags.tourism || el.tags.historic))
        .map(el => ({
          id: el.id,
          lat: el.lat || el.center?.lat,
          lng: el.lon || el.center?.lon,
          name: getLabel(el.tags, el.type),
          type: getType(el.tags),
          tags: el.tags,
        }))
        .filter(p => p.lat && p.lng)
        // Deduplicate by lat/lng to 3 decimal places
        .filter((p, i, arr) => {
          const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
          return arr.findIndex(x => `${x.lat.toFixed(3)},${x.lng.toFixed(3)}` === key) === i;
        })
        .slice(0, 50);

      setSpots(pois);
    } catch {
      // Silently fail
    }
  }, []);

  // Fetch spots when map moves
  useEffect(() => {
    if (!visible) return;

    const handleMove = () => {
      const bounds = map.getBounds();
      const key = `${bounds.getCenter().lat.toFixed(3)},${bounds.getCenter().lng.toFixed(3)}`;
      if (Math.abs(map.getCenter().lat - parseFloat(key.split(',')[0])) < FETCH_THROTTLE_DIST) return;
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;
      fetchSpots(bounds);
    };

    // Fetch immediately
    fetchSpots(map.getBounds());
    map.on('moveend', handleMove);
    return () => map.off('moveend', handleMove);
  }, [map, visible, fetchSpots]);

  // Render markers
  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!visible || spots.length === 0) return;

    const layer = L.layerGroup();

    spots.forEach(spot => {
      const icon = L.divIcon({
        className: 'cool-spot-marker',
        html: `<div class="cool-spot-icon">${getIconForTag(spot.tags)}</div><div class="cool-spot-label">${spot.name}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        tooltipAnchor: [0, -18],
      });

      const marker = L.marker([spot.lat, spot.lng], { icon });
      marker.bindTooltip(`<b>${spot.name}</b><br/>${spot.type}`, { direction: 'top', offset: [0, -20], className: 'cool-spot-tooltip' });
      layer.addLayer(marker);
    });

    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, spots, visible]);

  return null;
}
