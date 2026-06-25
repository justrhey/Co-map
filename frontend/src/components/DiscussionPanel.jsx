import CommentThread from './CommentThread';

export default function DiscussionPanel({ open, complaintId, title, onClose }) {
  return (
    <div className={`discussion-panel${open ? ' open' : ''}`} role="dialog" aria-label="Discussion">
      <div className="discussion-panel-header">
        <button className="discussion-panel-back" onClick={onClose} aria-label="Back to report">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div className="discussion-panel-title">
          <span className="discussion-panel-kicker">Discussion</span>
          <span className="discussion-panel-sub">{title}</span>
        </div>
      </div>
      {open && <CommentThread complaintId={complaintId} enabled fullHeight />}
    </div>
  );
}
