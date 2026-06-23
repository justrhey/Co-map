/**
 * AI Analysis Panel — shows data insights, trends, and recommendations.
 */
import { useState, useEffect } from 'react';
import { fetchAnalysis } from '../api';

const TYPE_STYLES = {
  alert: { icon: '🔴', color: '#ef4444' },
  trend: { icon: '📊', color: '#3b82f6' },
  success: { icon: '✅', color: '#22c55e' },
  tip: { icon: '💡', color: '#f59e0b' },
};

export default function AnalysisPanel({ open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setData(null); return; }
    setLoading(true);
    fetchAnalysis().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [open]);

  const gradeColor = (g) => {
    const colors = { A: '#22c55e', B: '#16a34a', C: '#eab308', D: '#f97316', F: '#ef4444' };
    return colors[g] || '#666';
  };

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet analysis-sheet" role="dialog" aria-label="AI Analysis">
        <div className="sheet-grip" />
        <div className="sheet-content">
          {loading ? (
            <div className="detail-loading"><span className="spinner" /> Analyzing data...</div>
          ) : data ? (
            <>
              <div className="sheet-heading">
                <h3>Data Analysis</h3>
              </div>

              {/* Summary stats */}
              <div className="analysis-summary">
                <div className="analysis-stat">
                  <span className="analysis-stat-val">{data.total_reports}</span>
                  <span className="analysis-stat-label">Reports</span>
                </div>
                <div className="analysis-stat">
                  <span className="analysis-stat-val">{data.daily_rate_last_week}</span>
                  <span className="analysis-stat-label">Day avg</span>
                </div>
                <div className="analysis-stat">
                  <span className="analysis-stat-val" style={{ color: data.resolution_rate > 50 ? '#22c55e' : '#eab308' }}>
                    {data.resolution_rate}%
                  </span>
                  <span className="analysis-stat-label">Resolved</span>
                </div>
                <div className="analysis-stat">
                  <span className="analysis-stat-val">{data.quality?.average_score || '--'}</span>
                  <span className="analysis-stat-label">Avg score</span>
                </div>
              </div>

              {/* Insights */}
              {data.insights?.length > 0 && (
                <div className="analysis-section">
                  <div className="analysis-section-title">Insights</div>
                  <div className="analysis-insights">
                    {data.insights.map((insight, i) => (
                      <div key={i} className={`analysis-insight type-${insight.type}`}>
                        <span className="analysis-insight-emoji">{insight.emoji}</span>
                        <div className="analysis-insight-body">
                          <span className="analysis-insight-title">{insight.title}</span>
                          <span className="analysis-insight-detail">{insight.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Category breakdown */}
              {data.trending_categories?.length > 0 && (
                <div className="analysis-section">
                  <div className="analysis-section-title">Categories</div>
                  <div className="analysis-cats">
                    {data.trending_categories.map((cat, i) => (
                      <div key={cat.category} className="analysis-cat-row">
                        <span className="analysis-cat-rank">{i + 1}</span>
                        <span className="analysis-cat-name">{cat.category.replace(/_/g, ' ')}</span>
                        <div className="analysis-cat-bar-bg">
                          <div className="analysis-cat-bar"
                            style={{ width: `${cat.pct}%` }} />
                        </div>
                        <span className="analysis-cat-pct">{cat.pct}%</span>
                        <span className="analysis-cat-count">{cat.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grade distribution */}
              {data.quality?.grade_distribution && Object.keys(data.quality.grade_distribution).length > 0 && (
                <div className="analysis-section">
                  <div className="analysis-section-title">Report Quality</div>
                  <div className="analysis-grades">
                    {['A', 'B', 'C', 'D', 'F'].map(g => {
                      const count = data.quality.grade_distribution[g];
                      return (
                        <div key={g} className="analysis-grade">
                          <span className="analysis-grade-letter" style={{ color: gradeColor(g) }}>{g}</span>
                          <div className="analysis-grade-bar-bg">
                            <div className="analysis-grade-bar"
                              style={{ width: `${count ? (count / data.total_reports) * 100 : 0}%`, background: gradeColor(g) }} />
                          </div>
                          <span className="analysis-grade-count">{count || 0}</span>
                        </div>
                      );
                    })}
                  </div>
                  {data.quality?.weak_areas && (
                    <div className="analysis-weak">
                      <span className="analysis-weak-label">Areas to improve:</span>
                      {Object.entries(data.quality.weak_areas)
                        .filter(([_, pct]) => pct > 30)
                        .sort(([_, a], [__, b]) => b - a)
                        .map(([area, pct]) => (
                          <span key={area} className="analysis-weak-chip">
                            {area} {pct}%
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Hotspots */}
              {data.hotspot_clusters?.length > 0 && (
                <div className="analysis-section">
                  <div className="analysis-section-title">Top Clusters</div>
                  <div className="analysis-clusters">
                    {data.hotspot_clusters.slice(0, 5).map((c, i) => (
                      <div key={i} className="analysis-cluster">
                        <span className="analysis-cluster-rank">{i + 1}</span>
                        <span className="analysis-cluster-coord">{c.lat.toFixed(3)}, {c.lng.toFixed(3)}</span>
                        <span className="analysis-cluster-count">{c.count} reports</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-close-bar">
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <div className="detail-loading">Could not load analysis.</div>
          )}
        </div>
      </div>
    </div>
  );
}
