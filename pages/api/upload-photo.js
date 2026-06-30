import { supabase, getRequestContext } from '../../lib/supabaseServer'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: { bodyParser: false }
}

export default async function handler(req, res) {
  const { userId, canWrite } = await getRequestContext(req)
  if (!userId) return res.status(401).json({ error: 'Not signed in' })
  if (!canWrite) return res.status(403).json({ error: 'Sign in to make changes' })

  if (req.method !== 'POST') return res.status(405).end()

  const form = formidable({ maxFileSize: 8 * 1024 * 1024 }) // 8MB cap
  const [fields, files] = await form.parse(req)

  const itemId = fields.item_id?.[0]
  const file = files.photo?.[0]
  if (!itemId || !file) return res.status(400).json({ error: 'item_id and photo required' })

  // Confirm this item belongs to the requesting user before touching it
  const { data: item } = await supabase
    .from('items')
    .select('id, photo_url')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single()
  if (!item) return res.status(404).json({ error: 'Item not found' })

  const ext = (file.originalFilename || '').split('.').pop() || 'jpg'
  const path = `${userId}/${itemId}-${Date.now()}.${ext}`
  const buffer = fs.readFileSync(file.filepath)

  const { error: uploadError } = await supabase.storage
    .from('item-photos')
    .upload(path, buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false })

  if (uploadError) return res.status(400).json({ error: uploadError.message })

  const { data: pub } = supabase.storage.from('item-photos').getPublicUrl(path)
  const photoUrl = pub.publicUrl

  const { data: updated, error: updateError } = await supabase
    .from('items')
    .update({ photo_url: photoUrl })
    .eq('id', itemId)
    .eq('user_id', userId)
    .select()
    .single()

  if (updateError) return res.status(400).json({ error: updateError.message })

  // Best-effort cleanup of the old photo, if any
  if (item.photo_url) {
    try {
      const oldPath = item.photo_url.split('/item-photos/')[1]
      if (oldPath) await supabase.storage.from('item-photos').remove([oldPath])
    } catch {}
  }

  return res.json({ item: updated })
}
