import { useState, useEffect, useRef } from 'react';
import LiveMapPreview from './LiveMapPreview';
import { getCategoryIcon } from './Icons';

/* ── Scroll reveal hook (IntersectionObserver, no scroll listeners) ──── */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, visible];
}

/* ── Animated counter: counts up once when it enters the viewport.
   Motivated motion (feedback on real stats); honors reduced motion. ───── */
function AnimatedNumber({ value, suffix = '' }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setDisplay(value); return; }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); obs.unobserve(el); } },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);

  useEffect(() => {
    if (!started) return;
    let frame;
    const to = value;
    const duration = 1200;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(to * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, value]);

  return <span ref={ref}>{display}{suffix}</span>;
}

/* ── Stats section ───────────────────────────────────────────── */
function StatsBar({ stats, loading }) {
  const total = stats?.total ?? 0;
  const resolved = stats?.by_status?.resolved ?? 0;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const categoryCount = Object.keys(stats?.by_category ?? {}).length;

  return (
    <div className="bw-stats">
      <div className="bw-stat">
        <span className="bw-stat-value">{loading ? '-' : <AnimatedNumber value={total} />}</span>
        <span className="bw-stat-label">Total Reports</span>
      </div>
      <div className="bw-stat-divider" />
      <div className="bw-stat">
        <span className="bw-stat-value">{loading ? '-' : <AnimatedNumber value={resolved} />}</span>
        <span className="bw-stat-label">Resolved</span>
      </div>
      <div className="bw-stat-divider" />
      <div className="bw-stat">
        <span className="bw-stat-value">{loading ? '-' : <AnimatedNumber value={resolutionRate} suffix="%" />}</span>
        <span className="bw-stat-label">Resolution Rate</span>
      </div>
      <div className="bw-stat-divider" />
      <div className="bw-stat">
        <span className="bw-stat-value">{loading ? '-' : <AnimatedNumber value={categoryCount} />}</span>
        <span className="bw-stat-label">Categories</span>
      </div>
    </div>
  );
}

/* ── Category chip (no decorative dot) ────────────────────────── */
const CATEGORY_LIST = [
  'Potholes', 'Streetlight', 'Graffiti', 'Illegal Dumping',
  'Sidewalk', 'Traffic Signs', 'Noise', 'Parks', 'Drainage', 'Other',
];

function CategoryChip({ label, index }) {
  return (
    <div className="bw-chip" style={{ animationDelay: `${index * 0.05}s` }}>
      <span className="bw-chip-label">{label}</span>
    </div>
  );
}

/* ── Feature card ─────────────────────────────────────────────── */
function FeatureCard({ icon, title, desc, index }) {
  const [revealRef, visible] = useReveal(0.1);
  return (
    <div
      ref={revealRef}
      className={`bw-feature ${visible ? 'revealed' : ''}`}
      style={{ transitionDelay: `${index * 0.06}s` }}
    >
      <div className="bw-feature-card">
        <div className="bw-feature-icon">{icon}</div>
        <h3 className="bw-feature-title">{title}</h3>
        <p className="bw-feature-desc">{desc}</p>
      </div>
    </div>
  );
}

/* ── Step card ────────────────────────────────────────────────── */
function StepCard({ number, icon, title, desc, index }) {
  const [ref, visible] = useReveal(0.15);
  return (
    <div
      ref={ref}
      className={`bw-step ${visible ? 'revealed' : ''}`}
      style={{ transitionDelay: `${index * 0.12}s` }}
    >
      <div className="bw-step-number">{number}</div>
      <div className="bw-step-icon">{icon}</div>
      <h3 className="bw-step-title">{title}</h3>
      <p className="bw-step-desc">{desc}</p>
    </div>
  );
}

