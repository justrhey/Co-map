import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { fetchComplaints, fetchComplaint, createComplaint, updateComplaintStatus, fetchBarangayScores, fetchUserStats, fetchUserProfile, fetchAdminSummary, login, register, logout as apiLogout, fetchMe, setToken, isLoggedIn, toggleVote } from './api';
import {
  IconMapPin, IconClock, IconX,
  CATEGORIES, getCategoryIcon,
} from './components/Icons';
import BarangayLayer from './components/BarangayLayer';
import CoolSpotsLayer from './components/CoolSpotsLayer';
import AreaInfo from './components/AreaInfo';
import AnalysisPanel from './components/AnalysisPanel';
import SearchBar from './components/SearchBar';
import GlassIcons from './components/GlassIcons';
import HomePage from './components/HomePage';
import LoginPage from './components/LoginPage';
import './App.css';

// ── Marker Icon Factory — stickpole + photo circle (Foodpanda-style) ─
const _CAT_SVG = {
  potholes:    `<circle cx="12" cy="12" r="5.5"/><path d="M4 12h2M18 12h2"/>`,
  streetlight: `<path d="M12 5v15"/><path d="M8 8h8"/><circle cx="12" cy="5" r="3"/><path d="M5 5h2M17 5h2"/>`,
  graffiti:    `<rect x="8" y="9" width="8" height="12" rx="2"/><path d="M12 9V6"/><path d="M16 12q3 2 3 5" stroke-width="1.3" fill="none"/>`,
  illegal_dumping: `<path d="M5 13h14M7 13v7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-7"/><path d="M9 9h6"/>`,
  sidewalk:    `<circle cx="12" cy="5" r="2"/><path d="M12 7v5M8 12l4 5 4-5"/>`,
  traffic:     `<rect x="9" y="3" width="6" height="18" rx="2"/><circle cx="12" cy="7" r="2" opacity="0.5" fill="#fff" stroke="none"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="17" r="2" opacity="0.5" fill="#fff" stroke="none"/>`,
  noise:       `<path d="M6 10h3l4-4v12l-4-4H6z"/><path d="M15 9a4 4 0 0 1 0 6"/>`,
  water:       `<path d="M12 2L4 14a8 8 0 0 0 16 0z"/>`,
  park:        `<path d="M12 4L4 15h16z"/><path d="M12 15v5"/>`,
  other:       `<circle cx="12" cy="12" r="10"/><path d="M12 9a3 3 0 1 1 0 5v1M12 17v.01"/>`,
};

