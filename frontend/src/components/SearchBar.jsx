import { useState, useRef, useEffect } from 'react';

export default function SearchBar({ map }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const timeoutRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (query.trim().length < 3) { setResults([]); setOpen(false); return; }

    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ph&bounded=1&viewbox=120.85,14.85,121.20,14.25&limit=5`
        );
        const data = await res.json();
        setResults(data || []);
        setOpen(data?.length > 0);
        setSelectedIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [query]);

  const selectResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    map.flyTo({ center: [lng, lat], zoom: 17, duration: 1000 });
    setQuery(result.display_name.split(',')[0]);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      selectResult(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="search-bar" role="combobox" aria-expanded={open}>
      <div className="search-input-wrap">
        <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search street, barangay, landmark..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          aria-autocomplete="list"
          aria-controls="search-results"
        />
        {loading && <span className="search-spinner" />}
        {query && !loading && (
          <button className="search-clear" onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus(); }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="search-results" id="search-results" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.place_id}
              role="option"
              aria-selected={i === selectedIndex}
              className={`search-result-item${i === selectedIndex ? ' selected' : ''}`}
              onMouseDown={() => selectResult(r)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="result-pin">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="currentColor"/>
              </svg>
              <div className="result-text">
                <span className="result-name">{r.display_name.split(',')[0]}</span>
                <span className="result-addr">{r.display_name.split(',').slice(1).join(',').trim()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
