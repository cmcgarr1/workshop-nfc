import { createClient } from '@supabase/supabase-js'

// Service-role client — full access, bypasses RLS. Because of that,
// every API route MUST manually filter by user_id (see getUserOrThrow below).
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// A separate client using the anon key, used only to verify the access
// token a request sends us. We can't verify tokens with the service-role
// client config, so this one's job is just "whose token is this?".
const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// Pulls the user out of the Authorization: Bearer <token> header.
// Every API route should call this first and bail with 401 if it returns null.
export async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}
