/**
 * Area Info / Wikipedia Facts component.
 * Fetches Wikipedia articles near the current map center.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export default function AreaInfo({ visible, center }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [summaries, setSummaries] = useState({});
  const lastKeyRef = useRef('');

  const fetchArticles = useCallback(async (lat, lng) => {
    setLoading(true);
    try {
      // Step 1: Search for articles near this location
      const geoUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=500&gslimit=5&format=json&origin=*`;
      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) throw new Error('Geo search failed');
      const geoData = await geoRes.json();
      const pages = geoData?.query?.geosearch || [];

      if (pages.length === 0) {
        // Try wider radius
        const wideUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=2000&gslimit=3&format=json&origin=*`;
        const wideRes = await fetch(wideUrl);
        if (!wideRes.ok) throw new Error('Wide search failed');
        const wideData = await wideRes.json();
        const widePages = wideData?.query?.geosearch || [];
        setArticles(widePages.slice(0, 3));
      } else {
        setArticles(pages.slice(0, 5));
      }

      // Step 2: Fetch summaries for the articles
      if (pages.length > 0) {
        const ids = pages.slice(0, 5).map(p => p.pageid).join('|');
        const sumUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&exsentences=3&pageids=${ids}&format=json&origin=*`;
        const sumRes = await fetch(sumUrl);
        if (sumRes.ok) {
          const sumData = await sumRes.json();
          const pagesData = sumData?.query?.pages || {};
          setSummaries(prev => ({ ...prev, ...Object.fromEntries(
            Object.entries(pagesData).map(([id, p]) => [id, p.extract?.replace(/\n/g, ' ') || ''])
          ) }));
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when the map center (passed in) changes.
  useEffect(() => {
    if (!visible || !center) { setArticles([]); return; }
    const key = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    fetchArticles(center.lat, center.lng);
  }, [visible, center, fetchArticles]);

  if (!visible || articles.length === 0) return null;

  return (
    <div className="area-info-card">
      <div className="area-info-header">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        <span>Area Guide</span>
        {loading && <span className="spinner" style={{width:12,height:12}} />}
      </div>
      <div className="area-info-list">
        {articles.map((a, i) => (
          <div key={a.pageid} className="area-info-item">
            <div className="area-info-distance">{a.dist}m</div>
            <div className="area-info-body" onClick={() => setExpanded(expanded === a.pageid ? null : a.pageid)}>
              <span className="area-info-title">{a.title}</span>
              {expanded === a.pageid && summaries[a.pageid] && (
                <p className="area-info-summary">{summaries[a.pageid]}</p>
              )}
            </div>
            <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(a.title)}`}
              target="_blank" rel="noopener noreferrer"
              className="area-info-link"
              onClick={e => e.stopPropagation()}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
