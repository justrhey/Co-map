import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { fetchComplaints, fetchCachedComplaints, fetchCachedBarangayScores, fetchUserStats, fetchMe, logout as apiLogout, setToken, isLoggedIn } from './api';
import { BADGE_ICONS } from './utils/badges';

// Components loaded on every page (small, always needed).
import FilterBar from './components/FilterBar';
import Toast from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';

// Heavy / page-specific components are lazy-loaded so the initial bundle
// stays lean. MapLibre GL (~700 KB) only downloads when the user visits
// the map or the landing page hero.
const HomePage = lazy(() => import('./components/HomePage'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const MapView = lazy(() => import('./components/MapView'));
const DragManDock = lazy(() => import('./components/DragManDock'));
const AreaInfo = lazy(() => import('./components/AreaInfo'));
const AnalysisPanel = lazy(() => import('./components/AnalysisPanel'));
const SearchBar = lazy(() => import('./components/SearchBar'));
const BottomCard = lazy(() => import('./components/BottomCard'));
const HotspotPanel = lazy(() => import('./components/HotspotPanel'));
const SubmitSheet = lazy(() => import('./components/SubmitSheet'));
const DetailSheet = lazy(() => import('./components/DetailSheet'));
const ProfileSheet = lazy(() => import('./components/ProfileSheet'));
const AdminSheet = lazy(() => import('./components/AdminSheet'));

// ── Category colors (exported for HotspotPanel) ────────────────
export const CAT_COLORS = {
  potholes: '#f59e0b', streetlight: '#06b6d4', graffiti: '#ec4899',
  illegal_dumping: '#ef4444', sidewalk: '#22c55e', traffic: '#eab308',
  noise: '#a855f7', water: '#3b82f6', park: '#10b981', other: '#6366f1',
};

// ── Internal spatial helpers ──────────────────────────────────────
function pointInPolygon(lng, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
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

// ── Main App Component ────────────────────────────────────────────
export default function App() {
  const [complaints, setComplaints] = useState([]);
  const [counts, setCounts] = useState({});
  const [activeFilter, setActiveFilter] = useState('all');
  const [centerLatLng, setCenterLatLng] = useState({ lat: 14.565, lng: 121.035 });
  const [reportPin, setReportPin] = useState(null);
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

  // ── Chrome height monitoring ──
  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty('--chrome-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page, user, userStats]);

  // ── Auth: capture social-login token, restore session ──
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

  // ── Data fetching ──
  const loadData = useCallback(async (spatial = null, forceFresh = false) => {
    try {
      setLoadError(null);
      const params = { page: '1', ...(activeFilter !== 'all' ? { category: activeFilter } : {}) };
      if (spatial) Object.assign(params, spatial);
      const fetcher = forceFresh ? fetchComplaints : (p) => fetchCachedComplaints(p).then(r => r.data);
      const data = await fetcher(params);
      setComplaints(data.results || []);
      setDataLoaded(true);
    } catch (err) {
      setLoadError(err.message || 'Could not load reports. Please try again.');
    }
  }, [activeFilter]);

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
      .sort((a, b) => b.count - a.count).slice(0, 5)
      .map(area => ({ ...area, barangay: findBarangay(area.lat, area.lng, barangayData) }));
    const topCategories = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    return { topAreas, topCategories, total: complaints.length };
  }, [complaints, barangayData]);

  // ── Side effects ──
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { fetchUserStats().then(setUserStats).catch(() => {}); }, [user]);
  useEffect(() => { fetchCachedBarangayScores().then(({ data }) => setHealthData(data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!submitOpen) {
      fetchUserStats().then(setUserStats).catch(() => {});
      fetchCachedBarangayScores().then(({ data }) => setHealthData(data)).catch(() => {});
    }
  }, [submitOpen]);

  // ── Event handlers ──
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

  const handleMarkerClick = useCallback((id) => {
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

  const handleFabReport = () => {
    if (!isLoggedIn()) { setPage('login'); return; }
    const pin = { lat: centerLatLng.lat, lng: centerLatLng.lng };
    setReportPin(pin);
    setSubmitLatLng(pin);
    setSubmitOpen(true);
  };

  const handleSubmitClose = () => { setSubmitOpen(false); setSubmitLatLng(null); };
  const handleSubmitSuccess = () => {
    loadData(null, true);  // force fresh fetch after new report
    setSubmitOpen(false);
    setSubmitLatLng(null);
    setToast({ message: 'Report submitted!', type: 'success' });
  };

  const openProfile = useCallback(() => setProfileOpen(true), []);

  return (
    <div className="app">
      <Suspense fallback={<div className="page-loading"><span className="spinner" /></div>}>
        {page === 'home' && <HomePage onNavigate={setPage} />}
        {page === 'login' && <LoginPage onLogin={handleLogin} onBack={() => setPage('map')} />}
      </Suspense>

      {page === 'map' && (
        <>
          <div className="top-chrome" ref={chromeRef}>
            <header className="top-bar">
              <div className="top-bar-inner">
                <h1 className="app-title" onClick={() => setPage('home')} style={{ cursor: 'pointer' }}>
                  <img src="/logo_com.jpeg" alt="" className="brand-logo" /> Co-Map
                </h1>
                <Suspense fallback={null}>
                  {mapInstance && <SearchBar map={mapInstance} />}
                </Suspense>
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
                      <span className="badge-icon">{BADGE_ICONS[b.id]}</span>
                      <span className="badge-name">{b.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </header>
            <FilterBar active={activeFilter} onChange={setActiveFilter} counts={counts} total={complaints.length} error={loadError} onRetry={() => loadData(null, true)} loaded={dataLoaded} />
            <div className="map-toggles">
              <button className={`toggle-pill${showCoolSpots ? ' active' : ''}`} onClick={() => setShowCoolSpots(v => !v)}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Spots
              </button>
              <button className={`toggle-pill${showAreaInfo ? ' active' : ''}`} onClick={() => setShowAreaInfo(v => !v)}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Area
              </button>
              <button className="toggle-pill" onClick={() => setAnalysisOpen(true)}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg> Analysis
              </button>
            </div>
          </div>

          <Suspense fallback={<div className="map-loading-placeholder"><span className="spinner" /> Loading map…</div>}>
            <HotspotPanel analytics={analytics} healthScore={healthData?.overall?.score ?? null} openCount={healthData?.overall?.open ?? 0} resolvedCount={healthData?.overall?.resolved ?? 0} />
            <MapView complaints={complaints} showCoolSpots={showCoolSpots} onMarkerClick={handleMarkerClick} onCenterChange={setCenterLatLng} onMapReady={setMapInstance} reportPin={reportPin} />
            <AreaInfo visible={showAreaInfo} center={centerLatLng} />
            {mapInstance && <DragManDock map={mapInstance} onPlace={setReportPin} />}
          </Suspense>

          <Suspense fallback={null}>
            {isLoggedIn() && !submitOpen && reportPin && <BottomCard latlng={reportPin} onReport={handleReport} />}
            {!submitOpen && !detailOpen && !profileOpen && (
              <button className="report-fab" onClick={handleFabReport} aria-label="Report an issue here">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                <span className="report-fab-label">Report</span>
              </button>
            )}
            <SubmitSheet open={submitOpen} latlng={submitLatLng} onClose={handleSubmitClose} onSubmit={handleSubmitSuccess} onLoginRequired={() => setPage('login')} setToast={setToast} />
            <DetailSheet open={detailOpen} complaintId={detailId} onClose={() => { setDetailOpen(false); setDetailId(null); }} />
            <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
            <AdminSheet open={adminOpen} onClose={() => setAdminOpen(false)} onStatusChange={() => loadData(null, true)} setToast={setToast} />
            <AnalysisPanel open={analysisOpen} onClose={() => setAnalysisOpen(false)} />
          </Suspense>

          <ConfirmDialog open={confirmSignOut} title="Sign out?" message="Do you want to sign out? You'll need to sign in again to submit or track reports." confirmLabel="Sign Out" cancelLabel="Stay signed in" danger onConfirm={handleLogout} onCancel={() => setConfirmSignOut(false)} />
          <Toast message={toast?.message} type={toast?.type} />
        </>
      )}
    </div>
  );
}
