import { supabase, getUserFromRequest } from '../../lib/supabaseServer'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Not signed in' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id required' })

  // Confirm this item belongs to the user before writing to it
  const { data: existing } = await supabase
    .from('items')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const contentType = req.headers['content-type'] || 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const filePath = `${user.id}/${id}.${ext}`

  const body = await readBody(req)

  const { error: uploadError } = await supabase.storage
    .from('box-photos')
    .upload(filePath, body, { contentType, upsert: true })
  if (uploadError) return res.status(500).json({ error: uploadError.message })

  const { data: publicUrlData } = supabase.storage.from('box-photos').getPublicUrl(filePath)
  const imageUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`

  const { data, error } = await supabase
    .from('items')
    .update({ image_url: imageUrl })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ item: data })
}
