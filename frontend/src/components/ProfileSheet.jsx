import { useState, useEffect } from 'react';
import {
  fetchUserProfile, updateComplaint, deleteComplaint,
  updateAccountName, changePassword, deleteAccount,
} from '../api';
import { BADGE_ICONS } from '../utils/badges';
import { getCategoryIcon } from './Icons';
import ConfirmDialog from './ConfirmDialog';

const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', resolved: 'Resolved' };
const STATUS_ORDER = ['pending', 'approved', 'resolved'];

export default function ProfileSheet({ open, onClose, user, onUserUpdate, onReportsChanged, onAccountDeleted, setToast }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('overview');     // overview | reports | settings
  const [reports, setReports] = useState([]);      // local mirror so edits/deletes reflect instantly
  const [busyId, setBusyId] = useState(null);      // report id mid-action
  const [confirm, setConfirm] = useState(null);    // { kind, id } for destructive actions
  const [editing, setEditing] = useState(null);    // report being edited (inline form)

  // Settings form state
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (!open) { setProfile(null); setTab('overview'); setEditing(null); setConfirm(null); return; }
    setLoading(true);
    fetchUserProfile()
      .then((data) => { setProfile(data); setReports(data?.reports || []); })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
    setName(user?.name || '');
  }, [open, user]);

  const toast = (message, type = 'success') => setToast?.({ message, type });

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

  // ── Report actions ──
  const cycleStatus = async (r) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(r.status) + 1) % STATUS_ORDER.length];
    setBusyId(r.id);
    try {
      await updateComplaint(r.id, { status: next });
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
      toast(`Marked “${r.category_display}” as ${STATUS_LABELS[next]}`);
      onReportsChanged?.();
    } catch (e) {
      toast(e.message || 'Could not update status', 'error');
    } finally { setBusyId(null); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const updated = await updateComplaint(editing.id, {
        description: editing.description,
        impact: editing.impact,
        action_requested: editing.action_requested,
      });
      setReports((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...updated } : x)));
      setEditing(null);
      toast('Report updated');
      onReportsChanged?.();
    } catch (e) {
      toast(e.message || 'Could not save changes', 'error');
    } finally { setBusyId(null); }
  };

  const doDelete = async (id) => {
    setBusyId(id);
    try {
      await deleteComplaint(id);
      setReports((prev) => prev.filter((x) => x.id !== id));
      setConfirm(null);
      toast('Report deleted');
      onReportsChanged?.();
    } catch (e) {
      toast(e.message || 'Could not delete report', 'error');
    } finally { setBusyId(null); }
  };

  // ── Account actions ──
  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast('Name cannot be empty', 'error'); return; }
    setSavingName(true);
    try {
      const res = await updateAccountName(trimmed);
      onUserUpdate?.({ name: res.name });
      toast('Name updated');
    } catch (e) {
      toast(e.message || 'Could not update name', 'error');
    } finally { setSavingName(false); }
  };

  const savePassword = async () => {
    if (pw.next.length < 8) { toast('New password must be at least 8 characters', 'error'); return; }
    setSavingPw(true);
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '' });
      toast('Password changed');
    } catch (e) {
      toast(e.message || 'Could not change password', 'error');
    } finally { setSavingPw(false); }
  };

  const doDeleteAccount = async () => {
    try {
      await deleteAccount();
      setConfirm(null);
      toast('Your account has been deleted');
      onAccountDeleted?.();
    } catch (e) {
      toast(e.message || 'Could not delete account', 'error');
    }
  };

  const displayName = user?.name || profile?.name || 'You';
  const initial = displayName.charAt(0).toUpperCase();

  const NAV = [
    { id: 'overview', label: 'Overview', icon: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
    { id: 'reports', label: 'My Reports', count: reports.length, icon: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
    { id: 'settings', label: 'Settings', icon: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  ];

  const titleFor = { overview: 'Overview', reports: 'My Reports', settings: 'Settings' };

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet profile-sheet" role="dialog" aria-label="Your profile">
        <div className="sheet-grip" />
        <button className="profile-close-x" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        {loading ? (
          <div className="detail-loading"><span className="spinner" /> Loading...</div>
        ) : profile ? (
          <div className="profile-shell">
            {/* ── Identity rail ── */}
            <aside className="profile-rail">
              <div className="profile-id">
                <div className="profile-avatar">{initial}</div>
                <span className="profile-id-name">{displayName}</span>
                {user?.email && <span className="profile-id-email">{user.email}</span>}
                <span className="profile-id-level">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg>
                  Level {profile.level?.level || 1}
                </span>
              </div>

              <nav className="profile-nav">
                {NAV.map((n) => (
                  <button key={n.id} className={`profile-nav-btn${tab === n.id ? ' active' : ''}`} onClick={() => setTab(n.id)}>
                    {n.icon}
                    <span className="profile-nav-label">{n.label}</span>
                    {n.count != null && n.count > 0 && <span className="profile-nav-count">{n.count}</span>}
                  </button>
                ))}
              </nav>

              <div className="profile-rail-foot">
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
              </div>
            </aside>

            {/* ── Content ── */}
            <div className="profile-main">
              <h3 className="profile-main-title">{titleFor[tab]}</h3>

              {/* ─────────── OVERVIEW ─────────── */}
              {tab === 'overview' && (
                <>
                  <div className="profile-level-card">
                    <div className="profile-level-badge">
                      <span className="profile-level-num">{profile.level?.level || 1}</span>
                    </div>
                    <div className="profile-level-body">
                      <span className="profile-level-title">Level {profile.level?.level || 1}</span>
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
                        <span className="profile-stat-val">{reports.length}</span>
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
                        {profile.badges.map((b) => (
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
                </>
              )}

              {/* ─────────── REPORTS (manage) ─────────── */}
              {tab === 'reports' && (
                <div className="profile-section">
                  <div className="profile-section-title">Manage Your Reports</div>
                  {reports.length === 0 ? (
                    <p className="profile-empty">No reports yet. Tap the pin to submit your first.</p>
                  ) : (
                    <div className="profile-reports">
                      {reports.map((r) => (
                        <div key={r.id} className="pm-report">
                          <div className="pm-report-head">
                            <div className="profile-report-icon">{getCategoryIcon(r.category, 18)}</div>
                            <div className="profile-report-body">
                              <span className="profile-report-label">{r.category_display}</span>
                              <span className="profile-report-date">
                                {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                            <div className="profile-report-grade" style={{ color: gradeColor(r.score?.letter_grade) }}>
                              {r.score?.letter_grade || '--'}
                            </div>
                          </div>

                          {editing?.id === r.id ? (
                            <div className="pm-edit">
                              <label className="pm-edit-label">Situation</label>
                              <textarea className="pm-edit-input" rows={2} maxLength={500} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                              <div className="pm-edit-count"><span className={`char-count${(editing.description || '').length >= 500 ? ' at-limit' : ''}`}>{(editing.description || '').length}/500</span></div>
                              <label className="pm-edit-label">Impact</label>
                              <textarea className="pm-edit-input" rows={2} maxLength={300} value={editing.impact || ''} onChange={(e) => setEditing({ ...editing, impact: e.target.value })} />
                              <div className="pm-edit-count"><span className={`char-count${(editing.impact || '').length >= 300 ? ' at-limit' : ''}`}>{(editing.impact || '').length}/300</span></div>
                              <label className="pm-edit-label">Action requested</label>
                              <textarea className="pm-edit-input" rows={2} maxLength={300} value={editing.action_requested || ''} onChange={(e) => setEditing({ ...editing, action_requested: e.target.value })} />
                              <div className="pm-edit-count"><span className={`char-count${(editing.action_requested || '').length >= 300 ? ' at-limit' : ''}`}>{(editing.action_requested || '').length}/300</span></div>
                              <div className="pm-edit-actions">
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)} disabled={busyId === r.id}>Cancel</button>
                                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={busyId === r.id}>
                                  {busyId === r.id ? <span className="spinner" /> : 'Save'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="pm-actions">
                              <button
                                className={`pm-status-pill ${r.status}`}
                                onClick={() => cycleStatus(r)}
                                disabled={busyId === r.id}
                                title="Tap to change status"
                              >
                                <span className="pm-status-dot" />
                                {STATUS_LABELS[r.status]}
                              </button>
                              <button className="pm-action-btn" onClick={() => setEditing({ id: r.id, description: r.description, impact: r.impact, action_requested: r.action_requested })} disabled={busyId === r.id}>
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Edit
                              </button>
                              <button className="pm-action-btn danger" onClick={() => setConfirm({ kind: 'report', id: r.id })} disabled={busyId === r.id}>
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─────────── SETTINGS ─────────── */}
              {tab === 'settings' && (
                <>
                  <div className="profile-section">
                    <div className="profile-section-title">Display Name</div>
                    <div className="pm-field-row">
                      <input className="pm-edit-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                      <button className="btn btn-primary btn-sm" onClick={saveName} disabled={savingName || name.trim() === (user?.name || '')}>
                        {savingName ? <span className="spinner" /> : 'Save'}
                      </button>
                    </div>
                    <div className="pm-edit-count"><span className={`char-count${name.length >= 60 ? ' at-limit' : ''}`}>{name.length}/60</span></div>
                  </div>

                  <div className="profile-section">
                    <div className="profile-section-title">Change Password</div>
                    <input className="pm-edit-input pm-mb" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Current password" />
                    <input className="pm-edit-input pm-mb" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="New password (min 8 chars)" />
                    <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={savePassword} disabled={savingPw || !pw.next}>
                      {savingPw ? <span className="spinner" /> : 'Update Password'}
                    </button>
                  </div>

                  <div className="profile-section pm-danger-zone">
                    <div className="profile-section-title danger">Danger Zone</div>
                    <p className="pm-danger-note">Deleting your account permanently removes your profile and all of your reports. This cannot be undone.</p>
                    <button className="btn btn-danger btn-sm" style={{ width: '100%' }} onClick={() => setConfirm({ kind: 'account' })}>
                      Delete My Account
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="detail-loading">Could not load profile.</div>
        )}
      </div>

      <ConfirmDialog
        open={confirm?.kind === 'report'}
        title="Delete this report?"
        message="This permanently removes the report and its photo. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Keep it"
        danger
        onConfirm={() => doDelete(confirm.id)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'account'}
        title="Delete your account?"
        message="Your profile and every report you've filed will be permanently deleted. This cannot be undone."
        confirmLabel="Delete account"
        cancelLabel="Cancel"
        danger
        onConfirm={doDeleteAccount}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
