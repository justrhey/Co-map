import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const STATS_CACHE_KEY = 'home_stats_cache';
const STATS_CACHE_DURATION = 60000;

function usePublicStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem(STATS_CACHE_KEY);
    if (cached) {
      try { setStats(JSON.parse(cached)); setLoading(false); } catch {}
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

/* ── Scroll reveal hook ──────────────────────────────────────── */
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

/* ── Animated counter ────────────────────────────────────────── */
function AnimatedNumber({ value, suffix = '' }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    let frame;
    const from = 0;
    const to = value;
    const duration = 1200;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, value]);

  return <span ref={ref}>{display}{suffix}</span>;
}

/* ── Premium glass card ──────────────────────────────────────── */
function GlassCard({ children, className = '', style = {} }) {
  return (
    <div className={`premium-glass ${className}`} style={style}>
      {children}
    </div>
  );
}

/* ── Floating dots background ────────────────────────────────── */
function FloatingDots() {
  const dots = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 5,
      duration: Math.random() * 8 + 8,
      opacity: Math.random() * 0.15 + 0.03,
    })),
  []);
  return (
    <div className="floating-dots" aria-hidden="true">
      {dots.map(d => (
        <div
          key={d.id}
          className="floating-dot"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.size,
            height: d.size,
            opacity: d.opacity,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Category chip with wave delay ───────────────────────────── */
function CategoryChip({ label, index }) {
  return (
    <div className="premium-chip" style={{ animationDelay: `${index * 0.06}s` }}>
      <span className="premium-chip-dot" />
      <span className="premium-chip-label">{label}</span>
    </div>
  );
}

/* ── Feature card with perspective tilt on hover ─────────────── */
function FeatureCard({ icon, title, desc, index }) {
  const cardRef = useRef(null);
  const [revealRef, visible] = useReveal(0.1);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--tilt-x', `${x * 6}deg`);
    card.style.setProperty('--tilt-y', `${-y * 6}deg`);
    card.style.setProperty('--glow-x', `${(e.clientX - rect.left) / rect.width * 100}%`);
    card.style.setProperty('--glow-y', `${(e.clientY - rect.top) / rect.height * 100}%`);
  }, []);

  const handleMouseLeave = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
  }, []);

  return (
    <div
      ref={revealRef}
      className={`premium-feature ${visible ? 'revealed' : ''}`}
      style={{ transitionDelay: `${index * 0.08}s` }}
    >
      <div
        ref={cardRef}
        className="premium-feature-card"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="premium-feature-glow" />
        <div className="premium-feature-icon-wrap">{icon}</div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  );
}

