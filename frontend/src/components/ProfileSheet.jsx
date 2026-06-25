import { useState, useEffect } from 'react';
import { fetchUserProfile } from '../api';
import { BADGE_ICONS } from '../utils/badges';
import { getCategoryIcon } from './Icons';
export default function ProfileSheet({ open, onClose }) {
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
