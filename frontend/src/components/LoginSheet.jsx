import { useState } from 'react';
import { login, register } from '../api';
export default function LoginSheet({ open, onLogin, onClose }) {
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
      onClose();
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
    <div className={`sheet-overlay${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet login-sheet" role="dialog" aria-label="Sign in">
        <div className="sheet-grip" />
        <div className="sheet-content">
          <div className="sheet-heading">
            <h3>{mode === 'login' ? 'Sign In' : 'Create Account'}</h3>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" className="field-input"
                placeholder="you@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={100} autoFocus required />
            </div>
            <div className="field-group">
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" className="field-input"
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                minLength={8} required />
            </div>
            {mode === 'register' && (
              <div className="field-group">
                <label htmlFor="auth-name">Display Name <span className="field-opt">(optional)</span></label>
                <input id="auth-name" type="text" className="field-input"
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
            <p className="login-hint">
              {mode === 'login'
                ? 'Sign in to track your reports and earn recognition.'
                : 'Create an account to claim your reports.'}
            </p>
            <div className="sheet-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading || !email || !password}>
                {loading ? <><span className="spinner" /> ...</> : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </div>
            <p className="login-switch">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button type="button" className="link-btn" onClick={switchMode}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
