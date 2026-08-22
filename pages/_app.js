import { createContext, useContext } from 'react'
import { useRouter } from 'next/router'
import '../styles/globals.css'

// Auth was removed when the backend merged into project_db (2026-08-22).
// Pages still read `loggedIn` from this context to decide whether to show
// edit controls; it is now always true.
const AUTH = { session: null, loggedIn: true }
const AuthContext = createContext(AUTH)
export function useAuth() {
  return useContext(AuthContext)
}

export default function App({ Component, pageProps }) {
  const router = useRouter()

  return (
    <AuthContext.Provider value={AUTH}>
      {(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px',
          pointerEvents: 'none'
        }}>
          {/* Logo — clickable, goes home */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', pointerEvents: 'auto'
            }}
            onClick={() => router.push('/inventory')}
          >
            <div className="topbar-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <span style={{ fontWeight: 500, fontSize: 17, color: 'var(--text2)' }}>Workshop</span>
          </div>
        </div>
      )}
      <Component {...pageProps} />
    </AuthContext.Provider>
  )
}
