import { useState, useEffect } from 'react';
import { createComplaint } from '../api';
import { CATEGORIES } from './Icons';
export default function SubmitSheet({ open, latlng, onClose, onSubmit, onLoginRequired, setToast }) {
  const [category, setCategory] = useState('potholes');
  const [situation, setSituation] = useState('');
  const [impact, setImpact] = useState('');
  const [actionRequested, setActionRequested] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [additionalMedia, setAdditionalMedia] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [discussionEnabled, setDiscussionEnabled] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.items?.length > 0) setDragOver(true);
  };

  const handleDragOut = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (open) {
      setCategory('potholes'); setSituation(''); setImpact('');
      setActionRequested(''); setCustomTitle('');
      setPhoto(null); setPhotoPreview(null); setAdditionalMedia([]);
      setSubmitError(''); setDiscussionEnabled(true);
    }
  }, [open]);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleAdditionalMedia = (e) => {
    const files = Array.from(e.target.files || []);
    setAdditionalMedia(prev => [...prev, ...files]);
  };

  const removeMedia = (index) => {
    setAdditionalMedia(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + 'KB';
    return (bytes/(1024*1024)).toFixed(1) + 'MB';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!latlng) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      const payload = {
        latitude: latlng.lat,
        longitude: latlng.lng,
        category,
        description: situation.trim(),
        impact: impact.trim(),
        action_requested: actionRequested.trim(),
        custom_category: category === 'other' ? customTitle.trim() : '',
        photo,
        discussion_enabled: discussionEnabled,
      };
      if (additionalMedia.length > 0) {
        payload.additional_media = additionalMedia;
      }
      await createComplaint(payload);
      onSubmit();
      onClose();
    } catch (err) {
      if (err.kind === 'auth') {
        if (onLoginRequired) onLoginRequired();
        else onClose();
      } else {
        setSubmitError(err.message);
        if (setToast) setToast({ message: err.message, type: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = submitting ||
    !situation.trim() ||
    !photo ||
    (category === 'other' && !customTitle.trim());

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet submit-sheet" role="dialog" aria-label="New report">
        <div className="submit-sheet-header">
          <h3>New Report</h3>
          <div className="submit-sheet-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </div>
        </div>
        <div className="sheet-content">
          <form onSubmit={handleSubmit}>
            <div className="submit-form-body">
            <div className="field-group">
              <label>Category</label>
              <div className="cat-pills">
                {CATEGORIES.map(({ value, label }) => (
                  <button
                    type="button"
                    key={value}
                    className={`cat-pill${category === value ? ' active' : ''}`}
                    onClick={() => setCategory(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {category === 'other' && (
              <div className="field-group">
                <label htmlFor="custom-title">Custom Title</label>
                <input
                  id="custom-title"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Fallen tree, obstructed drain..."
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              </div>
            )}

            <div className="field-group">
              <label>Photo <span className="field-req">*</span></label>
              {photoPreview ? (
                <div className="photo-preview-wrap">
                  <img src={photoPreview} alt="Preview" className="photo-preview" />
                  <button type="button" className="photo-remove" onClick={() => { setPhoto(null); setPhotoPreview(null); }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                  <span className="photo-change-hint" onClick={() => document.getElementById('photo-input')?.click()}>Tap to change</span>
                </div>
              ) : (
                <div
                  className={`drop-zone${dragOver ? ' drop-zone-active' : ''}`}
                  onDragEnter={handleDragIn}
                  onDragLeave={handleDragOut}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('photo-input')?.click()}
                >
                  <div className="drop-zone-icon">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <span className="drop-zone-text">
                    {dragOver ? 'Drop your photo here' : 'Drag & drop your photo here'}
                  </span>
                  <span className="drop-zone-hint">or tap to browse files</span>
                </div>
              )}
              <input id="photo-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            </div>

            <div className="field-group">
              <label>Additional Media <span className="field-opt">(optional)</span></label>
              <div className="media-grid-upload">
                <div className="media-grid-items">
                  {additionalMedia.map((file, i) => (
                    <div key={i} className="media-grid-item">
                      {file.type?.startsWith('video/') ? (
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      ) : file.type?.startsWith('audio/') ? (
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      )}
                      <span className="media-item-name">{file.name.length > 15 ? file.name.slice(0, 12)+'...' : file.name}</span>
                      <span className="media-item-size">{formatFileSize(file.size)}</span>
                      <button type="button" className="media-item-remove" onClick={() => removeMedia(i)}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                  <label className="media-add-btn">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    <input type="file" accept="image/*,video/*,audio/*" multiple style={{ display: 'none' }} onChange={handleAdditionalMedia} />
                  </label>
                </div>
              </div>
            </div>

            <div className="template-fields">
              <div className="field-group">
                <label htmlFor="situation">Situation <span className="field-req">*</span></label>
                <textarea id="situation" rows={2} placeholder="What happened? Include street names or landmarks." maxLength={500} value={situation} onChange={(e) => setSituation(e.target.value)} />
                <div className="textarea-meta">
                  <span className="field-hint">What did you see or experience?</span>
                  <span className="char-count">{situation.length}/500</span>
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="impact">Impact <span className="field-opt">(optional)</span></label>
                <textarea id="impact" rows={1} placeholder="How does this affect you or the community?" maxLength={300} value={impact} onChange={(e) => setImpact(e.target.value)} />
              </div>

              <div className="field-group">
                <label htmlFor="action">Action Requested <span className="field-opt">(optional)</span></label>
                <textarea id="action" rows={1} placeholder="What should be done?" maxLength={300} value={actionRequested} onChange={(e) => setActionRequested(e.target.value)} />
              </div>
            </div>

            <label className="discussion-toggle">
              <input type="checkbox" checked={discussionEnabled} onChange={(e) => setDiscussionEnabled(e.target.checked)} />
              <span className="discussion-toggle-box" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span className="discussion-toggle-text">
                <span className="discussion-toggle-title">Allow neighbors to discuss</span>
                <span className="discussion-toggle-sub">Let others comment and confirm they're affected too</span>
              </span>
            </label>

            {submitError && (
              <div className="form-error" role="alert">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{submitError}</span>
              </div>
            )}
            </div>{/* /submit-form-body */}
            <div className="sheet-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={canSubmit}>
                {submitting ? <><span className="spinner" /> Submitting...</> : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
