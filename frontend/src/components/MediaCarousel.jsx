import { useState, useRef } from 'react';

const CAT_GRADIENTS = {
  noise: 'linear-gradient(135deg,#1e293b,#334155)',
  air: 'linear-gradient(135deg,#1a1a2e,#16213e)',
  water: 'linear-gradient(135deg,#0f2027,#203a43)',
  light: 'linear-gradient(135deg,#3b1a1a,#4a2020)',
  streetlight: 'linear-gradient(135deg,#3b1a1a,#4a2020)',
  animal: 'linear-gradient(135deg,#1a2e1a,#203a20)',
  trash: 'linear-gradient(135deg,#2d1f1f,#3d2a2a)',
  illegal_dumping: 'linear-gradient(135deg,#2d1f1f,#3d2a2a)',
  traffic: 'linear-gradient(135deg,#1e1e2a,#2a2a3a)',
  potholes: 'linear-gradient(135deg,#2a2416,#3a3320)',
  graffiti: 'linear-gradient(135deg,#2a162a,#3a2040)',
  other: 'linear-gradient(135deg,#1a1d23,#262b33)',
};

export default function MediaCarousel({ photo, media, onImageClick, category }) {
  const items = [
    ...(photo ? [{ type: 'image', url: photo }] : []),
    ...((media || []).map(m => ({ type: m.media_type || 'image', url: m.file, id: m.id }))),
  ];
  const [i, setI] = useState(0);
  const [imgFailed, setImgFailed] = useState({});
  const touchX = useRef(null);
  const cat = category || 'other';

  if (!items.length) return null;
  const n = items.length;
  const idx = Math.min(i, n - 1);
  const cur = items[idx];
  const go = (d) => setI((p) => (((p + d) % n) + n) % n);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return (
    <div className="detail-carousel">
      <div
        className="detail-carousel-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => {
          if (cur.type === 'image' && onImageClick) {
            e.stopPropagation();
            onImageClick(cur.url);
          } else if (cur.type !== 'image' && cur.url) {
            window.open(cur.url, '_blank');
          }
        }}
      >
        {cur.type === 'video' ? (
          <video src={cur.url} className="detail-carousel-media" controls onClick={(e) => e.stopPropagation()} />
        ) : cur.type === 'audio' ? (
          <div className="detail-carousel-audio" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <audio src={cur.url} controls />
          </div>
        ) : imgFailed[idx] ? (
          <div className="detail-carousel-fallback" style={{ background: CAT_GRADIENTS[cat] || CAT_GRADIENTS.other }}>
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span className="detail-carousel-fallback-text">No photo available</span>
          </div>
        ) : (
          <img
            src={cur.url}
            alt={`Media ${idx + 1}`}
            className="detail-carousel-media"
            onError={() => setImgFailed(p => ({ ...p, [idx]: true }))}
            onLoad={(e) => {
              const w = e.target.naturalWidth, h = e.target.naturalHeight;
              if (w <= 2 && h <= 2) setImgFailed(p => ({ ...p, [idx]: true }));
            }}
          />
        )}

        {n > 1 && (
          <>
            <button className="carousel-arrow prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button className="carousel-arrow next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <span className="carousel-count">{idx + 1} / {n}</span>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="carousel-dots">
          {items.map((_, k) => (
            <button
              key={k}
              className={`carousel-dot${k === idx ? ' active' : ''}`}
              onClick={() => setI(k)}
              aria-label={`Go to media ${k + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
