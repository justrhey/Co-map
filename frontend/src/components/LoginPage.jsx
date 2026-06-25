import { useState } from 'react';
import { login, register, resendVerification, isLoggedIn } from '../api';

export default function LoginPage({ onLogin, onBack }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');        // "check your email" screen
  const [needsVerify, setNeedsVerify] = useState(false); // login blocked, offer resend
  const [resentMsg, setResentMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedsVerify(false);
    setResentMsg('');
    setLoading(true);
    try {
      if (mode === 'register') {
        const result = await register(email, password, name);
        setSentTo(result.email || email);   // show "verify your email" screen
      } else {
        const result = await login(email, password);
        onLogin(result.user);
        onBack();
      }
    } catch (err) {
      setError(err.message);
      if (err.kind === 'auth' && /verify/i.test(err.message)) setNeedsVerify(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResentMsg('');
    try {
      const r = await resendVerification(email);
      setResentMsg(r.message || 'Verification link sent.');
    } catch (err) {
      setResentMsg(err.message || 'Could not resend. Try again.');
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    setNeedsVerify(false);
    setResentMsg('');
  };

  return (
    <div className="auth-split">
      {/* ── Left: brand panel (black & white landing aesthetic) ── */}
      <aside className="auth-brand">
        <div className="auth-brand-grid" aria-hidden="true" />
        <div className="auth-brand-glow" aria-hidden="true" />

        <button className="auth-brand-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to map
        </button>

        <div className="auth-brand-mark">
          <img src="/logo_com.jpeg" alt="" className="brand-logo brand-logo-lg" />
          <span>Co-Map</span>
        </div>

        <div className="auth-brand-copy">
          <span className="auth-brand-tag">[ COMMUNITY MAP ]</span>
          <h1 className="auth-brand-headline">Report.<br/>Track.<br/>Resolve.</h1>
          <p className="auth-brand-sub">
            Join your neighborhood in mapping local issues — and watch them get fixed.
          </p>
        </div>

        <div className="auth-brand-foot">Built for better neighborhoods</div>
      </aside>

      {/* ── Right: auth card ── */}
      <main className="auth-panel">
      <div className="login-page-bg" />
      <div className="login-page-card">
        <div className="login-page-logo auth-card-logo-mobile">
          <img src="/logo_com.jpeg" alt="" className="brand-logo brand-logo-lg" />
          <span>Co-Map</span>
        </div>

        {sentTo ? (
          /* ── Verification-sent screen ── */
          <div className="verify-sent">
            <div className="verify-sent-icon">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22 7 12 13 2 7"/>
              </svg>
            </div>
            <h2 className="login-page-title">Check your email</h2>
            <p className="login-page-subtitle">
              We sent a verification link to <strong>{sentTo}</strong>. Click it to activate your account, then sign in.
            </p>
            <button type="button" className="btn btn-ghost btn-block" onClick={handleResend}>Resend link</button>
            {resentMsg && <p className="verify-resent-msg">{resentMsg}</p>}
            <button type="button" className="link-btn verify-back" onClick={() => { setSentTo(''); setMode('login'); }}>
              Back to sign in
            </button>
          </div>
        ) : (
        <>
        <h2 className="login-page-title">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className="login-page-subtitle">
          {mode === 'login'
            ? 'Sign in to track your reports and earn XP.'
            : 'Start making your community better.'}
        </p>

        {/* Mode tabs */}
        <div className="login-page-tabs">
          <button
            className={`login-page-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Sign In
          </button>
          <button
            className={`login-page-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Sign Up
          </button>
        </div>

        {/* ── SSO buttons ───────────────────────────────────────────── */}
        {/* 🔑 Google OAuth setup: https://console.cloud.google.com/apis/credentials
             Create OAuth 2.0 Client ID → add redirect URI
             https://yourdomain.com/accounts/google/login/callback/
             Then set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET env vars on the server.
             GitHub OAuth setup: https://github.com/settings/developers
             Same pattern — new OAuth App, same callback URL. */}
        <div className="login-page-sso">
          <a href="/accounts/google/login/" className="sso-btn">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </a>
          <a href="/accounts/github/login/" className="sso-btn">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </a>
        </div>

        <div className="login-page-divider">
          <span>or</span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="field-group">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" className="field-input"
              placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={100} autoFocus required />
          </div>
          <div className="field-group">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" className="field-input"
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
              minLength={8} required />
          </div>
          {mode === 'register' && (
            <div className="field-group">
              <label htmlFor="login-name">Display Name <span className="field-opt">(optional)</span></label>
              <input id="login-name" type="text" className="field-input"
                placeholder="How others see you" value={name}
                onChange={(e) => setName(e.target.value)} maxLength={50} />
            </div>
          )}

          {error && (
            <div className="form-error" role="alert">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{error}</span>
            </div>
          )}
          {needsVerify && (
            <button type="button" className="link-btn verify-resend-inline" onClick={handleResend}>
              Resend verification email
            </button>
          )}
          {resentMsg && <p className="verify-resent-msg">{resentMsg}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading || !email || !password}>
            {loading ? <><span className="spinner" /> ...</> : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        </>
        )}
      </div>
      </main>
    </div>
  );
}