/* ── Step card with sequential reveal ────────────────────────── */
function StepCard({ number, icon, title, desc, index }) {
  const [ref, visible] = useReveal(0.15);

  return (
    <div
      ref={ref}
      className={`premium-step ${visible ? 'revealed' : ''}`}
      style={{ transitionDelay: `${index * 0.15}s` }}
    >
      <div className="premium-step-number">{number}</div>
      <div className="premium-step-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

export default function HomePage({ onNavigate }) {
  const { stats, loading } = usePublicStats();
  const [heroRef, heroVisible] = useReveal(0.05);
  const [ctaRef, ctaVisible] = useReveal(0.15);

  const total = stats?.total ?? 0;
  const resolved = stats?.by_status?.resolved ?? 0;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const categoryCount = Object.keys(stats?.by_category ?? {}).length;

  return (
    <div className="home-page">

      {/* ── Hero ── */}
      <section ref={heroRef} className={`premium-hero ${heroVisible ? 'revealed' : ''}`}>
        <FloatingDots />
        <div className="premium-hero-bg-gradient" />

        <div className="premium-hero-content">
          <div className="premium-hero-logo">
            <div className="premium-hero-icon-ring">
              <svg viewBox="0 0 28 40" width="28" height="40" fill="none">
                <path d="M14 39C14 39 2 26 2 14 2 7.5 7.5 2 14 2s12 5.5 12 12c0 12-12 25-12 25z" fill="var(--accent)" opacity="0.9"/>
                <circle cx="14" cy="14" r="5" fill="#0d1117"/>
              </svg>
            </div>
            <h1 className="premium-hero-title">Co-Map</h1>
          </div>

          <p className="premium-hero-subtitle">
            Report issues in your neighborhood, track progress from city officials,
            and see what&apos;s being done &mdash; all on one map.
          </p>

          <div className="premium-hero-stats">
            <div className="premium-hero-stat">
              <span className="premium-hero-stat-value">
                {loading ? <span className="premium-skeleton" style={{width:60}} /> : <AnimatedNumber value={total} />}
              </span>
              <span className="premium-hero-stat-label">Total Reports</span>
              <div className="premium-hero-stat-bar" style={{width:'100%'}} />
            </div>
            <div className="premium-hero-stat">
              <span className="premium-hero-stat-value">
                {loading ? <span className="premium-skeleton" style={{width:50}} /> : <AnimatedNumber value={resolved} />}
              </span>
              <span className="premium-hero-stat-label">Resolved</span>
              <div className="premium-hero-stat-bar" style={{width: resolved > 0 && total > 0 ? `${(resolved/total)*100}%` : '0%'}} />
            </div>
            <div className="premium-hero-stat">
              <span className="premium-hero-stat-value">
                {loading ? <span className="premium-skeleton" style={{width:50}} /> : <AnimatedNumber value={resolutionRate} suffix="%" />}
              </span>
              <span className="premium-hero-stat-label">Resolution Rate</span>
              <div className="premium-hero-stat-bar" style={{width:`${resolutionRate}%`}} />
            </div>
            <div className="premium-hero-stat">
              <span className="premium-hero-stat-value">
                {loading ? <span className="premium-skeleton" style={{width:40}} /> : <AnimatedNumber value={categoryCount} />}
              </span>
              <span className="premium-hero-stat-label">Categories</span>
              <div className="premium-hero-stat-bar" style={{width: categoryCount > 0 ? `${(categoryCount/10)*100}%` : '0%'}} />
            </div>
          </div>

          <div className="premium-hero-ctas">
            <button className="premium-btn premium-btn-primary" onClick={() => onNavigate('map')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/>
                <line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              Explore Map
              <span className="premium-btn-glow" />
            </button>
            <button className="premium-btn premium-btn-ghost" onClick={() => onNavigate('login')}>
              Sign In
            </button>
          </div>
        </div>

        <div className="premium-hero-scroll-indicator">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
          </svg>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="premium-section">
        <div className="premium-section-header">
          <span className="premium-section-badge">How It Works</span>
          <h2 className="premium-section-title">Three simple steps to make your voice heard</h2>
        </div>
        <div className="premium-steps">
          <StepCard
            number={1}
            index={0}
            icon={
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            }
            title="Pin the Location"
            desc="Tap anywhere on the map to drop a pin exactly where the issue is. The address is filled in automatically."
          />
          <StepCard
            number={2}
            index={1}
            icon={
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            }
            title="Describe the Issue"
            desc="Select a category, add a description, upload a photo, and tell officials what action is needed."
          />
          <StepCard
            number={3}
            index={2}
            icon={
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            }
            title="Track &amp; Earn"
            desc="Every report gets scored, tracked from pending to resolved, and earns XP that levels up your profile."
          />
        </div>
      </section>

      {/* ── Features ── */}
      <section className="premium-section">
        <div className="premium-section-header">
          <span className="premium-section-badge">Features</span>
          <h2 className="premium-section-title">More than just reporting &mdash; a full community toolkit</h2>
        </div>
        <div className="premium-features-grid">
          <FeatureCard
            index={0}
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
            }
            title="Points of Interest"
            desc="Toggle nearby parks, museums, libraries, and landmarks on the map to see what's around you."
          />
          <FeatureCard
            index={1}
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
              </svg>
            }
            title="Area Info"
            desc="Pull up Wikipedia articles about your current location and learn the history of the neighborhood."
          />
          <FeatureCard
            index={2}
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            }
            title="Data Analysis"
            desc="View trends, category breakdowns, grade distributions, and smart insights about your community."
          />
          <FeatureCard
            index={3}
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            }
            title="Gamification"
            desc="Earn XP for every report, level up your profile, unlock badges, and build a streak of community participation."
          />
          <FeatureCard
            index={4}
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
            }
            title="Upvoting"
            desc="Upvote reports you care about. The most pressing issues rise to the top and get attention faster."
          />
          <FeatureCard
            index={5}
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            }
            title="Admin Panel"
            desc="Staff users can approve, reject, and resolve reports with official notes and resolution photos."
          />
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="premium-section">
        <div className="premium-section-header">
          <span className="premium-section-badge">Categories</span>
          <h2 className="premium-section-title">From potholes to parks &mdash; we cover every issue</h2>
        </div>
        <div className="premium-chips">
          {CATEGORY_LIST.map((cat, i) => (
            <CategoryChip key={cat} label={cat} index={i} />
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section ref={ctaRef} className={`premium-cta-section ${ctaVisible ? 'revealed' : ''}`}>
        <div className="premium-cta-card">
          <div className="premium-cta-border" />
          <div className="premium-cta-content">
            <h2>Start Your Account</h2>
            <p>Create a free account to submit reports, earn XP, track your impact, and help your community thrive.</p>
            <div className="premium-cta-actions">
              <button className="premium-btn premium-btn-primary" onClick={() => onNavigate('login')}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Create Account
                <span className="premium-btn-glow" />
              </button>
              <button className="premium-btn premium-btn-ghost" onClick={() => onNavigate('map')}>
                Browse as Guest
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="premium-footer">
        <p>Co-Map &mdash; built for better neighborhoods</p>
      </footer>
    </div>
  );
}
