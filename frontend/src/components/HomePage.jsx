/* ── Sample map screenshot (SVG) ──────────────────────────────── */
function MapPreview() {
  return (
    <div className="map-preview-container">
      {/* Corner brackets */}
      <div className="geo-bracket geo-bracket-tl" />
      <div className="geo-bracket geo-bracket-tr" />
      <div className="geo-bracket geo-bracket-bl" />
      <div className="geo-bracket geo-bracket-br" />

      <svg className="map-preview-svg" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        {/* Grid pattern */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Base fill */}
        <rect width="400" height="300" fill="#111111" />
        <rect width="400" height="300" fill="url(#grid)" />

        {/* Major road - horizontal */}
        <path d="M0 160 Q100 155 200 165 Q280 172 400 160" stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none" />
        <path d="M0 162 Q100 157 200 167 Q280 174 400 162" stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />

        {/* Major road - diagonal */}
        <path d="M80 0 L150 300" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" fill="none" />
        <path d="M90 0 L160 300" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" fill="none" />

        {/* Secondary roads */}
        <path d="M0 100 L400 100" stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none" />
        <path d="M0 220 L400 220" stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none" />
        <path d="M120 0 L120 300" stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none" />
        <path d="M320 0 L320 300" stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none" />

        {/* River / water */}
        <path d="M200 0 C180 40 220 80 210 120 C200 160 230 200 215 240 C200 280 210 290 210 300" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
        <path d="M200 0 C180 40 220 80 210 120 C200 160 230 200 215 240 C200 280 210 290 210 300" stroke="rgba(255,255,255,0.04)" strokeWidth="12" fill="none" />

        {/* Park/green area outline */}
        <rect x="260" y="50" width="60" height="50" rx="2" stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="rgba(255,255,255,0.02)" />

        {/* Building footprints */}
        <rect x="30" y="180" width="18" height="14" rx="1" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" fill="rgba(255,255,255,0.02)" />
        <rect x="52" y="178" width="12" height="16" rx="1" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" fill="rgba(255,255,255,0.02)" />
        <rect x="35" y="200" width="22" height="12" rx="1" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" fill="rgba(255,255,255,0.02)" />

        <rect x="330" y="190" width="15" height="12" rx="1" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" fill="rgba(255,255,255,0.02)" />
        <rect x="350" y="188" width="20" height="14" rx="1" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" fill="rgba(255,255,255,0.02)" />
        <rect x="345" y="208" width="16" height="10" rx="1" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" fill="rgba(255,255,255,0.02)" />

        {/* Map marker cluster */}
        <g filter="url(#glow)">
          {/* Pin 1 - large, active */}
          <circle cx="140" cy="140" r="4" fill="#FFF" opacity="0.9" />
          <circle cx="140" cy="140" r="8" fill="rgba(255,255,255,0.08)" />
          <path d="M140 150 L140 170" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />

          {/* Pin 2 */}
          <circle cx="260" cy="220" r="3" fill="#FFF" opacity="0.6" />
          <circle cx="260" cy="220" r="6" fill="rgba(255,255,255,0.05)" />
          <path d="M260 228 L260 240" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

          {/* Pin 3 - cluster indicator */}
          <circle cx="320" cy="80" r="6" fill="rgba(255,255,255,0.12)" />
          <circle cx="320" cy="80" r="3" fill="rgba(255,255,255,0.04)" />

          {/* Pin 4 */}
          <circle cx="70" cy="60" r="2.5" fill="#FFF" opacity="0.4" />
          <path d="M70 65 L70 75" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
        </g>

        {/* Mini info card overlay */}
        <rect x="50" y="30" width="100" height="20" rx="2" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
        <text x="60" y="43" fill="rgba(255,255,255,0.5)" fontFamily="monospace" fontSize="7" letterSpacing="1">GRID: 14.56, 121.04</text>

        {/* Scale bar */}
        <line x1="300" y1="269" x2="340" y2="269" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <line x1="300" y1="267" x2="300" y2="271" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <line x1="340" y1="267" x2="340" y2="271" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <text x="315" y="264" fill="rgba(255,255,255,0.15)" fontFamily="monospace" fontSize="5" textAnchor="middle">500m</text>

        {/* Compass rose */}
        <g transform="translate(372, 36)">
          <circle cx="0" cy="0" r="8" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" fill="none" />
          <polygon points="0,-6 -2,2 0,0.5 2,2" fill="rgba(255,255,255,0.2)" />
          <polygon points="0,6 -2,-2 0,-0.5 2,-2" fill="rgba(255,255,255,0.08)" />
        </g>
      </svg>

      {/* Bottom bar */}
      <div className="map-preview-bar">
        <span className="map-preview-bar-text">12 markers visible</span>
        <span className="map-preview-bar-text">Metro Manila</span>
        <span className="map-preview-bar-text">zoom 14</span>
      </div>
    </div>
  );
}

export default function HomePage({ onNavigate }) {
  return (
    <div className="lp">
      {/* ── Header ── */}
      <header className="lp-header">
        <div className="lp-header-left">
          <span className="lp-header-tag">Co-Map</span>
        </div>
        <nav className="lp-header-right">
          <button className="lp-nav-btn" onClick={() => onNavigate('map')}>Map</button>
          <button className="lp-nav-btn" onClick={() => onNavigate('login')}>Sign In</button>
        </nav>
      </header>

      {/* ── Main 50/50 ── */}
      <main className="lp-main">
        {/* Left: Typography Engine */}
        <section className="lp-left">
          <span className="lp-micro">[ SECTION 01 // COMMUNITY MAP ]</span>

          <h1 className="lp-headline">
            REPORT.<br />
            TRACK.<br />
            RESOLVE.
          </h1>

          <p className="lp-body">
            A community-powered platform to report local issues, track progress
            from city officials, and build better neighborhoods — one pin at a time.
          </p>

          <div className="lp-ctas">
            <button className="lp-cta lp-cta-solid" onClick={() => onNavigate('map')}>
              Explore the Map
            </button>
            <button className="lp-cta lp-cta-ghost" onClick={() => onNavigate('login')}>
              Create Account
            </button>
          </div>
        </section>

        {/* Right: Map preview screenshot */}
        <section className="lp-right">
          <MapPreview />
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <span className="lp-footer-left">&copy; 2026 Co-Map</span>
        <span className="lp-footer-right">System Status: Active</span>
      </footer>
    </div>
  );
}