function createMarkerIcon(status, category, id, photoUrl, zoom = 16) {
  const colors = { pending: '#9ea6b2', approved: '#c0c6d0', resolved: '#8b949e' };
  const color = colors[status] || '#8b949e';
  const svg = _CAT_SVG[category] || _CAT_SVG.other;
  const hasPhoto = Boolean(photoUrl);

  const scale = Math.min(1.5, Math.max(0.75, 16 / (zoom || 16)));
  const headSize = Math.round(32 * scale);
  const stemHeight = Math.round(14 * scale);
  const bannerSize = Math.round(9 * Math.min(1.2, scale));
  const iconW = Math.round(headSize + 4);
  const iconH = Math.round(headSize + stemHeight + 18);
  const anchorX = Math.round(iconW / 2);
  const anchorY = iconH - 2;
  const svgSize = Math.round(18 * scale);

  const headContent = hasPhoto
    ? `<img src="${photoUrl}" class="marker-pole-img" />`
    : `<svg class="marker-pole-icon" viewBox="0 0 24 24" width="${svgSize}" height="${svgSize}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;

  return L.divIcon({
    className: '',
    html: `<div class="custom-marker marker-pole" style="--head-size:${headSize}px;--stem-height:${stemHeight}px;--banner-size:${bannerSize}px">
      <div class="marker-pole-head${hasPhoto ? ' with-photo' : ''}" style="border-color:${color}">
        ${headContent}
      </div>
      <div class="marker-pole-stem" style="background:${color}"></div>
      <div class="marker-pole-banner">#${id}</div>
    </div>`,
    iconSize: [iconW, iconH],
    iconAnchor: [anchorX, anchorY],
  });
}

// ── SVG Badge Icons (no emoji) ────────────────────────────────
const BADGE_ICONS = {
  voice_broke_silence: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ),
  watcher_at_gate: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  bridge_between: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
    </svg>
  ),
  unrelenting_flame: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  scribe_of_streets: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  guardian_of_neighborhood: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
};

// ── Map Content (handles clicks & clusters) ──────────────────────
function MapContent({ complaints, onMapClick, onMarkerClick }) {
  const clusterRef = useRef(null);
  const lastZoomRef = useRef(16);
  const [zoom, setZoom] = useState(16);
  const map = useMapEvents({
    click: (e) => {
      if (e.originalEvent?.target?.closest?.('.leaflet-marker-icon, .leaflet-marker-pane > *')) return;
      const { lat, lng } = e.latlng || {};
      if (!isFinite(lat) || !isFinite(lng)) return;
      if (!map._loaded) return;
      onMapClick?.(e.latlng);
    },
    zoomend: () => {
      const newZoom = map.getZoom();
      if (Math.abs(newZoom - lastZoomRef.current) >= 1) {
        lastZoomRef.current = newZoom;
        setZoom(newZoom);
      }
    },
  });

  useEffect(() => {
    if (!map) return;

    const mcg = L.markerClusterGroup({
      chunkedLoading: true,
      disableClusteringAtZoom: 0,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = 'small';
        if (count > 10) size = 'medium';
        if (count > 50) size = 'large';
        return L.divIcon({
          html: `<div class="cluster-icon cluster-${size}"><span>${count}</span></div>`,
          className: 'cluster-wrapper',
          iconSize: [42, 42],
        });
      },
    });

    const mapZoom = map.getZoom();

    complaints.forEach((c) => {
      const marker = L.marker([c.latitude, c.longitude], {
        icon: createMarkerIcon(c.status, c.category, c.id, c.photo, mapZoom),
      });
      marker.bindTooltip(
        `<div style="display:flex;align-items:center;gap:4px">${c.category_display}</div>`,
        { direction: 'top', offset: [0, -20], className: 'marker-tooltip' }
      );
      marker.on('click', () => onMarkerClick?.(c.id));
      mcg.addLayer(marker);
    });

    map.addLayer(mcg);
    clusterRef.current = mcg;
    return () => { if (clusterRef.current) map.removeLayer(clusterRef.current); };
  }, [complaints, map, zoom, onMarkerClick]);

  return null;
}

// ── Reverse geocode hook with caching ──────────────────────────
const _addrCache = new Map();
function useAddress(latlng) {
  const [address, setAddress] = useState('Fetching location...');
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!latlng) return;
    if (timer.current) clearTimeout(timer.current);

    const cacheKey = `${latlng.lat.toFixed(4)},${latlng.lng.toFixed(4)}`;
    const cached = _addrCache.get(cacheKey);
    if (cached) { setAddress(cached); setLoading(false); return; }

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
  }, [latlng.lat, latlng.lng]);

  return { address, loading };
}

// ── Tracks map center ────────────────────────────────────────────
function MapCenterTracker({ onCenterChange }) {
  const map = useMap();
  const init = map.getCenter();
  const lastRef = useRef(`${init.lat.toFixed(5)},${init.lng.toFixed(5)}`);

  useEffect(() => {
    const sync = () => {
      const c = map.getCenter();
      const key = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
      if (lastRef.current === key) return;
      lastRef.current = key;
      onCenterChange({ lat: c.lat, lng: c.lng });
    };
    map.on('moveend', sync);
    return () => map.off('moveend', sync);
  }, [map, onCenterChange]);

  return null;
}

// ── Locate Button ────────────────────────────────────────────────
function LocateButton() {
  const map = useMap();
  return (
    <div className="locate-btn" onClick={() => map.locate({ setView: true, maxZoom: 16 })}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
      </svg>
    </div>
  );
}

// ── Filter Bar ──────────────────────────────────────────────────
function FilterBar({ active, onChange, counts, total, error, onRetry }) {
  const FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'potholes', label: 'Potholes' },
    { value: 'streetlight', label: 'Lights' },
    { value: 'graffiti', label: 'Graffiti' },
    { value: 'illegal_dumping', label: 'Dumping' },
    { value: 'traffic', label: 'Traffic' },
  ];

  return (
    <div className="filter-bar">
      <div className="filter-scroll">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-pill${active === f.value ? ' active' : ''}`}
            onClick={() => onChange(f.value)}
          >
            {f.label}
            {(counts?.[f.value] ?? 0) > 0 && <span className="pill-count">{counts[f.value]}</span>}
          </button>
        ))}
      </div>
      <div className={`filter-stats${error ? ' error' : ''}`}>
        {error ? <><span>{error}</span><button className="retry-btn" onClick={onRetry}>Retry</button></> : (total > 0 ? `${total} report${total > 1 ? 's' : ''}` : 'Loading...')}
      </div>
    </div>
  );
}

// ── Bottom Card ──────────────────────────────────────────────────
function BottomCard({ latlng, onReport }) {
  const { address, loading } = useAddress(latlng);
  return (
    <div className="bottom-card">
      <div className="bottom-card-pin">
        <svg viewBox="0 0 28 40" width="20" height="28" fill="none">
          <path d="M14 39C14 39 2 26 2 14 2 7.5 7.5 2 14 2s12 5.5 12 12c0 12-12 25-12 25z" fill="#333"/>
          <circle cx="14" cy="14" r="5" fill="#fff"/>
        </svg>
      </div>
      <div className="bottom-card-body">
        <span className="bottom-card-label">Add report</span>
        <span className={`bottom-card-address${loading ? ' loading' : ''}`}>
          {loading ? 'Locating...' : address}
        </span>
      </div>
      <button className="bottom-card-btn" onClick={onReport}>Report</button>
    </div>
  );
}

