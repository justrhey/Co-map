// ── Spatial helpers ────────────────────────────────────────────
export function pointInPolygon(lng, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export function findBarangay(lat, lng, geojson) {
  if (!geojson?.features) return null;
  for (const f of geojson.features) {
    const coords = f.geometry?.coordinates;
    if (!coords) continue;
    // Try Polygon first, then MultiPolygon
    if (f.geometry.type === 'Polygon') {
      if (pointInPolygon(lng, lat, coords[0])) return f.properties;
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const poly of coords) {
        if (pointInPolygon(lng, lat, poly[0])) return f.properties;
      }
    }
  }
  return null;
}
