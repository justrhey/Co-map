import { useState } from 'react';
import { login, register, isLoggedIn } from '../api';

export default function LoginPage({ onLogin, onBack }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let result;
      if (mode === 'register') {
        result = await register(email, password, name);
      } else {
        result = await login(email, password);
      }
      onLogin(result.user);
      onBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  };

  return (
    <div className="login-page">
      <div className="login-page-bg" />
      <div className="login-page-card">
        {/* Back button */}
        <button className="login-page-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          Back
        </button>

        {/* Logo */}
        <div className="login-page-logo">
          <svg viewBox="0 0 28 40" width="28" height="38" fill="none">
            <path d="M14 39C14 39 2 26 2 14 2 7.5 7.5 2 14 2s12 5.5 12 12c0 12-12 25-12 25z" fill="var(--accent)" opacity="0.9"/>
            <circle cx="14" cy="14" r="5" fill="#0d1117"/>
          </svg>
          <span>Co-Map</span>
        </div>

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

        {/* SSO buttons */}
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

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading || !email || !password}>
            {loading ? <><span className="spinner" /> ...</> : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
