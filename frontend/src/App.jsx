import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchComplaints, fetchComplaint, createComplaint, updateComplaintStatus, fetchBarangayScores, fetchUserStats, fetchUserProfile, fetchAdminSummary, login, register, logout as apiLogout, fetchMe, setToken, isLoggedIn, fetchComments, postComment } from './api';
import {
  IconClock,
  CATEGORIES, getCategoryIcon,
} from './components/Icons';
import MapView from './components/MapView';
import DragManDock from './components/DragManDock';
import AreaInfo from './components/AreaInfo';
import AnalysisPanel from './components/AnalysisPanel';
import SearchBar from './components/SearchBar';
import HomePage from './components/HomePage';
import LoginPage from './components/LoginPage';
import './App.css';

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
  }, [latlng?.lat, latlng?.lng]);

  return { address, loading };
}

// ── Filter Bar ──────────────────────────────────────────────────
function FilterBar({ active, onChange, counts, total, error, onRetry, loaded }) {
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
        {error ? <><span>{error}</span><button className="retry-btn" onClick={onRetry}>Retry</button></> : (total > 0 ? `${total} report${total > 1 ? 's' : ''}` : (loaded ? 'No reports in this area yet' : 'Loading...'))}
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
            {error && (
              <div className="form-error" role="alert">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}
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

// ── Score coloring: 0% → red, 50% → amber, 100% → green ────────
// Returns a #rrggbb hex string so callers can append an alpha suffix (e.g.
// `${col}88`) for a translucent variant.
function scoreColor(pct) {
  if (pct <= 0) return '#ef4444';
  if (pct >= 100) return '#22c55e';
  // red (#ef4444) → amber (#f59e0b) → green (#22c55e)
  const r = pct < 50
    ? Math.round(239 - (239 - 245) * (pct / 50))   // #ef → #f5
    : Math.round(245 - (245 - 34) * ((pct - 50) / 50));  // #f5 → #22
  const g = pct < 50
    ? Math.round(68 - (68 - 158) * (pct / 50))     // #44 → #9e
    : Math.round(158 - (158 - 197) * ((pct - 50) / 50)); // #9e → #c5
  const b = pct < 50
    ? Math.round(68 - (68 - 11) * (pct / 50))      // #44 → #0b
    : Math.round(11 - (11 - 94) * ((pct - 50) / 50));  // #0b → #5e
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ── Score Circle Component ──────────────────────────────────────
function ScoreCircle({ score }) {
  if (score == null) return null;
  const grade = score.letter_grade || 'F';
  const col = scoreColor(score.total);

  return (
    <div className="score-circle" style={{ borderColor: col }}>
      <span className="score-circle-grade" style={{ color: col }}>{grade}</span>
      <span className="score-circle-pct">{score.total}</span>
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
  const [open, setOpen] = useState(false);

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
  const [submitError, setSubmitError] = useState('');
  const [discussionEnabled, setDiscussionEnabled] = useState(true);

  useEffect(() => {
    if (open) {
      setCategory('potholes'); setSituation(''); setImpact('');
      setActionRequested(''); setCustomTitle('');
      setPhoto(null); setPhotoPreview(null); setAdditionalMedia([]);
      setSubmitError(''); setDiscussionEnabled(true);
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
    setSubmitError('');
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
        discussion_enabled: discussionEnabled,
      };
      if (additionalMedia.length > 0) {
        payload.additional_media = additionalMedia;
      }
      await createComplaint(payload);
      onSubmit();
      onClose();
    } catch (err) {
      if (err.kind === 'auth') {
        // Not (or no longer) logged in — send them to sign in, keep their draft.
        if (onLoginRequired) onLoginRequired();
        else onClose();
      } else {
        // Show it in-context so the draft stays visible, plus a toast.
        setSubmitError(err.message);
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
            <div className="submit-form-body">
            <div className="field-group">
              <label>Category</label>
              <div className="cat-pills">
                {CATEGORIES.map(({ value, label }) => (
                  <button
                    type="button"
                    key={value}
                    className={`cat-pill${category === value ? ' active' : ''}`}
                    onClick={() => setCategory(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
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

            <label className="discussion-toggle">
              <input type="checkbox" checked={discussionEnabled} onChange={(e) => setDiscussionEnabled(e.target.checked)} />
              <span className="discussion-toggle-box" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span className="discussion-toggle-text">
                <span className="discussion-toggle-title">Allow neighbors to discuss</span>
                <span className="discussion-toggle-sub">Let others comment and confirm they're affected too</span>
              </span>
            </label>

            {submitError && (
              <div className="form-error" role="alert">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{submitError}</span>
              </div>
            )}
            </div>{/* /submit-form-body */}
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

// ── Discussion thread ──────────────────────────────────────────
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function CommentItem({ c, isReply, onReply }) {
  return (
    <div className={`comment${isReply ? ' comment-reply' : ''}${c.is_reporter ? ' is-reporter' : ''}`}>
      <div className="comment-meta">
        <span className="comment-author">{c.user?.name || 'Neighbor'}</span>
        {c.is_reporter && <span className="comment-badge">Reporter</span>}
        <span className="comment-time">{timeAgo(c.created_at)}</span>
      </div>
      <p className="comment-body">{c.body}</p>
      {!isReply && isLoggedIn() && (
        <button className="comment-reply-btn" onClick={() => onReply(c)}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          Reply
        </button>
      )}
    </div>
  );
}

function CommentThread({ complaintId, enabled, fullHeight = false }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState(null); // parent comment being replied to
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchComments(complaintId)
      .then(data => { if (active) setComments(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setComments([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [complaintId]);

  const startReply = (c) => { setReplyTo(c); inputRef.current?.focus(); };

  const submit = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || posting) return;
    if (!isLoggedIn()) { setError('Sign in to join the discussion.'); return; }
    setPosting(true);
    setError('');
    try {
      const created = await postComment(complaintId, text, replyTo?.id || null);
      if (replyTo) {
        // Nest the reply under its parent.
        setComments(prev => prev.map(p =>
          p.id === replyTo.id ? { ...p, replies: [...(p.replies || []), created] } : p));
      } else {
        setComments(prev => [...prev, created]);
      }
      setBody('');
      setReplyTo(null);
    } catch (err) {
      setError(err.message || 'Could not post comment.');
    } finally {
      setPosting(false);
    }
  };

  if (!enabled) return null;

  const totalCount = comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  return (
    <div className={`discussion${fullHeight ? ' discussion-full' : ''}`}>
      {!fullHeight && (
        <div className="discussion-head">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Discussion{totalCount ? ` · ${totalCount}` : ''}</span>
        </div>
      )}

      <div className="discussion-list">
        {loading ? (
          <div className="discussion-empty">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="discussion-empty">No comments yet. Be the first to add context.</div>
        ) : comments.map(c => (
          <div className="comment-group" key={c.id}>
            <CommentItem c={c} onReply={startReply} />
            {c.replies?.length > 0 && (
              <div className="comment-replies">
                {c.replies.map(r => <CommentItem key={r.id} c={r} isReply onReply={startReply} />)}
              </div>
            )}
          </div>
        ))}
      </div>

      {isLoggedIn() ? (
        <form className="comment-form-wrap" onSubmit={submit}>
          {replyTo && (
            <div className="reply-indicator">
              <span>Replying to <strong>{replyTo.user?.name || 'Neighbor'}</strong></span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}
          <div className="comment-form">
            <input
              ref={inputRef}
              type="text"
              className="comment-input"
              placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
              value={body}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
            />
            <button type="submit" className="comment-send" disabled={posting || !body.trim()} aria-label="Send">
              {posting ? <span className="spinner" /> : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="discussion-empty">Sign in to join the discussion.</div>
      )}
      {error && <p className="comment-error">{error}</p>}
    </div>
  );
}

// ── Detail Sheet (with score) ──────────────────────────────────
// ── Media carousel — one frame at a time, switch like a carousel ──
// Merges the primary photo + any additional media into a single slot so the
// modal never grows tall with stacked images. Arrows + dots + swipe to switch.
function MediaCarousel({ photo, media }) {
  const items = [
    ...(photo ? [{ type: 'image', url: photo }] : []),
    ...((media || []).map(m => ({ type: m.media_type || 'image', url: m.file, id: m.id }))),
  ];
  const [i, setI] = useState(0);
  const touchX = useRef(null);

  if (!items.length) return null;
  const n = items.length;
  const idx = Math.min(i, n - 1);
  const cur = items[idx];
  const go = (d) => setI((p) => (((p + d) % n) + n) % n);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return (
    <div className="detail-carousel">
      <div
        className="detail-carousel-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => window.open(cur.url, '_blank')}
      >
        {cur.type === 'video' ? (
          <video src={cur.url} className="detail-carousel-media" controls onClick={(e) => e.stopPropagation()} />
        ) : cur.type === 'audio' ? (
          <div className="detail-carousel-audio" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <audio src={cur.url} controls />
          </div>
        ) : (
          <img src={cur.url} alt={`Media ${idx + 1}`} className="detail-carousel-media" />
        )}

        {n > 1 && (
          <>
            <button className="carousel-arrow prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button className="carousel-arrow next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <span className="carousel-count">{idx + 1} / {n}</span>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="carousel-dots">
          {items.map((_, k) => (
            <button
              key={k}
              className={`carousel-dot${k === idx ? ' active' : ''}`}
              onClick={() => setI(k)}
              aria-label={`Go to media ${k + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailSheet({ open, complaintId, onClose }) {
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const latlng = complaint ? { lat: complaint.latitude, lng: complaint.longitude } : null;
  const { address, loading: addrLoading } = useAddress(latlng);

  // Close the side discussion whenever the sheet closes or the report changes.
  useEffect(() => { setDiscussionOpen(false); }, [open, complaintId]);

  useEffect(() => {
    if (!open || !complaintId) { setComplaint(null); return; }
    setLoading(true);
    fetchComplaint(complaintId)
      .then(setComplaint)
      .catch(() => setComplaint(null))
      .finally(() => setLoading(false));
  }, [open, complaintId]);

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}${discussionOpen ? ' discussion-active' : ''}`}>
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
              <div className="detail-address-row">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="detail-address-icon">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span className="detail-address-text">{addrLoading ? 'Locating…' : address}</span>
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
                  {[
                    { key: 'specificity', label: 'Structure', val: complaint.score.specificity, max: 25 },
                    { key: 'context', label: 'Detail', val: complaint.score.context, max: 30 },
                    { key: 'clarity', label: 'Coherence', val: complaint.score.clarity, max: 20 },
                    { key: 'completeness', label: 'Completeness', val: complaint.score.completeness, max: 15 },
                    { key: 'actionability', label: 'Actionability', val: complaint.score.actionability, max: 10 },
                  ].map(({ key, label, val, max }) => {
                    const pct = Math.round((val / max) * 100);
                    const col = scoreColor(pct);
                    return (
                      <div className="sc-breakdown" key={key}>
                        <div className="sc-bar">
                          <div className="sc-bar-fill" style={{ width: `${pct}%`, background: col }} />
                        </div>
                        <span className="sc-label">{label}</span>
                        <span className="sc-val" style={{ color: col }}>{val}/{max}</span>
                      </div>
                    );
                  })}
                  {complaint.score.description_detail && (
                    <div className="sc-note">{complaint.score.description_detail}</div>
                  )}
                </div>
              )}

              <MediaCarousel photo={complaint.photo} media={complaint.media} />

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
              {complaint.discussion_enabled && (
                <button className="discussion-open-btn" onClick={() => setDiscussionOpen(true)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span>Discussion{complaint.comment_count ? ` · ${complaint.comment_count}` : ''}</span>
                  <svg className="discussion-open-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              )}
              <div className="detail-close-bar">
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <div className="detail-loading">Could not load details.</div>
          )}
        </div>
      </div>

      {/* Discussion as a separate panel beside the report detail */}
      {complaint && complaint.discussion_enabled && (
        <DiscussionPanel
          open={discussionOpen}
          complaintId={complaint.id}
          title={complaint.category_display}
          onClose={() => setDiscussionOpen(false)}
        />
      )}
    </div>
  );
}

// ── Discussion Panel (slides in beside the report detail) ───────
function DiscussionPanel({ open, complaintId, title, onClose }) {
  return (
    <div className={`discussion-panel${open ? ' open' : ''}`} role="dialog" aria-label="Discussion">
      <div className="discussion-panel-header">
        <button className="discussion-panel-back" onClick={onClose} aria-label="Back to report">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div className="discussion-panel-title">
          <span className="discussion-panel-kicker">Discussion</span>
          <span className="discussion-panel-sub">{title}</span>
        </div>
      </div>
      {open && <CommentThread complaintId={complaintId} enabled fullHeight />}
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

              {profile.credibility && (
                <div className="profile-cred-card">
                  <div className="profile-cred-grade" style={{ color: gradeColor(profile.credibility.grade), borderColor: gradeColor(profile.credibility.grade) }}>
                    {profile.credibility.grade || '-'}
                  </div>
                  <div className="profile-cred-body">
                    <span className="profile-cred-label">{profile.credibility.label}</span>
                    <span className="profile-cred-sub">
                      {profile.credibility.count > 0
                        ? `Credibility ${profile.credibility.score}/100 · based on ${profile.credibility.count} report${profile.credibility.count > 1 ? 's' : ''}`
                        : 'File quality reports to build your credibility'}
                    </span>
                  </div>
                </div>
              )}

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

// ── Confirm dialog — a small cautious "are you sure?" prompt ─────
function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{title}</h3>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}


// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [complaints, setComplaints] = useState([]);
  const [counts, setCounts] = useState({});
  const [activeFilter, setActiveFilter] = useState('all');
  const [centerLatLng, setCenterLatLng] = useState({ lat: 14.565, lng: 121.035 });
  const [reportPin, setReportPin] = useState(null); // where the man was dropped
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
  const [dataLoaded, setDataLoaded] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [showCoolSpots, setShowCoolSpots] = useState(false);
  const [showAreaInfo, setShowAreaInfo] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const lastFetchCenter = useRef(null);
  const chromeRef = useRef(null);

  // Publish the real height of the top chrome so floating panels clear it
  // automatically — no hardcoded offsets, so nothing can overlap.
  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty('--chrome-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page, user, userStats]);

  // Capture a token handed back by the social-login bridge (?token=…), store
  // it, then strip it from the URL before the normal auth bootstrap runs.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setToken(token);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('auth_error')) {
      setToast({ message: 'Social sign-in failed. Please try again.', type: 'error' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Load user from token on mount
  useEffect(() => {
    if (isLoggedIn()) {
      fetchMe().then(data => {
        if (data) { setUser(data.user); setPage('map'); }
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
    setConfirmSignOut(false);
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
      setDataLoaded(true);
    } catch (err) {
      console.error(err);
      // ApiError messages are already user-facing and offline-aware.
      setLoadError(err.message || 'Could not load reports. Please try again.');
    }
  }, [activeFilter]);

  // One fetch path: (re)load when the filter changes or the map center moves to
  // a new ~1km cell. The key includes the filter so changing it busts the dedup,
  // and the coarse cell (2 decimals ≈ 1.1km) stops panning from hammering the API.
  useEffect(() => {
    const key = `${activeFilter}|${centerLatLng.lat.toFixed(2)},${centerLatLng.lng.toFixed(2)}`;
    if (lastFetchCenter.current === key) return;
    lastFetchCenter.current = key;
    loadData({ lat: centerLatLng.lat, lng: centerLatLng.lng, radius: 10 });
  }, [centerLatLng.lat, centerLatLng.lng, loadData, activeFilter]);

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

  // Barangay scores are slow-moving aggregates — fetch once on mount, not on
  // every complaints update (which fired on every map pan). They're refreshed
  // after a submit via the submitOpen effect below.
  useEffect(() => {
    fetchBarangayScores().then(setHealthData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!submitOpen) {
      fetchUserStats().then(setUserStats).catch(() => {});
      fetchBarangayScores().then(setHealthData).catch(() => {});
    }
  }, [submitOpen]);

  // ── Handlers ──

  const handleMarkerClick = useCallback((id) => {
    // Anyone can see pins, but details require signing in.
    if (!isLoggedIn()) {
      setToast({ message: 'Sign in to view report details', type: 'error' });
      return;
    }
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const handleReport = () => {
    if (!reportPin) return;
    setSubmitLatLng(reportPin);
    setSubmitOpen(true);
  };

  // FAB: one-tap report at the current map center (no dragging needed).
  const handleFabReport = () => {
    if (!isLoggedIn()) { setPage('login'); return; }
    const pin = { lat: centerLatLng.lat, lng: centerLatLng.lng };
    setReportPin(pin);
    setSubmitLatLng(pin);
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
      {/* Top chrome — top bar + filters + toggles stacked so they can never overlap */}
      <div className="top-chrome" ref={chromeRef}>
      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar-inner">
          <h1 className="app-title" onClick={() => setPage('home')} style={{ cursor: 'pointer' }}>
            <img src="/logo_com.jpeg" alt="" className="brand-logo" /> Co-Map
          </h1>
          {mapInstance && <SearchBar map={mapInstance} />}
          {user ? (
            <div className="user-badge">
              {userStats?.level && (
                <span className="user-level-chip" title={`Level ${userStats.level.level} · ${userStats.total_xp} XP`}>
                  <span className="user-level-num">{userStats.level.level}</span>
                  <span className="user-level-word">LVL</span>
                </span>
              )}
              <button className="user-identity" onClick={openProfile} title="View your profile">
                <span className="user-name">{user.name || user.email?.split('@')[0]}</span>
                {userStats && userStats.total_reports > 0 && (
                  <span className="user-reports">{userStats.total_reports} report{userStats.total_reports > 1 ? 's' : ''}</span>
                )}
              </button>
              {userStats && userStats.streak >= 1 && (
                <span className="user-streak" title={`${userStats.streak}-day reporting streak`}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                  {userStats.streak}d
                </span>
              )}
              {user?.is_staff && (
                <button className="user-btn admin-btn" onClick={() => setAdminOpen(true)}>Admin</button>
              )}
              <button className="user-btn" onClick={() => setConfirmSignOut(true)}>Sign Out</button>
            </div>
          ) : (
            <button className="user-btn sign-in" onClick={() => setPage('login')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Sign In
            </button>
          )}
        </div>
        {userStats && userStats.badges && userStats.badges.length > 0 && (
          <div className="badges-bar">
            {userStats.badges.map(b => (
              <div key={b.id} className="badge-item" title={`${b.title} - ${b.subtitle}`}>
                <span className="badge-icon">
                  {BADGE_ICONS[b.id]}
                </span>
                <span className="badge-name">{b.title}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      <FilterBar active={activeFilter} onChange={setActiveFilter} counts={counts} total={complaints.length} error={loadError} onRetry={() => loadData()} loaded={dataLoaded} />

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
      </div>{/* /top-chrome */}

      <HotspotPanel analytics={analytics} healthScore={healthData?.overall?.score ?? null} openCount={healthData?.overall?.open ?? 0} resolvedCount={healthData?.overall?.resolved ?? 0} />

      {/* Map (MapLibre GL — 3D capable) */}
      <MapView
        complaints={complaints}
        showCoolSpots={showCoolSpots}
        onMarkerClick={handleMarkerClick}
        onCenterChange={setCenterLatLng}
        onMapReady={setMapInstance}
        reportPin={reportPin}
      />
      <AreaInfo visible={showAreaInfo} center={centerLatLng} />

      {/* Corner-docked man — drag him onto the map to drop a report pin. */}
      {mapInstance && <DragManDock map={mapInstance} onPlace={setReportPin} />}

      {/* Bottom card — only for logged-in users */}
      {isLoggedIn() && !submitOpen && reportPin && (
        <BottomCard latlng={reportPin} onReport={handleReport} />
      )}

      {/* Floating action button — always-reachable one-tap report at map center */}
      {!submitOpen && !detailOpen && !profileOpen && (
        <button className="report-fab" onClick={handleFabReport} aria-label="Report an issue here">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="report-fab-label">Report</span>
        </button>
      )}

      <SubmitSheet open={submitOpen} latlng={submitLatLng} onClose={handleSubmitClose} onSubmit={handleSubmitSuccess} onLoginRequired={() => setPage('login')} setToast={setToast} />
      <DetailSheet open={detailOpen} complaintId={detailId} onClose={() => { setDetailOpen(false); setDetailId(null); }} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <AdminSheet open={adminOpen} onClose={() => setAdminOpen(false)} onStatusChange={() => loadData()} setToast={setToast} />
      <AnalysisPanel open={analysisOpen} onClose={() => setAnalysisOpen(false)} />
      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message="Do you want to sign out? You'll need to sign in again to submit or track reports."
        confirmLabel="Sign Out"
        cancelLabel="Stay signed in"
        danger
        onConfirm={handleLogout}
        onCancel={() => setConfirmSignOut(false)}
      />
      <Toast message={toast?.message} type={toast?.type} />
        </>
      )}
    </div>
  );
}
