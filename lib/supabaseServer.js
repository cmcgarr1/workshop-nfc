import { createClient } from '@supabase/supabase-js'

// Service-role client — full access, bypasses RLS. Every API route MUST
// manually filter by user_id (see getRequestContext below).
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Separate client using the anon key, used only to verify access tokens.
const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// The one workshop this app publicly shows. Set this to your own Supabase
// auth UUID in the OWNER_USER_ID env var. Anonymous visitors see this
// user's inventory, read-only.
const OWNER_USER_ID = process.env.OWNER_USER_ID

// Pulls the user out of the Authorization: Bearer <token> header, if any.
async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

// Resolves who this request should act as, and whether it's allowed to write.
//
// - Signed in as the owner -> { userId: ownerId, canWrite: true }
// - Signed in as a different account -> { userId: theirId, canWrite: true }
//   (their own private inventory, multi-user support is still intact)
// - Not signed in -> { userId: OWNER_USER_ID, canWrite: false }
//   (anonymous public read-only view of the owner's workshop)
//
// API routes should use this instead of getUserFromRequest directly.
export async function getRequestContext(req) {
  const user = await getUserFromRequest(req)
  if (user) {
    return { userId: user.id, canWrite: true }
  }
  if (OWNER_USER_ID) {
    return { userId: OWNER_USER_ID, canWrite: false }
  }
  return { userId: null, canWrite: false }
}
