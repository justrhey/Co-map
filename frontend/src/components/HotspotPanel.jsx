import { useState } from 'react';
import { CAT_COLORS } from '../App';  // exported from slim App.jsx
export default function HotspotPanel({ analytics, healthScore, openCount, resolvedCount }) {
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
