import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.jsx'

// 📊 Sentry error monitoring — disabled unless VITE_SENTRY_DSN is set.
// Get a free DSN at https://sentry.io/signup/
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_SAMPLE_RATE) || 0.1,
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)

function SentryFallback() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#e6edf3' }}>
      <h2>Something went wrong</h2>
      <p style={{ color: '#8b949e' }}>We've been notified. Try refreshing the page.</p>
      <button onClick={() => window.location.reload()} style={{
        marginTop: '16px', padding: '10px 24px', borderRadius: '8px',
        background: '#e6edf3', color: '#0d1117', border: 'none', cursor: 'pointer',
      }}>Refresh</button>
    </div>
  )
}
