import { createClient } from '@supabase/supabase-js'

// SERVER-ONLY. Service-role client against the project_db Supabase project,
// where the inventory now lives as nfc_items / nfc_categories /
// nfc_item_categories. RLS is bypassed, so every query filters by user_id
// explicitly (see getRequestContext).
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const TABLES = {
  items: 'nfc_items',
  categories: 'nfc_categories',
  itemCategories: 'nfc_item_categories',
}

export const PHOTO_BUCKET = 'item-photos'
const SIGNED_URL_TTL = 60 * 60 * 12 // 12h; pages refetch on load anyway

// The single owner of the inventory (a project_db auth user UUID).
const OWNER_USER_ID = process.env.OWNER_USER_ID

// There is no login: anyone who can reach the app is the owner and can
// write. This matches project_db's own posture (no auth, unlinked URL).
export async function getRequestContext(_req) {
  if (!OWNER_USER_ID) return { userId: null, canWrite: false }
  return { userId: OWNER_USER_ID, canWrite: true }
}

// photo_url is stored as an object path inside the private item-photos
// bucket. Replace it with a signed URL before sending rows to the browser.
// Mutates and returns the same array/object.
export async function signPhotoUrls(rows) {
  if (!rows) return rows
  const list = Array.isArray(rows) ? rows : [rows]
  const paths = [...new Set(list.map(r => r?.photo_url).filter(Boolean))]
  if (paths.length) {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL)
    const byPath = Object.fromEntries((data || []).map(d => [d.path, d.signedUrl]))
    for (const r of list) if (r?.photo_url) r.photo_url = byPath[r.photo_url] || null
  }
  return rows
}
