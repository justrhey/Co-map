import { useState, useEffect, useRef } from 'react';

// ── Reverse geocode hook with caching ──────────────────────────
const _addrCache = new Map();

export function useAddress(latlng) {
  const [address, setAddress] = useState('Fetching location...');
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!latlng) return;
    if (timer.current) clearTimeout(timer.current);
    const cacheKey = `${latlng.lat.toFixed(5)},${latlng.lng.toFixed(5)}`;
    if (_addrCache.has(cacheKey)) {
      setAddress(_addrCache.get(cacheKey));
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&addressdetails=1&zoom=18`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        const addr = data.display_name || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
        _addrCache.set(cacheKey, addr);
        if (_addrCache.size > 100) {
          const first = _addrCache.keys().next().value;
          _addrCache.delete(first);
        }
        setAddress(addr);
      } catch {
        setAddress(`${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [latlng?.lat, latlng?.lng]);

  return { address, loading };
}
