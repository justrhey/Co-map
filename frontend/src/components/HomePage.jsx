import { useState, useEffect } from 'react';

const STATS_CACHE_KEY = 'home_stats_cache';
const STATS_CACHE_DURATION = 60000; // 1 min

function usePublicStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem(STATS_CACHE_KEY);
    if (cached) {
      try {
        setStats(JSON.parse(cached));
        setLoading(false);
      } catch {}
    }

    const controller = new AbortController();
    fetch('/api/public/summary/', { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setStats(data);
          sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify(data));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  return { stats, loading };
}

const CATEGORY_LIST = [
  'Potholes', 'Streetlight', 'Graffiti', 'Illegal Dumping',
  'Sidewalk', 'Traffic Signs', 'Noise', 'Parks', 'Drainage', 'Other',
];

export default function HomePage({ onNavigate }) {
  const { stats, loading } = usePublicStats();
  const total = stats?.total ?? 0;
  const resolved = stats?.by_status?.resolved ?? 0;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  return (
    <div className="home-page">

      {/* ── Hero ── */}
      <section className="home-hero">
        <div className="home-hero-bg" />
        <div className="home-hero-content">
          <div className="home-logo">
            <svg viewBox="0 0 28 40" width="36" height="48" fill="none">
              <path d="M14 39C14 39 2 26 2 14 2 7.5 7.5 2 14 2s12 5.5 12 12c0 12-12 25-12 25z" fill="var(--accent)" opacity="0.9"/>
              <circle cx="14" cy="14" r="5" fill="#0d1117"/>
            </svg>
            <h1 className="home-title">Community Watch</h1>
          </div>
          <p className="home-subtitle">
            Report issues in your neighborhood, track progress from city officials,
            and see what's being done — all on one map.
          </p>

          <div className="home-stats">
            <div className="home-stat">
              <span className="home-stat-value">{loading ? '...' : total.toLocaleString()}</span>
              <span className="home-stat-label">Total Reports</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">{loading ? '...' : resolved.toLocaleString()}</span>
              <span className="home-stat-label">Resolved</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">{loading ? '...' : `${resolutionRate}%`}</span>
              <span className="home-stat-label">Resolution Rate</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">{loading ? '...' : Object.keys(stats?.by_category ?? {}).length}</span>
              <span className="home-stat-label">Categories</span>
            </div>
          </div>

          <div className="home-ctas">
            <button className="btn btn-primary btn-lg" onClick={() => onNavigate('map')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/>
                <line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              Explore Map
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => onNavigate('login')}>
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="home-section">
        <h2 className="home-section-title">How It Works</h2>
        <p className="home-section-subtitle">Three simple steps to make your voice heard.</p>
        <div className="home-steps">
          <div className="home-step">
            <div className="home-step-number">1</div>
            <div className="home-step-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <h3>Pin the Location</h3>
            <p>Tap anywhere on the map to drop a pin exactly where the issue is. The address is filled in automatically.</p>
          </div>
          <div className="home-step">
            <div className="home-step-number">2</div>
            <div className="home-step-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <h3>Describe the Issue</h3>
            <p>Select a category, add a description, upload a photo, and tell officials what action is needed.</p>
          </div>
          <div className="home-step">
            <div className="home-step-number">3</div>
            <div className="home-step-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <h3>Track &amp; Earn</h3>
            <p>Every report gets scored, tracked from pending to resolved, and earns XP that levels up your profile.</p>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="home-section">
        <h2 className="home-section-title">What You Can Do</h2>
        <p className="home-section-subtitle">More than just reporting — a full community toolkit.</p>
        <div className="home-features">
          <div className="home-feature">
            <div className="home-feature-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <h3>Points of Interest</h3>
            <p>Toggle nearby parks, museums, libraries, and landmarks on the map to see what's around you.</p>
          </div>
          <div className="home-feature">
            <div className="home-feature-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
              </svg>
            </div>
            <h3>Area Info</h3>
            <p>Pull up Wikipedia articles about your current location — learn the history of the neighborhood you're in.</p>
          </div>
          <div className="home-feature">
            <div className="home-feature-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h3>Data Analysis</h3>
            <p>View trends, category breakdowns, grade distributions, and smart insights about your community.</p>
          </div>
          <div className="home-feature">
            <div className="home-feature-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <h3>Gamification</h3>
            <p>Earn XP for every report, level up your profile, unlock badges, and build a streak of community participation.</p>
          </div>
          <div className="home-feature">
            <div className="home-feature-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
            </div>
            <h3>Upvoting</h3>
            <p>Upvote reports you care about. The most pressing issues rise to the top and get attention faster.</p>
          </div>
          <div className="home-feature">
            <div className="home-feature-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3>Admin Panel</h3>
            <p>Staff users can approve, reject, and resolve reports with official notes and resolution photos.</p>
          </div>
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="home-section">
        <h2 className="home-section-title">Report Categories</h2>
        <p className="home-section-subtitle">From potholes to parks — we cover every issue that matters.</p>
        <div className="home-categories">
          {CATEGORY_LIST.map(cat => (
            <div key={cat} className="home-category-chip">
              <span className="home-category-label">{cat}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="home-cta-section">
        <div className="home-cta-card">
          <h2>Start Your Account</h2>
          <p>Create a free account to submit reports, earn XP, track your impact, and help your community thrive.</p>
          <div className="home-cta-actions">
            <button className="btn btn-primary btn-lg" onClick={() => onNavigate('login')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Create Account
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => onNavigate('map')}>
              Browse as Guest
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <p>Community Watch — built for better neighborhoods</p>
      </footer>
    </div>
  );
}
