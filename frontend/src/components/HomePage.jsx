import { useState } from 'react';

/* ── Architectural schematic: abstract geometric canvas ──────── */
function GeoSchematic() {
  return (
    <div className="geo-container">
      {/* L-bracket corners */}
      <div className="geo-bracket geo-bracket-tl" />
      <div className="geo-bracket geo-bracket-tr" />
      <div className="geo-bracket geo-bracket-bl" />
      <div className="geo-bracket geo-bracket-br" />

      <div className="geo-canvas">
        {/* Vertical spine */}
        <div className="geo-spine" />

        {/* Row 1 — two blocks */}
        <div className="geo-node" style={{ top: '12%', left: '10%', width: '30%', height: '18%' }}>
          <div className="geo-node-inner" />
        </div>
        <div className="geo-node" style={{ top: '12%', right: '10%', width: '22%', height: '18%' }}>
          <div className="geo-node-inner" />
        </div>

        {/* Connection: left block → right block (horizontal) */}
        <div className="geo-line-h" style={{ top: '21%', left: '10%', width: '80%' }} />

        {/* Vertical connector down */}
        <div className="geo-line-v" style={{ top: '21%', left: '50%', height: '10%' }} />

        {/* Row 2 — triple blocks */}
        <div className="geo-node" style={{ top: '34%', left: '8%', width: '18%', height: '14%' }}>
          <div className="geo-node-inner" />
        </div>
        <div className="geo-node" style={{ top: '34%', left: '38%', width: '24%', height: '14%' }}>
          <div className="geo-node-inner" />
        </div>
        <div className="geo-node" style={{ top: '32%', right: '8%', width: '20%', height: '18%' }}>
          <div className="geo-node-inner geo-node-inner-lg" />
        </div>

        {/* Row 2 horizontal connectors */}
        <div className="geo-line-h" style={{ top: '41%', left: '8%', width: '84%' }} />

        {/* Vertical down to row 3 */}
        <div className="geo-line-v" style={{ top: '41%', left: '38%', height: '10%' }} />
        <div className="geo-line-v" style={{ top: '41%', left: '68%', height: '10%' }} />

        {/* Row 3 — single wide block */}
        <div className="geo-node" style={{ bottom: '24%', left: '10%', width: '55%', height: '16%' }}>
          <div className="geo-node-inner" />
        </div>

        {/* Row 3 connector */}
        <div className="geo-line-h" style={{ bottom: '32%', left: '10%', width: '55%' }} />

        {/* Right column vertical */}
        <div className="geo-line-v" style={{ top: '50%', right: '18%', height: '18%' }} />

        {/* Top-right mini block */}
        <div className="geo-node" style={{ top: '55%', right: '10%', width: '12%', height: '10%' }}>
          <div className="geo-node-inner" />
        </div>

        {/* Baseline anchor */}
        <div className="geo-baseline" />
      </div>

      {/* Legend bar */}
      <div className="geo-legend">
        <div className="geo-legend-item">
          <span className="geo-legend-dot geo-legend-filled" />
          <span className="geo-legend-label">Primary Node</span>
        </div>
        <div className="geo-legend-item">
          <span className="geo-legend-dot" />
          <span className="geo-legend-label">Secondary Node</span>
        </div>
        <div className="geo-legend-item">
          <div className="geo-legend-line" />
          <span className="geo-legend-label">Data Link</span>
        </div>
      </div>

      {/* Status indicator */}
      <div className="geo-status">
        <span className="geo-status-dot" />
        <span className="geo-status-text">System Active</span>
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

        {/* Right: Geometric Layout Canvas */}
        <section className="lp-right">
          <GeoSchematic />
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
