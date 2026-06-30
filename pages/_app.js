import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import '../styles/globals.css'
import { supabase } from '../lib/supabase'

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

  useEffect(() => {
    if (session === undefined) return // still loading
    if (!session && router.pathname !== '/login') {
      router.replace('/login')
    }
  }, [session, router.pathname])

  // Still checking session — render nothing to avoid a flash of protected content
  if (session === undefined) return null

  // Logged out and not yet redirected — render nothing
  if (!session && router.pathname !== '/login') return null

  return (
    <>
      {session && router.pathname !== '/login' && (
        <div style={{ position: 'fixed', top: 10, right: 16, zIndex: 50 }}>
          <button
            className="btn-ghost"
            style={{ fontSize: 12, padding: '6px 10px' }}
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      )}
      <Component {...pageProps} />
    </>
  )
}
