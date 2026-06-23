const API = window.location.origin + '/api';

// ── Auth token management ──────────────────────────────────────
let _token = localStorage.getItem('cw_token');

function authHeaders() {
  const h = {};
  if (_token) h['Authorization'] = `Token ${_token}`;
  return h;
}

export function setToken(token) {
  _token = token;
  if (token) localStorage.setItem('cw_token', token);
  else localStorage.removeItem('cw_token');
}

export function getToken() { return _token; }
export function isLoggedIn() { return !!_token; }

// ── Auth API ───────────────────────────────────────────────────
export async function register(email, password, name) {
  const res = await fetch(`${API}/auth/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  setToken(data.token);
  return data;
}

export async function login(email, password) {
  const res = await fetch(`${API}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  setToken(data.token);
  return data;
}

export async function logout() {
  if (_token) {
    await fetch(`${API}/auth/logout/`, {
      method: 'POST',
      headers: authHeaders(),
    }).catch(() => {});
  }
  setToken(null);
}

export async function fetchMe() {
  if (!_token) return null;
  const res = await fetch(`${API}/auth/me/`, { headers: authHeaders() });
  if (!res.ok) { setToken(null); return null; }
  return res.json();
}

// ── Complaints ─────────────────────────────────────────────────
export async function fetchComplaints(params = {}) {
  const qs = new URLSearchParams({ page: '1', ...params });
  const res = await fetch(`${API}/complaints/?${qs}`);
  if (!res.ok) throw new Error('Failed to load complaints');
  return res.json();
}

export async function fetchComplaint(id) {
  const res = await fetch(`${API}/complaints/${id}/`);
  if (!res.ok) throw new Error('Complaint not found');
  return res.json();
}

export async function createComplaint(data) {
  const hasFiles = data.photo instanceof File || (data.additional_media?.length > 0);
  const body = hasFiles ? new FormData() : JSON.stringify(data);
  const headers = { ...authHeaders() };

  if (body instanceof FormData) {
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'additional_media' && Array.isArray(value)) {
        value.forEach(file => body.append('additional_media', file));
      } else if (value !== null && value !== undefined && value !== '') {
        body.append(key, value);
      }
    });
    delete headers['Content-Type'];
  } else {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API}/complaints/`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(Object.values(err).flat().join(', ') || 'Submission failed');
  }
  return res.json();
}

export async function updateComplaintStatus(id, data) {
  const body = data.resolution_photo instanceof File ? new FormData() : JSON.stringify(data);
  const headers = { ...authHeaders() };
  if (body instanceof FormData) {
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') body.append(key, value);
    });
    delete headers['Content-Type'];
  }
  const res = await fetch(`${API}/complaints/${id}/status/`, { method: 'PATCH', headers, body });
  if (!res.ok) throw new Error('Status update failed');
  return res.json();
}

export async function fetchAdminSummary() {
  const res = await fetch(`${API}/public/admin/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load admin data');
  return res.json();
}

export async function fetchBarangayScores() {
  const res = await fetch(`${API}/public/scores/`);
  if (!res.ok) throw new Error('Failed to load scores');
  return res.json();
}

export async function fetchUserStats() {
  const res = await fetch(`${API}/user/stats/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}

export async function fetchUserProfile() {
  const res = await fetch(`${API}/user/profile/`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function fetchAnalysis() {
  const res = await fetch(`${API}/public/analysis/`);
  if (!res.ok) throw new Error('Failed to load analysis');
  return res.json();
}

export async function toggleVote(complaintId) {
  const res = await fetch(`${API}/complaints/${complaintId}/vote/`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Sign in required');
    throw new Error('Vote failed');
  }
  return res.json();
}
