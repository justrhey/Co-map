import { useState, useEffect } from 'react';
import { fetchAdminSummary, updateComplaintStatus } from '../api';
export default function AdminSheet({ open, onClose, onStatusChange, setToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    if (!open) { setData(null); return; }
    setLoading(true);
    fetchAdminSummary().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [open]);

  const handleStatus = async (id, newStatus) => {
    setUpdating(id);
    try {
      await updateComplaintStatus(id, { status: newStatus });
      const updated = await fetchAdminSummary();
      setData(updated);
      onStatusChange?.();
    } catch (err) {
      if (setToast) setToast({ message: 'Failed to update status: ' + err.message, type: 'error' });
    } finally {
      setUpdating(null);
    }
  };

  const filtered = data?.recent?.filter(c =>
    statusFilter === 'all' || c.status === statusFilter
  ) || [];

  const totalByStatus = data?.by_status || {};

  return (
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet admin-sheet" role="dialog" aria-label="Admin panel">
        <div className="sheet-grip" />
        <div className="sheet-content">
          {loading ? (
            <div className="detail-loading"><span className="spinner" /> Loading...</div>
          ) : data ? (
            <>
              <div className="sheet-heading">
                <h3>Admin Panel</h3>
              </div>

              {/* Stats Cards */}
              <div className="admin-stats">
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{data.total}</span>
                  <span className="admin-stat-label">Total Reports</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-val">{data.total_users}</span>
                  <span className="admin-stat-label">Users</span>
                </div>
                <div className="admin-stat-card pending">
                  <span className="admin-stat-val">{totalByStatus.pending || 0}</span>
                  <span className="admin-stat-label">Pending</span>
                </div>
                <div className="admin-stat-card resolved">
                  <span className="admin-stat-val">{totalByStatus.resolved || 0}</span>
                  <span className="admin-stat-label">Resolved</span>
                </div>
              </div>

              {/* Status Tabs */}
              <div className="admin-tabs">
                {['all', 'pending', 'approved', 'hidden', 'resolved'].map(s => (
                  <button key={s}
                    className={`admin-tab${statusFilter === s ? ' active' : ''}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {/* Complaints List */}
              <div className="admin-list">
                {filtered.length === 0 ? (
                  <p className="admin-empty">No complaints match this filter.</p>
                ) : (
                  filtered.map(c => (
                    <div key={c.id} className="admin-item">
                      <div className="admin-item-header">
                        <span className={`detail-badge ${c.status}`}>{c.status_display}</span>
                        <span className="admin-item-id">#{c.id}</span>
                        <span className="admin-item-cat">{c.category_display}</span>
                      </div>
                      <div className="admin-item-body">
                        <p className="admin-item-desc">{c.description?.slice(0, 120) || 'No description'}</p>
                        <div className="admin-item-meta">
                          <span>{c.user?.name || c.user?.email || 'Anonymous'}</span>
                          <span>{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="admin-item-actions">
                        {c.status === 'pending' && (
                          <>
                            <button className="admin-action approve"
                              onClick={() => handleStatus(c.id, 'approved')}
                              disabled={updating === c.id}
                            >Approve</button>
                            <button className="admin-action reject"
                              onClick={() => handleStatus(c.id, 'hidden')}
                              disabled={updating === c.id}
                            >Reject</button>
                          </>
                        )}
                        {c.status === 'approved' && (
                          <button className="admin-action resolve"
                            onClick={() => handleStatus(c.id, 'resolved')}
                            disabled={updating === c.id}
                          >Resolve</button>
                        )}
                        {updating === c.id && <span className="spinner" />}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="detail-close-bar">
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <div className="detail-loading">Could not load admin data.</div>
          )}
        </div>
      </div>
    </div>
  );
}
