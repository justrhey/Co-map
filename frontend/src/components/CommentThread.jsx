import { useState, useEffect, useRef } from 'react';
import { fetchCachedComments, postComment, isLoggedIn } from '../api';
import { timeAgo } from '../utils/time';

const COMMENT_MAX = 250;  // keep in sync with backend MAX_COMMENT_LEN

// Pulsing placeholder that mirrors a real comment's shape so the layout
// doesn't jump when the data arrives.
function CommentSkeleton({ rows = 3 }) {
  return (
    <div className="comment-skeleton" aria-hidden="true" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="cskel-row" key={i} style={{ animationDelay: `${i * 0.12}s` }}>
          <div className="cskel-avatar" />
          <div className="cskel-lines">
            <div className="cskel-line cskel-line-name" />
            <div className="cskel-line cskel-line-body" />
            {i % 2 === 0 && <div className="cskel-line cskel-line-short" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentItem({ c, isReply, onReply }) {
  return (
    <div className={`comment${isReply ? ' comment-reply' : ''}${c.is_reporter ? ' is-reporter' : ''}`}>
      <div className="comment-meta">
        <span className="comment-author">{c.user?.name || 'Neighbor'}</span>
        {c.is_reporter && <span className="comment-badge">Reporter</span>}
        <span className="comment-time">{timeAgo(c.created_at)}</span>
      </div>
      <p className="comment-body">{c.body}</p>
      {!isReply && isLoggedIn() && (
        <button className="comment-reply-btn" onClick={() => onReply(c)}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          Reply
        </button>
      )}
    </div>
  );
}

export default function CommentThread({ complaintId, enabled, fullHeight = false }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCachedComments(complaintId)
      .then(({ data }) => { if (active) setComments(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setComments([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [complaintId]);

  const startReply = (c) => { setReplyTo(c); inputRef.current?.focus(); };

  const submit = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || posting) return;
    if (!isLoggedIn()) { setError('Sign in to join the discussion.'); return; }
    setPosting(true);
    setError('');
    try {
      const created = await postComment(complaintId, text, replyTo?.id || null);
      if (replyTo) {
        setComments(prev => prev.map(p =>
          p.id === replyTo.id ? { ...p, replies: [...(p.replies || []), created] } : p));
      } else {
        setComments(prev => [...prev, created]);
      }
      setBody('');
      setReplyTo(null);
    } catch (err) {
      setError(err.message || 'Could not post comment.');
    } finally {
      setPosting(false);
    }
  };

  if (!enabled) return null;

  const totalCount = comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  return (
    <div className={`discussion${fullHeight ? ' discussion-full' : ''}`}>
      {!fullHeight && (
        <div className="discussion-head">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Discussion{totalCount ? ` · ${totalCount}` : ''}</span>
        </div>
      )}

      <div className="discussion-list">
        {loading ? (
          <CommentSkeleton rows={3} />
        ) : comments.length === 0 ? (
          <div className="discussion-empty">No comments yet. Be the first to add context.</div>
        ) : comments.map(c => (
          <div className="comment-group" key={c.id}>
            <CommentItem c={c} onReply={startReply} />
            {c.replies?.length > 0 && (
              <div className="comment-replies">
                {c.replies.map(r => <CommentItem key={r.id} c={r} isReply onReply={startReply} />)}
              </div>
            )}
          </div>
        ))}
      </div>

      {isLoggedIn() ? (
        <form className="comment-form-wrap" onSubmit={submit}>
          {replyTo && (
            <div className="reply-indicator">
              <span>Replying to <strong>{replyTo.user?.name || 'Neighbor'}</strong></span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}
          <div className="comment-form">
            <input
              ref={inputRef}
              type="text"
              className="comment-input"
              placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
              value={body}
              maxLength={COMMENT_MAX}
              onChange={(e) => setBody(e.target.value)}
            />
            <button type="submit" className="comment-send" disabled={posting || !body.trim()} aria-label="Send">
              {posting ? <span className="spinner" /> : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              )}
            </button>
          </div>
          <div className="comment-count-row">
            <span className={`char-count${body.length >= COMMENT_MAX ? ' at-limit' : ''}`}>{body.length}/{COMMENT_MAX}</span>
          </div>
        </form>
      ) : (
        <div className="discussion-empty">Sign in to join the discussion.</div>
      )}
      {error && <p className="comment-error">{error}</p>}
    </div>
  );
}
