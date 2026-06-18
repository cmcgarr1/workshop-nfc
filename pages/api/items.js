import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)


const
 supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)

export default async function handler(req, res) {
  const { method, query, body } = req

  if (method === 'GET') {
    const { id } = query
    if (id) {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', id)
        .single()
      if (error) return res.status(404).json({ error: 'Not found' })
      const { data: children } = await supabase
        .from('items')
        .select('*')
        .eq('parent_id', id)
      return res.json({ item: data, children: children || [] })
    }
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ items: data })
  }

  if (method === 'POST') {
    const { id, name, type, parent_id, notes } = body
    if (!id || !name || !type) return res.status(400).json({ error: 'id, name, type required' })
    const { data, error } = await supabase
      .from('items')
      .insert([{ id, name, type, parent_id: parent_id || null, notes: notes || '' }])
      .select()
      .single()
    if (error) return res.status(400).json({ error: error.message })
    return res.status(201).json({ item: data })
  }

  if (method === 'PATCH') {
    const { id } = query
    const { name, type, parent_id, notes } = body
    const { data, error } = await supabase
      .from('items')
      .update({ name, type, parent_id: parent_id || null, notes })
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ item: data })
  }

  if (method === 'DELETE') {
    const { id } = query
    await supabase.from('items').update({ parent_id: null }).eq('parent_id', id)
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
