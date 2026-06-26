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

// ── Error handling ─────────────────────────────────────────────
// One Error type the UI can branch on (err.kind) and always show safely.
export class ApiError extends Error {
  constructor(message, { kind = 'error', status = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;     // network | offline | auth | rate | server | validation | error
    this.status = status;
  }
}

// Parse a JSON body only when the server actually sent JSON. A 403/500 often
// returns an HTML page — calling res.json() on that throws "Unexpected token <"
// and buries the real problem (this caused the old silent login failure).
async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  try { return await res.json(); } catch { return null; }
}

// Turn a DRF error body into one human sentence.
function messageFromBody(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (data.error) return data.error;
  if (data.detail) return data.detail;
  // Field errors: { photo: ["required"], location: "in water" } → joined.
  try {
    const parts = Object.values(data).flat().filter(v => typeof v === 'string');
    return parts.join(' ');
  } catch { return ''; }
}

/**
 * Single fetch wrapper. Always resolves to parsed data on success, or throws an
 * ApiError with a friendly, user-facing `.message` and a `.kind` on failure.
 */
async function apiFetch(path, { method = 'GET', json, body, headers = {}, auth = true } = {}) {
  const opts = { method, headers: { ...(auth ? authHeaders() : {}), ...headers } };
  if (json !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(json);
  } else if (body !== undefined) {
    opts.body = body; // FormData — let the browser set the multipart boundary.
  }

  let res;
  try {
    res = await fetch(`${API}${path}`, opts);
  } catch {
    // fetch only rejects on a true network failure (offline, DNS, server down).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new ApiError("You're offline. Check your connection and try again.", { kind: 'offline' });
    }
    throw new ApiError("Can't reach the server. Please try again in a moment.", { kind: 'network' });
  }

  if (res.ok) {
    return res.status === 204 ? null : safeJson(res);
  }

  const data = await safeJson(res);
  const detail = messageFromBody(data);

  if (res.status === 429) {
    throw new ApiError(detail || "You're doing that a little too fast — please wait a moment and try again.", { kind: 'rate', status: 429 });
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApiError(detail || 'Your session has expired. Please sign in again.', { kind: 'auth', status: res.status });
  }
  if (res.status === 400) {
    throw new ApiError(detail || 'Please check the form and try again.', { kind: 'validation', status: 400 });
  }
  if (res.status >= 500) {
    throw new ApiError('Something went wrong on our end. Please try again shortly.', { kind: 'server', status: res.status });
  }
  throw new ApiError(detail || 'Request failed. Please try again.', { kind: 'error', status: res.status });
}

// ── Auth API ───────────────────────────────────────────────────
export async function register(email, password, name) {
  // Register no longer returns a token — the account must verify email first.
  // Returns { detail: 'verification_sent', message, email }.
  return apiFetch('/auth/register/', { method: 'POST', auth: false, json: { email, password, name } });
}

export async function resendVerification(email) {
  return apiFetch('/auth/resend-verification/', { method: 'POST', auth: false, json: { email } });
}

export async function login(email, password) {
  const data = await apiFetch('/auth/login/', { method: 'POST', auth: false, json: { email, password } });
  setToken(data.token);
  return data;
}

export async function logout() {
  if (_token) {
    await apiFetch('/auth/logout/', { method: 'POST' }).catch(() => {});
  }
  setToken(null);
}

export async function fetchMe() {
  if (!_token) return null;
  try {
    return await apiFetch('/auth/me/');
  } catch (err) {
    if (err.kind === 'auth') setToken(null); // stale token — drop it
    return null;
  }
}

// ── Complaints ─────────────────────────────────────────────────
export async function fetchComplaints(params = {}) {
  const qs = new URLSearchParams({ page: '1', ...params });
  return apiFetch(`/complaints/?${qs}`, { auth: false });
}

export async function fetchComplaint(id) {
  return apiFetch(`/complaints/${id}/`);
}

export async function createComplaint(data) {
  const hasFiles = data.photo instanceof File || (data.additional_media?.length > 0);
  if (hasFiles) {
    const fd = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'additional_media' && Array.isArray(value)) {
        value.forEach(file => fd.append('additional_media', file));
      } else if (value !== null && value !== undefined && value !== '') {
        fd.append(key, value);
      }
    });
    return apiFetch('/complaints/', { method: 'POST', body: fd });
  }
  return apiFetch('/complaints/', { method: 'POST', json: data });
}

export async function updateComplaintStatus(id, data) {
  if (data.resolution_photo instanceof File) {
    const fd = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') fd.append(key, value);
    });
    return apiFetch(`/complaints/${id}/status/`, { method: 'PATCH', body: fd });
  }
  return apiFetch(`/complaints/${id}/status/`, { method: 'PATCH', json: data });
}

// ── Owner controls (edit / delete own report) ──────────────────
// PATCH /complaints/:id/ — owner-only via IsOwnerOrStaffOrReadOnly. Owners may
// edit content fields and set any status on their own report.
export async function updateComplaint(id, data) {
  return apiFetch(`/complaints/${id}/`, { method: 'PATCH', json: data });
}

