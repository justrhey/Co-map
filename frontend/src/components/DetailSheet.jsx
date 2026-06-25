import { useState, useEffect } from 'react';
import { fetchComplaint } from '../api';
import { useAddress } from '../hooks/useAddress';
import { scoreColor } from '../utils/score';
import ScoreCircle from './ScoreCircle';
import { getCategoryIcon, IconClock } from './Icons';
import MediaCarousel from './MediaCarousel';
import ImageLightbox from './ImageLightbox';
import CommentThread from './CommentThread';

const Chevron = ({ open }) => (
  <svg className={`dp-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default function DetailSheet({ open, complaintId, onClose }) {
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  // Which panels are folded open. All open by default.
  const [folded, setFolded] = useState({ stats: true, main: true, comments: true });
  const toggle = (k) => setFolded((p) => ({ ...p, [k]: !p[k] }));
  const latlng = complaint ? { lat: complaint.latitude, lng: complaint.longitude } : null;
  const { address, loading: addrLoading } = useAddress(latlng);

  useEffect(() => {
    if (!open || !complaintId) { setComplaint(null); return; }
    setLoading(true);
    fetchComplaint(complaintId)
      .then(setComplaint)
      .catch(() => setComplaint(null))
      .finally(() => setLoading(false));
  }, [open, complaintId]);

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet detail-sheet" role="dialog" aria-label="Report details">
        {/* Full-screen modal header with single close button */}
        <div className="dp-modal-bar">
          <span className="dp-modal-title">Report Details</span>
          <button className="dp-modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="sheet-content">
          {loading ? (
            <div className="detail-loading"><span className="spinner" /> Loading...</div>
          ) : complaint ? (
            <div className="dp-columns">
              {/* ── Panel 1: Score & Stats ── */}
              <div className={`dp-card${folded.stats ? '' : ' collapsed'}`}>
                <button className="dp-card-head" onClick={() => toggle('stats')}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  <span>Overall Stats</span>
                  <Chevron open={folded.stats} />
                </button>
                {folded.stats && (
                  <div className="dp-card-body">
                    {complaint.score ? (
                      <>
                        <div className="dp-score-row">
                          <ScoreCircle score={complaint.score} />
                          <div className="dp-score-info">
                            <span className="dp-score-grade">{complaint.score.letter_grade || '--'}</span>
                            <span className="dp-score-total">
                              {complaint.score.total != null ? `${complaint.score.total}/100` : 'Not scored'}
                            </span>
                          </div>
                        </div>
                        <div className="dp-bars">
                          {[
                            { key: 'specificity', label: 'Structure', val: complaint.score.specificity, max: 25 },
                            { key: 'context', label: 'Detail', val: complaint.score.context, max: 30 },
                            { key: 'clarity', label: 'Coherence', val: complaint.score.clarity, max: 20 },
                            { key: 'completeness', label: 'Completeness', val: complaint.score.completeness, max: 15 },
                            { key: 'actionability', label: 'Actionability', val: complaint.score.actionability, max: 10 },
                          ].map(({ key, label, val, max }) => {
                            const pct = Math.round((val / max) * 100);
                            return (
                              <div key={key} className="dp-bar-row">
                                <span className="dp-bar-label">{label}</span>
                                <div className="dp-bar-track">
                                  <div className="dp-bar-fill" style={{ width: `${pct}%`, background: scoreColor(pct) }} />
                                </div>
                                <span className="dp-bar-val" style={{ color: scoreColor(pct) }}>{val}/{max}</span>
                              </div>
                            );
                          })}
                          {complaint.score.description_detail && (
                            <p className="dp-bar-note">{complaint.score.description_detail}</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="dp-empty">Not yet scored</p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Panel 2: Main Report ── */}
              <div className={`dp-card${folded.main ? '' : ' collapsed'}`}>
                <button className="dp-card-head" onClick={() => toggle('main')}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  <span>View Report</span>
                  <Chevron open={folded.main} />
                </button>
                {folded.main && (
                  <div className="dp-card-body">
                    <div className="dp-header-row">
                      {getCategoryIcon(complaint.category, 28)}
                      <span className={`detail-badge ${complaint.status}`}>{complaint.status_display}</span>
                    </div>

                    <div className="dp-address">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span>{addrLoading ? 'Locating…' : address}</span>
                    </div>

                    {complaint.status && (
                      <div className="dp-timeline">
                        <div className={`dp-tl ${complaint.status === 'pending' ? 'active' : 'done'}`}>
                          <div className="dp-tl-dot" />
                          <div className="dp-tl-text">
                            <span className="dp-tl-label">Reported</span>
                            <span className="dp-tl-date">{new Date(complaint.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                        <div className={`dp-tl ${complaint.status === 'approved' || complaint.status === 'resolved' ? 'done' : ''}`}>
                          <div className="dp-tl-dot" />
                          <div className="dp-tl-text">
                            <span className="dp-tl-label">Acknowledged</span>
                            <span className="dp-tl-date">{complaint.acknowledged_at ? new Date(complaint.acknowledged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                          </div>
                        </div>
                        <div className={`dp-tl ${complaint.status === 'resolved' ? 'done' : ''}`}>
                          <div className="dp-tl-dot" />
                          <div className="dp-tl-text">
                            <span className="dp-tl-label">Resolved</span>
                            <span className="dp-tl-date">{complaint.resolved_at ? new Date(complaint.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <h3 className="dp-title">{complaint.category_display}</h3>
                    <p className="dp-time">
                      <IconClock width={13} height={13} />{' '}
                      {new Date(complaint.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>

                    <MediaCarousel photo={complaint.photo} media={complaint.media} onImageClick={setLightboxUrl} category={complaint.category} />

                    <div className="dp-fields">
                      <div className="dp-field">
                        <span className="dp-field-label">Situation</span>
                        <p className="dp-field-text">{complaint.description || 'No description provided.'}</p>
                      </div>
                      {complaint.impact && (
                        <div className="dp-field">
                          <span className="dp-field-label">Impact</span>
                          <p className="dp-field-text">{complaint.impact}</p>
                        </div>
                      )}
                      {complaint.action_requested && (
                        <div className="dp-field">
                          <span className="dp-field-label">Action Requested</span>
                          <p className="dp-field-text">{complaint.action_requested}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Panel 3: Comments ── */}
              <div className={`dp-card${folded.comments ? '' : ' collapsed'}`}>
                <button className="dp-card-head" onClick={() => toggle('comments')}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span>Discussions{complaint.comment_count ? ` · ${complaint.comment_count}` : ''}</span>
                  <Chevron open={folded.comments} />
                </button>
                {folded.comments && (
                  <div className="dp-card-body">
                    <CommentThread complaintId={complaint.id} enabled />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="detail-loading">Could not load details.</div>
          )}
        </div>
      </div>
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
