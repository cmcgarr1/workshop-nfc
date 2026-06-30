import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import { IconTool, IconCheck } from '../lib/icons'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signedUp, setSignedUp] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) return setError(error.message)
      router.replace('/inventory')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      setLoading(false)
      if (error) return setError(error.message)
      setSignedUp(true)
    }
  }

  return (
    <>
      <Head>
        <title>Sign in · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="page">
        <div className="topbar">
          <div className="topbar-logo"><IconTool /></div>
          <h1>Workshop</h1>
        </div>

        <div className="type-toggle">
          <button
            className={`type-opt${mode === 'signin' ? ' active' : ''}`}
            onClick={() => { setMode('signin'); setError(''); setSignedUp(false) }}
          >
            Sign in
          </button>
          <button
            className={`type-opt${mode === 'signup' ? ' active' : ''}`}
            onClick={() => { setMode('signup'); setError(''); setSignedUp(false) }}
          >
            Sign up
          </button>
        </div>

        <div className="card">
          {signedUp ? (
            <div className="flash known">
              <div className="flash-icon"><IconCheck /></div>
              <div>
                <p>Check your email</p>
                <span>Confirm your address, then sign in</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </div>

              {error && (
                <div className="form-hint" style={{ color: '#A32D2D', marginBottom: 10 }}>
                  {error}
                </div>
              )}

              <button className="btn-primary save-btn" disabled={loading}>
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