export async function deleteComplaint(id) {
  return apiFetch(`/complaints/${id}/`, { method: 'DELETE' });
}

// ── Account self-service ───────────────────────────────────────
export async function updateAccountName(name) {
  return apiFetch('/auth/account/', { method: 'PATCH', json: { name } });
}

export async function changePassword(currentPassword, newPassword) {
  const data = await apiFetch('/auth/change-password/', {
    method: 'POST', json: { current_password: currentPassword, new_password: newPassword },
  });
  if (data?.token) setToken(data.token); // server rotated the token
  return data;
}

export async function deleteAccount() {
  await apiFetch('/auth/account/', { method: 'DELETE' });
  setToken(null);
}

export async function fetchAdminSummary() {
  return apiFetch('/public/admin/');
}

export async function fetchBarangayScores() {
  return apiFetch('/public/scores/', { auth: false });
}

export async function fetchUserStats() {
  return apiFetch('/user/stats/');
}

export async function fetchUserProfile() {
  return apiFetch('/user/profile/');
}

export async function fetchAnalysis() {
  return apiFetch('/public/analysis/', { auth: false });
}

export async function toggleVote(complaintId) {
  return apiFetch(`/complaints/${complaintId}/vote/`, { method: 'POST' });
}

// ── Discussion comments ────────────────────────────────────────
export async function fetchComments(complaintId) {
  return apiFetch(`/complaints/${complaintId}/comments/`, { auth: false });
}

export async function postComment(complaintId, body, parent = null) {
  return apiFetch(`/complaints/${complaintId}/comments/`, { method: 'POST', json: parent ? { body, parent } : { body } });
}

// ── Client-side cache (stale-while-revalidate) ─────────────────────
// Keeps responses fresh up to TTL ms; serves stale data while refetching
// in the background. Deduplicates in-flight requests by key.
const _cache = new Map();
const _inflight = new Map();  // key → Promise (dedup)

/**
 * Thin cache wrapper — wraps any async function with SWR semantics.
 * Rather than modifying each fetch function, hoist cache calls right
 * before the fetch so public API endpoints opt in naturally.
 *
 * @param {string} key   Unique cache key (URL + params)
 * @param {()=>Promise<any>} fetcher  The real async fetch
 * @param {number} ttl   Freshness TTL in ms  (default 30_000 = 30s)
 * @returns {Promise<{data:any, stale:boolean}>}
 */
async function cacheFetch(key, fetcher, ttl = 30_000) {
  const now = Date.now();
  const entry = _cache.get(key);

  // Serve fresh cache immediately.
  if (entry && now < entry.expires) {
    return { data: entry.data, stale: false };
  }

  // Deduplicate in-flight requests.
  if (_inflight.has(key)) {
    const data = await _inflight.get(key);
    return { data, stale: false };
  }

  // Stale data available — refetch in background.
  if (entry) {
    const promise = fetcher().catch(() => {});
    _inflight.set(key, promise);
    promise.then((data) => {
      _inflight.delete(key);
      if (data !== undefined) {
        _cache.set(key, { data, expires: now + ttl });
      }
    }).catch(() => _inflight.delete(key));
    return { data: entry.data, stale: true };
  }

  // Nothing cached — fetch fresh.
  const promise = fetcher().catch((e) => { _inflight.delete(key); throw e; });
  _inflight.set(key, promise);
  try {
    const data = await promise;
    _cache.set(key, { data, expires: now + ttl });
    return { data, stale: false };
  } finally {
    _inflight.delete(key);
  }
}

// Pre-configured cache wrappers for common endpoints.
const CACHE_TTL = {
  complaints: 30_000,         // 30 s — data moves quickly
  scores: 300_000,            // 5 min — health scores are stable
  static: 86_400_000,         // 24 h — essentially immutable
};

/** Public complaint list (non-auth'd, used by Landing + maps) */
let _cachedFetchComplaints = null;
export async function fetchCachedComplaints(params = {}) {
  const key = `complaints:${JSON.stringify(params)}`;
  return cacheFetch(key, () => fetchComplaints(params), CACHE_TTL.complaints);
}

/** Public summary — landing page stats */
let _cachedSummary = null;
export async function fetchCachedSummary() {
  const key = 'public-summary';
  return cacheFetch(key, async () => {
    const res = await fetch('/api/public/summary/');
    return res.ok ? res.json() : null;
  }, CACHE_TTL.scores);
}

/** Barangay scores — stable, 5-min cache */
let _cachedScores = null;
export async function fetchCachedBarangayScores() {
  const key = 'barangay-scores';
  return cacheFetch(key, () => fetchBarangayScores(), CACHE_TTL.scores);
}

/** Comments — 1-min cache (stale data fine for browsing) */
export async function fetchCachedComments(complaintId) {
  const key = `comments:${complaintId}`;
  return cacheFetch(key, () => fetchComments(complaintId), CACHE_TTL.complaints * 2);
}