// ── Login Sheet (email/password + SSO) ────────────────────
function LoginSheet({ open, onLogin, onClose }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let result;
      if (mode === 'register') {
        result = await register(email, password, name);
      } else {
        result = await login(email, password);
      }
      onLogin(result.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  };

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet login-sheet" role="dialog" aria-label="Sign in">
        <div className="sheet-grip" />
        <div className="sheet-content">
          <div className="sheet-heading">
            <h3>{mode === 'login' ? 'Sign In' : 'Create Account'}</h3>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" className="field-input"
                placeholder="you@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={100} autoFocus required />
            </div>
            <div className="field-group">
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" className="field-input"
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                minLength={8} required />
            </div>
            {mode === 'register' && (
              <div className="field-group">
                <label htmlFor="auth-name">Display Name <span className="field-opt">(optional)</span></label>
                <input id="auth-name" type="text" className="field-input"
                  placeholder="How others see you" value={name}
                  onChange={(e) => setName(e.target.value)} maxLength={50} />
              </div>
            )}
            {error && <p className="login-error">{error}</p>}
            <p className="login-hint">
              {mode === 'login'
                ? 'Sign in to track your reports and earn recognition.'
                : 'Create an account to claim your reports.'}
            </p>
            <div className="sheet-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading || !email || !password}>
                {loading ? <><span className="spinner" /> ...</> : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </div>
            <p className="login-switch">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button type="button" className="link-btn" onClick={switchMode}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Score Circle Component ──────────────────────────────────────
function ScoreCircle({ score }) {
  if (score == null) return null;
  const grade = score.letter_grade || 'F';
  const color = grade === 'A' ? '#c0c6d0' : grade === 'B' ? '#9ea6b2' : grade === 'C' ? '#8b949e' : grade === 'D' ? '#6b7280' : '#484f58';
  const pct = score.total;

  return (
    <div className="score-circle" style={{ borderColor: color }}>
      <span className="score-circle-grade" style={{ color }}>{grade}</span>
      <span className="score-circle-pct">{pct}</span>
    </div>
  );
}

// ── Hotspot Panel (compact Google Maps-style) ──────────────────
const CAT_COLORS = {
  potholes: '#f59e0b', streetlight: '#06b6d4', graffiti: '#ec4899',
  illegal_dumping: '#ef4444', sidewalk: '#22c55e', traffic: '#eab308',
  noise: '#a855f7', water: '#3b82f6', park: '#10b981', other: '#6366f1',
};

function HotspotPanel({ analytics, healthScore, openCount, resolvedCount }) {
  const [open, setOpen] = useState(true);

  if (!analytics || analytics.topAreas.length === 0) return null;

  const maxCat = analytics.topCategories.length > 0 ? analytics.topCategories[0][1] : 1;

  return (
    <div className={`hotspot-panel${open ? '' : ' collapsed'}`}>
      <div className="hotspot-header" onClick={() => setOpen(!open)}>
        <span className="hotspot-title">Reports</span>
        <span className="hotspot-count">{analytics.total}</span>
        <span className="hotspot-toggle">{open ? '−' : '+'}</span>
      </div>
      {open && (
        <div className="hotspot-body">
          <div className="hp-section">
            <div className="hp-section-label">Top Areas</div>
            {analytics.topAreas.slice(0, 3).map((area, i) => (
            <div key={area.key} className="hp-row">
              <span className="hp-rank">{i + 1}</span>
              <span className="hp-name">
                {area.barangay
                  ? (area.barangay.city
                    ? `${area.barangay.name.replace(/^Barangay\s*/i, '')}, ${area.barangay.city.replace(/\s*City$/i, '')}`
                    : area.barangay.name.replace(/^Barangay\s*/i, ''))
                  : `${area.lat.toFixed(3)}, ${area.lng.toFixed(3)}`}
              </span>
              <span className="hp-count">{area.count}</span>
            </div>
          ))}
          </div>
          <div className="hp-section">
            <div className="hp-section-label">Top Categories</div>
            {analytics.topCategories.slice(0, 5).map(([cat, cnt]) => (
              <div key={cat} className="hp-cat-row">
                <span className="hp-cat-dot" style={{ background: CAT_COLORS[cat] || '#666' }} />
                <span className="hp-cat-name">{cat.replace(/_/g, ' ')}</span>
                <span className="hp-cat-count">{cnt}</span>
                <span className="hp-cat-bar" style={{ width: Math.max(4, (cnt / maxCat) * 60) + 'px', background: CAT_COLORS[cat] || '#666' }} />
              </div>
            ))}
          </div>
          {healthScore !== null && (
            <div className="hp-section">
              <div className="hp-section-label">Health Score</div>
              <div className="hp-health-row">
                <div className={`hp-health-circle ${healthScore >= 70 ? 'good' : healthScore >= 40 ? 'ok' : 'bad'}`}>
                  <span>{healthScore}</span>
                </div>
                <div className="hp-health-details">
                  <span className="hp-health-label">Barangay Health</span>
                  <span className="hp-health-sub">{openCount ?? 0} open | {resolvedCount ?? 0} resolved</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Glass icon color mapping per category ──────────────────────
const CATEGORY_GLASS_COLORS = {
  potholes: 'orange',
  streetlight: 'cyan',
  graffiti: 'pink',
  illegal_dumping: 'red',
  sidewalk: 'green',
  traffic: 'yellow',
  noise: 'purple',
  water: 'blue',
  other: 'indigo',
};

// ── Submit Sheet (multi-media) ──────────────────────────────────
function SubmitSheet({ open, latlng, onClose, onSubmit, onLoginRequired, setToast }) {
  const [category, setCategory] = useState('potholes');
  const [situation, setSituation] = useState('');
  const [impact, setImpact] = useState('');
  const [actionRequested, setActionRequested] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [additionalMedia, setAdditionalMedia] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory('potholes'); setSituation(''); setImpact('');
      setActionRequested(''); setCustomTitle('');
      setPhoto(null); setPhotoPreview(null); setAdditionalMedia([]);
    }
  }, [open]);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleAdditionalMedia = (e) => {
    const files = Array.from(e.target.files || []);
    setAdditionalMedia(prev => [...prev, ...files]);
  };

  const removeMedia = (index) => {
    setAdditionalMedia(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + 'KB';
    return (bytes/(1024*1024)).toFixed(1) + 'MB';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!latlng) return;
    setSubmitting(true);
    try {
      const payload = {
        latitude: latlng.lat,
        longitude: latlng.lng,
        category,
        description: situation.trim(),
        impact: impact.trim(),
        action_requested: actionRequested.trim(),
        custom_category: category === 'other' ? customTitle.trim() : '',
        photo,
      };
      if (additionalMedia.length > 0) {
        payload.additional_media = additionalMedia;
      }
      await createComplaint(payload);
      onSubmit();
      onClose();
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('sign in')) {
        // Not logged in — show login sheet instead of raw error
        if (onLoginRequired) onLoginRequired();
        else onClose();
      } else {
        if (setToast) setToast({ message: err.message, type: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = submitting ||
    !situation.trim() ||
    !photo ||
    (category === 'other' && !customTitle.trim());

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet submit-sheet" role="dialog" aria-label="New report">
        <div className="submit-sheet-header">
          <h3>New Report</h3>
          <div className="submit-sheet-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </div>
        </div>
        <div className="sheet-content">
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label>Category</label>
              <GlassIcons
                items={CATEGORIES.map(({ value, label, Icon }) => ({
                  icon: <Icon width={22} height={22} />,
                  color: CATEGORY_GLASS_COLORS[value],
                  label,
                }))}
                activeIndex={CATEGORIES.findIndex(c => c.value === category)}
                onItemClick={(index) => setCategory(CATEGORIES[index].value)}
              />
            </div>

            {category === 'other' && (
              <div className="field-group">
                <label htmlFor="custom-title">Custom Title</label>
                <input
                  id="custom-title"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Fallen tree, obstructed drain..."
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              </div>
            )}

            <div className="field-group">
              <label>Photo <span className="field-req">*</span></label>
              <div className="photo-upload" onClick={() => document.getElementById('photo-input')?.click()}>
                {photoPreview ? (
                  <div className="photo-preview-wrap">
                    <img src={photoPreview} alt="Preview" className="photo-preview" />
                    <button type="button" className="photo-remove" onClick={(e) => { e.stopPropagation(); setPhoto(null); setPhotoPreview(null); }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                    <span className="photo-change-hint">Tap to change</span>
                  </div>
                ) : (
                  <div className="photo-placeholder">
                    <div className="photo-placeholder-icon">
                      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </div>
                    <span className="photo-placeholder-text">Add a photo</span>
                    <span className="photo-placeholder-hint">Shows what you're reporting</span>
                  </div>
                )}
              </div>
              <input id="photo-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            </div>

            <div className="field-group">
              <label>Additional Media <span className="field-opt">(optional)</span></label>
              <div className="media-grid-upload">
                <div className="media-grid-items">
                  {additionalMedia.map((file, i) => (
                    <div key={i} className="media-grid-item">
                      {file.type?.startsWith('video/') ? (
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      ) : file.type?.startsWith('audio/') ? (
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      )}
                      <span className="media-item-name">{file.name.length > 15 ? file.name.slice(0, 12)+'...' : file.name}</span>
                      <span className="media-item-size">{formatFileSize(file.size)}</span>
                      <button type="button" className="media-item-remove" onClick={() => removeMedia(i)}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                  <label className="media-add-btn">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    <input type="file" accept="image/*,video/*,audio/*" multiple style={{ display: 'none' }} onChange={handleAdditionalMedia} />
                  </label>
                </div>
              </div>
            </div>

            <div className="template-fields">
              <div className="field-group">
                <label htmlFor="situation">Situation <span className="field-req">*</span></label>
                <textarea id="situation" rows={2} placeholder="What happened? Include street names or landmarks." maxLength={500} value={situation} onChange={(e) => setSituation(e.target.value)} />
                <div className="textarea-meta">
                  <span className="field-hint">What did you see or experience?</span>
                  <span className="char-count">{situation.length}/500</span>
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="impact">Impact <span className="field-opt">(optional)</span></label>
                <textarea id="impact" rows={1} placeholder="How does this affect you or the community?" maxLength={300} value={impact} onChange={(e) => setImpact(e.target.value)} />
              </div>

              <div className="field-group">
                <label htmlFor="action">Action Requested <span className="field-opt">(optional)</span></label>
                <textarea id="action" rows={1} placeholder="What should be done?" maxLength={300} value={actionRequested} onChange={(e) => setActionRequested(e.target.value)} />
              </div>
            </div>
            <div className="sheet-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={canSubmit}>
                {submitting ? <><span className="spinner" /> Submitting...</> : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Detail Sheet (with score) ──────────────────────────────────
function DetailSheet({ open, complaintId, onClose }) {
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [voteCount, setVoteCount] = useState(0);
  const [userVoted, setUserVoted] = useState(false);
  const [voteLoading, setVoteLoading] = useState(false);

  useEffect(() => {
    if (!open || !complaintId) { setComplaint(null); return; }
    setLoading(true);
    fetchComplaint(complaintId).then(data => {
      setComplaint(data);
      setVoteCount(data.vote_count ?? 0);
      setUserVoted(data.user_vote ?? false);
    }).catch(() => setComplaint(null)).finally(() => setLoading(false));
  }, [open, complaintId]);

  const handleVote = async () => {
    if (!isLoggedIn() || voteLoading) return;
    setVoteLoading(true);
    const prevVoted = userVoted;
    const prevCount = voteCount;
    // Optimistic update
    setUserVoted(v => !v);
    setVoteCount(c => prevVoted ? c - 1 : c + 1);
    try {
      const result = await toggleVote(complaintId);
      setVoteCount(result.vote_count);
      setUserVoted(result.voted);
    } catch {
      // Revert on error
      setUserVoted(prevVoted);
      setVoteCount(prevCount);
    } finally {
      setVoteLoading(false);
    }
  };

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet detail-sheet" role="dialog" aria-label="Report details">
        <div className="sheet-grip" />
        <div className="sheet-content">
          {loading ? (
            <div className="detail-loading"><span className="spinner" /> Loading...</div>
          ) : complaint ? (
            <>
              <div className="detail-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {getCategoryIcon(complaint.category, 28)}
                  <span className={`detail-badge ${complaint.status}`}>{complaint.status_display}</span>
                </div>
                {complaint.score && <ScoreCircle score={complaint.score} />}
              </div>
              <div className="detail-vote-row">
                <button
                  className={`vote-btn${userVoted ? ' voted' : ''}`}
                  onClick={handleVote}
                  disabled={voteLoading || !isLoggedIn()}
                  title={isLoggedIn() ? (userVoted ? 'Remove upvote' : 'Upvote this report') : 'Sign in to vote'}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18"
                    fill={userVoted ? 'currentColor' : 'none'}
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                  </svg>
                  <span className="vote-count">{voteCount}</span>
                </button>
              </div>
              {complaint.status && (
                <div className="detail-timeline">
                  <div className={`tl-item ${complaint.status === 'pending' ? 'active' : 'done'}`}>
                    <div className="tl-dot" />
                    <div className="tl-text">
                      <span className="tl-label">Reported</span>
                      <span className="tl-date">{new Date(complaint.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                  <div className={`tl-item ${complaint.status === 'approved' || complaint.status === 'resolved' ? 'done' : ''}`}>
                    <div className="tl-dot" />
                    <div className="tl-text">
                      <span className="tl-label">Acknowledged</span>
                      <span className="tl-date">{complaint.acknowledged_at ? new Date(complaint.acknowledged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                    </div>
                  </div>
                  <div className={`tl-item ${complaint.status === 'resolved' ? 'done' : ''}`}>
                    <div className="tl-dot" />
                    <div className="tl-text">
                      <span className="tl-label">Resolved</span>
                      <span className="tl-date">{complaint.resolved_at ? new Date(complaint.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                    </div>
                  </div>
                </div>
              )}
              <h3 className="detail-title">{complaint.category_display}</h3>
              <p className="detail-time">
                <IconClock width={14} height={14} />{' '}
                {new Date(complaint.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>

              {complaint.score && (
                <div className="score-breakdown">
                  <div className="sc-breakdown">
                    <div className="sc-bar">
                      <div className="sc-bar-fill specificity" style={{ width: `${(complaint.score.specificity / 25) * 100}%` }} />
                    </div>
                    <span className="sc-label">Structure</span>
                    <span className="sc-val">{complaint.score.specificity}/25</span>
                  </div>
                  <div className="sc-breakdown">
                    <div className="sc-bar">
                      <div className="sc-bar-fill context" style={{ width: `${(complaint.score.context / 30) * 100}%` }} />
                    </div>
                    <span className="sc-label">Detail</span>
                    <span className="sc-val">{complaint.score.context}/30</span>
                  </div>
                  <div className="sc-breakdown">
                    <div className="sc-bar">
                      <div className="sc-bar-fill clarity" style={{ width: `${(complaint.score.clarity / 20) * 100}%` }} />
                    </div>
                    <span className="sc-label">Coherence</span>
                    <span className="sc-val">{complaint.score.clarity}/20</span>
                  </div>
                  <div className="sc-breakdown">
                    <div className="sc-bar">
                      <div className="sc-bar-fill completeness" style={{ width: `${(complaint.score.completeness / 15) * 100}%` }} />
                    </div>
                    <span className="sc-label">Completeness</span>
                    <span className="sc-val">{complaint.score.completeness}/15</span>
                  </div>
                  <div className="sc-breakdown">
                    <div className="sc-bar">
                      <div className="sc-bar-fill actionability" style={{ width: `${(complaint.score.actionability / 10) * 100}%` }} />
                    </div>
                    <span className="sc-label">Actionability</span>
                    <span className="sc-val">{complaint.score.actionability}/10</span>
                  </div>
                  {complaint.score.description_detail && (
                    <div className="sc-note">{complaint.score.description_detail}</div>
                  )}
                </div>
              )}

              {(complaint.photo || complaint.media?.length > 0) && (
                <div className="detail-media-grid">
                  {complaint.photo && (
                    <div className="detail-media-item" onClick={() => window.open(complaint.photo, '_blank')}>
                      <img src={complaint.photo} alt="Complaint photo" className="detail-photo-thumb" />
                    </div>
                  )}
                  {complaint.media?.map(m => (
                    <div key={m.id} className="detail-media-item">
                      {m.media_type === 'video' ? (
                        <div className="detail-media-play" onClick={() => window.open(m.file, '_blank')}>
                          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                      ) : m.media_type === 'audio' ? (
                        <div className="detail-media-play" onClick={() => window.open(m.file, '_blank')}>
                          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        </div>
                      ) : (
                        <img src={m.file} alt="Additional" className="detail-photo-thumb" onClick={() => window.open(m.file, '_blank')} />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="detail-template">
                <div className="detail-field">
                  <span className="detail-field-label">Situation</span>
                  <p className="detail-field-text">{complaint.description || 'No description provided.'}</p>
                </div>
                {complaint.impact && (
                  <div className="detail-field">
                    <span className="detail-field-label">Impact</span>
                    <p className="detail-field-text">{complaint.impact}</p>
                  </div>
                )}
                {complaint.action_requested && (
                  <div className="detail-field">
                    <span className="detail-field-label">Action Requested</span>
                    <p className="detail-field-text">{complaint.action_requested}</p>
                  </div>
                )}
              </div>
              <div className="detail-meta">
                {complaint.latitude.toFixed(5)}, {complaint.longitude.toFixed(5)}
              </div>
              <div className="detail-close-bar">
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <div className="detail-loading">Could not load details.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Profile Sheet ──────────────────────────────────────────────
function ProfileSheet({ open, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setProfile(null); return; }
    setLoading(true);
    fetchUserProfile().then(setProfile).catch(() => setProfile(null)).finally(() => setLoading(false));
  }, [open]);

  const gradeColor = (g) => {
    if (!g) return 'var(--text-3)';
    return g === 'A' ? '#c0c6d0' : g === 'B' ? '#9ea6b2' : g === 'C' ? '#8b949e' : g === 'D' ? '#6b7280' : '#484f58';
  };

  const gradeLabel = (total) => {
    if (total == null) return '--';
    if (total >= 90) return 'Excellent';
    if (total >= 80) return 'Great';
    if (total >= 70) return 'Good';
    if (total >= 60) return 'Fair';
    return 'Needs improvement';
  };

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet profile-sheet" role="dialog" aria-label="Your profile">
        <div className="sheet-grip" />
        <div className="sheet-content">
          {loading ? (
            <div className="detail-loading"><span className="spinner" /> Loading...</div>
          ) : profile ? (
            <>
              <div className="sheet-heading">
                <h3>Your Profile</h3>
              </div>

              {/* Level & XP Card */}
              <div className="profile-level-card">
                <div className="profile-level-badge">
                  <span className="profile-level-num">{profile.level?.level || 1}</span>
                </div>
                <div className="profile-level-body">
                  <span className="profile-level-title">
                    Level {profile.level?.level || 1}
                  </span>
                  <div className="profile-xp-bar-bg">
                    <div className="profile-xp-bar" style={{ width: `${profile.level?.progress || 0}%` }} />
                  </div>
                  <span className="profile-xp-text">
                    {profile.total_xp || 0} XP · {profile.level?.progress || 0}% to Level {(profile.level?.level || 1) + 1}
                  </span>
                </div>
              </div>

              <div className="profile-summary">
                <div className="profile-stats">
                  <div className="profile-stat">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    <span className="profile-stat-val">{profile.total_reports}</span>
                    <span className="profile-stat-label">Reports</span>
                  </div>
                  {profile.avg_score != null && (
                    <div className="profile-stat">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      <span className="profile-stat-val">{profile.avg_score}</span>
                      <span className="profile-stat-label">Avg</span>
                    </div>
                  )}
                  <div className="profile-stat">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                    <span className="profile-stat-val">{profile.total_xp || 0}</span>
                    <span className="profile-stat-label">Total XP</span>
                  </div>
                  <div className="profile-stat">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                    <span className="profile-stat-val">{profile.streak}</span>
                    <span className="profile-stat-label">Streak</span>
                  </div>
                </div>
              </div>

              {profile.badges?.length > 0 && (
                <div className="profile-section">
                  <div className="profile-section-title">Earned Recognition</div>
                  <div className="profile-badges">
                    {profile.badges.map(b => (
                      <div key={b.id} className="profile-badge">
                        <div className="profile-badge-icon">
                          {BADGE_ICONS[b.id] || <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>}
                        </div>
                        <div className="profile-badge-text">
                          <span className="profile-badge-title">{b.title}</span>
                          <span className="profile-badge-sub">{b.subtitle}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="profile-section">
                <div className="profile-section-title">Your Reports</div>
                {profile.reports?.length === 0 ? (
                  <p className="profile-empty">No reports yet. Tap the pin to submit your first.</p>
                ) : (
                  <div className="profile-reports">
                    {profile.reports?.slice(0, 20).map(r => (
                      <div key={r.id} className="profile-report">
                        <div className="profile-report-icon">{getCategoryIcon(r.category, 18)}</div>
                        <div className="profile-report-body">
                          <span className="profile-report-label">{r.category_display}</span>
                          <span className="profile-report-date">
                            {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className="profile-report-grade" style={{ color: gradeColor(r.score?.letter_grade) }}>
                          {r.score?.letter_grade || '--'}
                        </div>
                        <div className={`profile-report-status ${r.status}`} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {profile.avg_score != null && (
                <div className="profile-section">
                  <div className="profile-section-title">Score Overview</div>
                  <div className="profile-score-row">
                    <div className="profile-score-circle">
                      <span className="profile-score-num">{profile.avg_score}</span>
                    </div>
                    <div className="profile-score-info">
                      <span className="profile-score-grade">{gradeLabel(profile.avg_score)}</span>
                      <span className="profile-score-desc">Average across {profile.total_reports} reports</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="detail-close-bar">
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <div className="detail-loading">Could not load profile.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Admin Sheet ─────────────────────────────────────────────────
function AdminSheet({ open, onClose, onStatusChange, setToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    if (!open) { setData(null); return; }
    setLoading(true);
    fetchAdminSummary().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [open]);

  const handleStatus = async (id, newStatus) => {
    setUpdating(id);
    try {
      await updateComplaintStatus(id, { status: newStatus });
      // Refresh data
      const updated = await fetchAdminSummary();
      setData(updated);
      onStatusChange?.();
    } catch (err) {
      if (setToast) setToast({ message: 'Failed to update status: ' + err.message, type: 'error' });
    } finally {
      setUpdating(null);
    }
  };

  const filtered = data?.recent?.filter(c =>
    statusFilter === 'all' || c.status === statusFilter
  ) || [];

  const totalByStatus = data?.by_status || {};

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet admin-sheet" role="dialog" aria-label="Admin panel">
        <div className="sheet-grip" />
        <div className="sheet-content">
          {loading ? (
            <div className="detail-loading"><span className="spinner" /> Loading...</div>
          ) : data ? (
            <>
              <div className="sheet-heading">
                <h3>Admin Panel</h3>
              </div>

              {/* Stats Cards */}
              <div className="admin-stats">
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{data.total}</span>
                  <span className="admin-stat-label">Total Reports</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{data.total_users}</span>
                  <span className="admin-stat-label">Users</span>
                </div>
                <div className="admin-stat-card pending">
                  <span className="admin-stat-val">{totalByStatus.pending || 0}</span>
                  <span className="admin-stat-label">Pending</span>
                </div>
                <div className="admin-stat-card resolved">
                  <span className="admin-stat-val">{totalByStatus.resolved || 0}</span>
                  <span className="admin-stat-label">Resolved</span>
                </div>
              </div>

              {/* Status Tabs */}
              <div className="admin-tabs">
                {['all', 'pending', 'approved', 'hidden', 'resolved'].map(s => (
                  <button key={s}
                    className={`admin-tab${statusFilter === s ? ' active' : ''}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {/* Complaints List */}
              <div className="admin-list">
                {filtered.length === 0 ? (
                  <p className="admin-empty">No complaints match this filter.</p>
                ) : (
                  filtered.map(c => (
                    <div key={c.id} className="admin-item">
                      <div className="admin-item-header">
                        <span className={`detail-badge ${c.status}`}>{c.status_display}</span>
                        <span className="admin-item-id">#{c.id}</span>
                        <span className="admin-item-cat">{c.category_display}</span>
                      </div>
                      <div className="admin-item-body">
                        <p className="admin-item-desc">{c.description?.slice(0, 120) || 'No description'}</p>
                        <div className="admin-item-meta">
                          <span>{c.user?.name || c.user?.email || 'Anonymous'}</span>
                          <span>{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="admin-item-actions">
                        {c.status === 'pending' && (
                          <>
                            <button className="admin-action approve"
                              onClick={() => handleStatus(c.id, 'approved')}
                              disabled={updating === c.id}
                            >Approve</button>
                            <button className="admin-action reject"
                              onClick={() => handleStatus(c.id, 'hidden')}
                              disabled={updating === c.id}
                            >Reject</button>
                          </>
                        )}
                        {c.status === 'approved' && (
                          <button className="admin-action resolve"
                            onClick={() => handleStatus(c.id, 'resolved')}
                            disabled={updating === c.id}
                          >Resolve</button>
                        )}
                        {updating === c.id && <span className="spinner" />}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="detail-close-bar">
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <div className="detail-loading">Could not load admin data.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────
function Toast({ message, type }) {
  if (!message) return null;
  return <div className={`toast${type === 'error' ? ' error' : ''}`}>{message}</div>;
}

// ── Captures map instance ──────────────────────────────────────
function MapRefCapture({ onMap }) {
  const map = useMap();
  useEffect(() => { onMap(map); }, [map, onMap]);
  return null;
}

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [complaints, setComplaints] = useState([]);
  const [counts, setCounts] = useState({});
  const [activeFilter, setActiveFilter] = useState('all');
  const [centerLatLng, setCenterLatLng] = useState({ lat: 14.565, lng: 121.035 });
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitLatLng, setSubmitLatLng] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [page, setPage] = useState('home');
  const [mapInstance, setMapInstance] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showCoolSpots, setShowCoolSpots] = useState(false);
  const [showAreaInfo, setShowAreaInfo] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const lastFetchCenter = useRef(null);

  // Load user from token on mount
  useEffect(() => {
    if (isLoggedIn()) {
      fetchMe().then(data => {
        if (data) setUser(data.user);
        setAuthLoaded(true);
      }).catch(() => {
        setToken(null);
        setAuthLoaded(true);
      });
    } else {
      setAuthLoaded(true);
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    fetchUserStats().then(setUserStats).catch(() => {});
  };

  const handleLogout = async () => {
    await apiLogout();
    setUser(null);
    setUserStats(null);
  };

  const loadData = useCallback(async (spatial = null) => {
    try {
      setLoadError(null);
      const params = { page: '1', ...(activeFilter !== 'all' ? { category: activeFilter } : {}) };
      if (spatial) Object.assign(params, spatial);
      const data = await fetchComplaints(params);
      setComplaints(data.results || []);
    } catch (err) {
      console.error(err);
      setLoadError('Could not load complaints. Check connection.');
    }
  }, [activeFilter]);

  useEffect(() => { loadData(); lastFetchCenter.current = null; }, [loadData]);

  useEffect(() => {
    const key = `${centerLatLng.lat.toFixed(3)},${centerLatLng.lng.toFixed(3)}`;
    if (lastFetchCenter.current === key) return;
    lastFetchCenter.current = key;
    loadData({ lat: centerLatLng.lat, lng: centerLatLng.lng, radius: 10 });
  }, [centerLatLng.lat, centerLatLng.lng, loadData]);

  useEffect(() => {
    const c = { all: complaints.length };
    complaints.forEach((cc) => { c[cc.category] = (c[cc.category] || 0) + 1; });
    setCounts(c);
  }, [complaints]);

// ── Analytics ──
function pointInPolygon(lng, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function findBarangay(lat, lng, geojson) {
  if (!geojson) return null;
  for (const feature of geojson.features) {
    const name = feature.properties?.NAME_3;
    const city = feature.properties?.NAME_2 || feature.properties?.city;
    if (!name) continue;
    const g = feature.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') {
      if (pointInPolygon(lng, lat, g.coordinates[0])) return { name, city };
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        if (poly[0] && pointInPolygon(lng, lat, poly[0])) return { name, city };
      }
    }
  }
  return null;
}

  const [barangayData, setBarangayData] = useState(null);

  useEffect(() => {
    fetch('/barangays-metro-manila.json')
      .then(r => r.json())
      .then(setBarangayData)
      .catch(() => {});
  }, []);

  const analytics = useMemo(() => {
    const areas = {};
    const cats = {};

    complaints.forEach((c) => {
      const key = `${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`;
      if (!areas[key]) {
        areas[key] = { key, lat: c.latitude, lng: c.longitude, count: 0, categories: {}, statuses: {} };
      }
      areas[key].count++;
      areas[key].categories[c.category] = (areas[key].categories[c.category] || 0) + 1;
      areas[key].statuses[c.status] = (areas[key].statuses[c.status] || 0) + 1;

      cats[c.category] = (cats[c.category] || 0) + 1;
    });

    const topAreas = Object.values(areas)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(area => ({
        ...area,
        barangay: findBarangay(area.lat, area.lng, barangayData),
      }));

    const topCategories = Object.entries(cats)
      .sort((a, b) => b[1] - a[1]);

    return { topAreas, topCategories, total: complaints.length };
  }, [complaints, barangayData]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    fetchUserStats().then(setUserStats).catch(() => {});
  }, [user]);

  useEffect(() => {
    fetchBarangayScores().then(setHealthData).catch(() => {});
  }, [complaints]);

  useEffect(() => {
    if (!submitOpen) {
      fetchUserStats().then(setUserStats).catch(() => {});
      fetchBarangayScores().then(setHealthData).catch(() => {});
    }
  }, [submitOpen]);

  // ── Handlers ──
  const handleMapClick = useCallback((latlng) => {}, []);

  const handleMarkerClick = useCallback((id) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const handleReport = () => {
    setSubmitLatLng(centerLatLng);
    setSubmitOpen(true);
  };

  const handleSubmitClose = () => {
    setSubmitOpen(false);
    setSubmitLatLng(null);
  };

  const handleSubmitSuccess = () => {
    loadData();
    setSubmitOpen(false);
    setSubmitLatLng(null);
    setToast({ message: 'Report submitted!', type: 'success' });
  };

  const openProfile = useCallback(() => {
    setProfileOpen(true);
  }, []);

  // ── Render ──
  return (
    <div className="app">
      {page === 'home' && <HomePage onNavigate={setPage} />}

      {page === 'login' && (
        <LoginPage onLogin={handleLogin} onBack={() => setPage('map')} />
      )}

      {page === 'map' && (
        <>
      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar-inner">
          <h1 className="app-title" onClick={() => setPage('home')} style={{ cursor: 'pointer' }}>
            <IconMapPin width={20} height={20} /> Co-Map
          </h1>
          {mapInstance && <SearchBar map={mapInstance} />}
          {user ? (
            <div className="user-badge" onClick={openProfile} style={{ cursor: 'pointer' }}>
              <span className="user-name">{user.name || user.email?.split('@')[0]}</span>
              {userStats && userStats.total_reports > 0 && (
                <span className="user-reports">{userStats.total_reports} report{userStats.total_reports > 1 ? 's' : ''}</span>
              )}
              {userStats?.level && (
                <span className="user-level-badge" title={`Level ${userStats.level.level} · ${userStats.total_xp} XP`}>Lv{userStats.level.level}</span>
              )}
              {userStats && userStats.streak >= 1 && (
                <span className="user-streak">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                  {userStats.streak}d
                </span>
              )}
              {user?.is_staff && (
                <button className="user-btn admin-btn" onClick={(e) => { e.stopPropagation(); setAdminOpen(true); }}>Admin</button>
              )}
              <button className="user-btn" onClick={(e) => { e.stopPropagation(); handleLogout(); }}>Sign Out</button>
            </div>
          ) : (
            <button className="user-btn sign-in" onClick={() => setPage('login')}>Sign In</button>
          )}
        </div>
        {userStats && userStats.badges && userStats.badges.length > 0 && (
          <div className="badges-bar">
            {userStats.badges.map(b => (
              <div key={b.id} className="badge-item" title={`${b.title} — ${b.subtitle}`}>
                <span className="badge-icon">
                  {BADGE_ICONS[b.id]}
                </span>
                <span className="badge-name">{b.title}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      <FilterBar active={activeFilter} onChange={setActiveFilter} counts={counts} total={complaints.length} error={loadError} onRetry={() => loadData()} />

      <div className="map-toggles">
        <button
          className={`toggle-pill${showCoolSpots ? ' active' : ''}`}
          onClick={() => setShowCoolSpots(v => !v)}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          Spots
        </button>
        <button
          className={`toggle-pill${showAreaInfo ? ' active' : ''}`}
          onClick={() => setShowAreaInfo(v => !v)}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          Area
        </button>
        <button
          className="toggle-pill"
          onClick={() => setAnalysisOpen(true)}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>
          Analysis
        </button>
      </div>

      <HotspotPanel analytics={analytics} healthScore={healthData?.overall?.score ?? null} openCount={healthData?.overall?.open ?? 0} resolvedCount={healthData?.overall?.resolved ?? 0} />

      {/* Map */}
      <MapContainer
        center={[14.565, 121.035]}
        zoom={16}
        minZoom={10}
        maxZoom={18}
        className="map-container"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          maxZoom={18}
        />
        <BarangayLayer />
        <CoolSpotsLayer visible={showCoolSpots} />
        <AreaInfo visible={showAreaInfo} />
        <MapRefCapture onMap={setMapInstance} />
        <MapContent complaints={complaints} onMapClick={handleMapClick} onMarkerClick={handleMarkerClick} />
        <MapCenterTracker onCenterChange={setCenterLatLng} />
        <LocateButton />
      </MapContainer>

      {/* Center pin overlay */}
      <div className="center-pin">
        <div className="center-pulse" />
        <svg className="center-pin-svg" viewBox="0 0 28 40" width="28" height="40" fill="none">
          <path d="M14 39C14 39 2 26 2 14 2 7.5 7.5 2 14 2s12 5.5 12 12c0 12-12 25-12 25z" fill="#333"/>
          <circle cx="14" cy="14" r="5" fill="#fff"/>
        </svg>
      </div>

      {/* Bottom card — only for logged-in users */}
      {isLoggedIn() && !submitOpen && (
        <BottomCard latlng={centerLatLng} onReport={handleReport} />
      )}

      <SubmitSheet open={submitOpen} latlng={submitLatLng} onClose={handleSubmitClose} onSubmit={handleSubmitSuccess} onLoginRequired={() => setPage('login')} setToast={setToast} />
      <DetailSheet open={detailOpen} complaintId={detailId} onClose={() => { setDetailOpen(false); setDetailId(null); }} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <AdminSheet open={adminOpen} onClose={() => setAdminOpen(false)} onStatusChange={() => loadData()} setToast={setToast} />
      <AnalysisPanel open={analysisOpen} onClose={() => setAnalysisOpen(false)} />
      <Toast message={toast?.message} type={toast?.type} />
        </>
      )}
    </div>
  );
}
