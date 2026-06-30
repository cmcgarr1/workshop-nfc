import { useEffect, useState, createContext, useContext } from 'react'
import { useRouter } from 'next/router'
import '../styles/globals.css'
import { supabase } from '../lib/supabase'

// Lets any page check "am I the signed-in owner right now?" via useAuth().
const AuthContext = createContext({ session: undefined })
export function useAuth() {
  return useContext(AuthContext)
}

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [session, setSession] = useState(undefined) // undefined = not checked yet

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const loggedIn = !!session

  return (
    <AuthContext.Provider value={{ session, loggedIn }}>
      {session !== undefined && router.pathname !== '/login' && (
        <div style={{ position: 'fixed', top: 10, right: 16, zIndex: 50 }}>
          {loggedIn ? (
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '6px 10px' }}
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          ) : (
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '6px 10px' }}
              onClick={() => router.push('/login')}
            >
              Sign in to edit
            </button>
          )}
        </div>
      )}
      <Component {...pageProps} />
    </AuthContext.Provider>
  )
}
