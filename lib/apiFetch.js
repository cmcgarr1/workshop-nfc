import { supabase } from './supabase'

// Drop-in replacement for fetch() when calling our own /api/* routes.
// Attaches the current session's access token so API routes can identify
// the user. Usage is identical to fetch(): apiFetch(url, options).
export async function apiFetch(url, options = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token

  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  return fetch(url, { ...options, headers })
}