/* ── Data hook ────────────────────────────────────────────────── */
function usePublicStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem('home_stats_cache');
    if (cached) { try { setStats(JSON.parse(cached)); setLoading(false); } catch {} }

    const controller = new AbortController();
    fetch('/api/public/summary/', { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setStats(data);
          sessionStorage.setItem('home_stats_cache', JSON.stringify(data));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  return { stats, loading };
}

/* ── Live activity strip (hero) — proves the community is active ─── */
function LiveActivityStrip({ stats, loading }) {
  const week = stats?.reports_this_week ?? 0;
  const resolvedToday = stats?.resolved_today ?? 0;
  const contributors = stats?.active_contributors ?? 0;

  if (loading) return <div className="lp-activity lp-activity-loading" aria-hidden="true" />;

  return (
    <div className="lp-activity" role="status" aria-label="Live community activity">
      <span className="lp-activity-dot" />
      <span className="lp-activity-item"><strong>{week}</strong> report{week === 1 ? '' : 's'} this week</span>
      <span className="lp-activity-sep" />
      <span className="lp-activity-item"><strong>{resolvedToday}</strong> resolved today</span>
      <span className="lp-activity-sep" />
      <span className="lp-activity-item"><strong>{contributors}</strong> neighbor{contributors === 1 ? '' : 's'} active</span>
    </div>
  );
}

/* ── Recent reports preview — real content builds trust ─────────── */
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', resolved: 'Resolved' };

function RecentReports({ reports, onNavigate }) {
  if (!reports?.length) return null;
  const items = reports.slice(0, 6);
  return (
    <div className="bw-recent-grid">
      {items.map((r, i) => (
        <button
          key={r.id}
          className="bw-recent-card"
          style={{ transitionDelay: `${i * 0.05}s` }}
          onClick={() => onNavigate('map')}
          title="Open the map"
        >
          <div className="bw-recent-head">
            <span className="bw-recent-icon">{getCategoryIcon(r.category, 18)}</span>
            <span className={`bw-recent-status ${r.status}`}>{STATUS_LABEL[r.status] || r.status}</span>
            {r.score_grade && <span className="bw-recent-grade">{r.score_grade}</span>}
          </div>
          <span className="bw-recent-cat">{r.category_display}</span>
          <span className="bw-recent-date">
            {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── Trust band — social proof right before the final CTA ───────── */
function TrustBand({ stats }) {
  const total = stats?.total ?? 0;
  const resolved = stats?.by_status?.resolved ?? 0;
  const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const contributors = stats?.active_contributors ?? 0;
  return (
    <div className="bw-trust">
      <div className="bw-trust-item"><span className="bw-trust-num">{rate}%</span><span className="bw-trust-label">Resolution rate</span></div>
      <div className="bw-trust-item"><span className="bw-trust-num">{total}</span><span className="bw-trust-label">Issues reported</span></div>
      <div className="bw-trust-item"><span className="bw-trust-num">{contributors}</span><span className="bw-trust-label">Active neighbors</span></div>
    </div>
  );
}

/* ── Revealable section wrapper ────────────────────────────────── */
function Section({ className, children }) {
  const [ref, vis] = useReveal(0.1);
  return <section ref={ref} className={`${className} ${vis ? 'revealed' : ''}`}>{children}</section>;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function HomePage({ onNavigate }) {
  const { stats, loading } = usePublicStats();
  const [heroRef, heroVisible] = useReveal(0.05);
  const [ctaRef, ctaVisible] = useReveal(0.15);
  const [heroStagger, setHeroStagger] = useState(false);

  // One-shot entrance stagger after mount (no scroll listeners).
  useEffect(() => {
    const t = setTimeout(() => setHeroStagger(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="lp">
      {/* ── Header (always visible) ── */}
      <header className="lp-header">
        <div className="lp-header-left">
          <img src="/logo_com.jpeg" alt="" className="brand-logo lp-header-logo" />
          <span className="lp-header-tag">Co-Map</span>
        </div>
        <nav className="lp-header-right">
          <button className="lp-nav-btn" onClick={() => onNavigate('map')}>Map</button>
          <button className="lp-nav-btn" onClick={() => onNavigate('login')}>Sign In</button>
        </nav>
      </header>

      <div className="lp-scroll">

        {/* ── Hero ── */}
        <section ref={heroRef} className={`lp-hero ${heroVisible ? 'revealed' : ''}`}>
          <main className="lp-main">
            <section className="lp-left">
              <h1 className="lp-headline">
                <span className={`lp-word ${heroStagger ? 'staggered' : ''}`} style={{ animationDelay: '0.05s' }}>REPORT.</span>
                <span className={`lp-word ${heroStagger ? 'staggered' : ''}`} style={{ animationDelay: '0.2s' }}>TRACK.</span>
                <span className={`lp-word ${heroStagger ? 'staggered' : ''}`} style={{ animationDelay: '0.35s' }}>RESOLVE.</span>
              </h1>
              <p className="lp-body">
                A community-powered platform to report local issues, track progress
                from city officials, and build better neighborhoods, one pin at a time.
              </p>
              <div className="lp-ctas">
                <button className="lp-cta lp-cta-solid" onClick={() => onNavigate('map')}>
                  Explore the Map
                </button>
                <button className="lp-cta lp-cta-ghost" onClick={() => onNavigate('login')}>
                  Create Account
                </button>
              </div>
              <LiveActivityStrip stats={stats} loading={loading} />
            </section>
            <section className="lp-right">
              <LiveMapPreview onEnter={() => onNavigate('map')} />
            </section>
          </main>
        </section>

        {/* ── Stats ── */}
        <Section className="bw-section">
          <StatsBar stats={stats} loading={loading} />
        </Section>

        {/* ── Recent reports preview (real content) ── */}
        {stats?.recent?.length > 0 && (
          <Section className="bw-section">
            <div className="bw-section-header">
              <h2 className="bw-section-title">Reported by neighbors, right now</h2>
            </div>
            <RecentReports reports={stats.recent} onNavigate={onNavigate} />
          </Section>
        )}

        {/* ── How It Works ── */}
        <Section className="bw-section">
          <div className="bw-section-header">
            <h2 className="bw-section-title">Three steps to make your voice heard</h2>
          </div>
          <div className="bw-steps">
            <StepCard
              number={1} index={0}
              icon={
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              }
              title="Pin the Location"
              desc="Tap anywhere on the map to drop a pin. The address fills in automatically."
            />
            <StepCard
              number={2} index={1}
              icon={
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                </svg>
              }
              title="Describe the Issue"
              desc="Select a category, add a description, upload a photo, and request action."
            />
            <StepCard
              number={3} index={2}
              icon={
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              }
              title="Track &amp; Earn"
              desc="Every report gets scored, tracked from pending to resolved, and earns XP."
            />
          </div>
        </Section>

        {/* ── Features ── */}
        <Section className="bw-section">
          <div className="bw-section-header">
            <h2 className="bw-section-title">A full community toolkit</h2>
          </div>
          <div className="bw-features-grid">
            <FeatureCard
              index={0}
              icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>}
              title="Points of Interest"
              desc="Toggle nearby parks, museums, and landmarks on the map."
            />
            <FeatureCard
              index={1}
              icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>}
              title="Area Info"
              desc="View Wikipedia articles about your current location."
            />
            <FeatureCard
              index={2}
              icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
              title="Data Analysis"
              desc="View trends, category breakdowns, and community insights."
            />
            <FeatureCard
              index={3}
              icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
              title="Gamification"
              desc="Earn XP, level up, unlock badges, and build your streak."
            />
            <FeatureCard
              index={4}
              icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>}
              title="Upvoting"
              desc="Upvote reports you care about. Issues rise to the top."
            />
            <FeatureCard
              index={5}
              icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
              title="Admin Panel"
              desc="Staff users can approve, reject, and resolve reports."
            />
          </div>
        </Section>

        {/* ── Categories ── */}
        <Section className="bw-section">
          <div className="bw-section-header">
            <h2 className="bw-section-title">Every issue, from potholes to parks</h2>
          </div>
          <div className="bw-chips">
            {CATEGORY_LIST.map((cat, i) => (
              <CategoryChip key={cat} label={cat} index={i} />
            ))}
          </div>
        </Section>

        {/* ── CTA ── */}
        <section ref={ctaRef} className={`bw-cta-section ${ctaVisible ? 'revealed' : ''}`}>
          <div className="bw-cta-card">
            <div className="bw-cta-border" />
            <div className="bw-cta-content">
              <TrustBand stats={stats} />
              <h2 className="bw-cta-title">Start Your Account</h2>
              <p className="bw-cta-desc">
                Create a free account to submit reports, earn XP, track your impact,
                and help your community thrive.
              </p>
              <div className="lp-ctas" style={{ justifyContent: 'center' }}>
                <button className="lp-cta lp-cta-solid" onClick={() => onNavigate('login')}>
                  Create Account
                </button>
                <button className="lp-cta lp-cta-ghost" onClick={() => onNavigate('map')}>
                  Browse as Guest
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="lp-footer">
          <span className="lp-footer-left">&copy; 2026 Co-Map</span>
          <span className="lp-footer-right">Built for better neighborhoods</span>
        </footer>

      </div>{/* /lp-scroll */}
    </div>
  );
}
