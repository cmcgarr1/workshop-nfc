import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const { method, query, body } = req

  if (method === 'GET') {
    const { parent_item_id, categories_only } = query

    if (categories_only) {
      const { data, error } = await supabase.from('contents').select('category')
      if (error) return res.status(500).json({ error: error.message })
      const unique = [...new Set((data || []).map(r => r.category).filter(Boolean))].sort()
      return res.json({ categories: unique })
    }

    let q = supabase.from('contents').select('*').order('date_added', { ascending: false })
    if (parent_item_id) q = q.eq('parent_item_id', parent_item_id)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    // Enrich each row with the live box/location names so the frontend
    // doesn't have to do a second round-trip per row.
    const { data: items } = await supabase.from('items').select('id, name, parent_id')
    const itemsById = Object.fromEntries((items || []).map(i => [i.id, i]))

    const enriched = (data || []).map(row => {
      const parent = row.parent_item_id ? itemsById[row.parent_item_id] : null
      const location = parent?.parent_id ? itemsById[parent.parent_id] : null
      return {
        ...row,
        box_name: parent ? parent.name : 'Unassigned',
        location_name: location ? location.name : (parent ? 'Unassigned' : 'Unassigned')
      }
    })

    return res.json({ contents: enriched })
  }

  if (method === 'POST') {
    const { parent_item_id, item_name, description, category, date_acquired } = body
    if (!item_name && !category) {
      return res.status(400).json({ error: 'item_name or category required' })
    }

    const { data, error } = await supabase
      .from('contents')
      .insert([{
        parent_item_id: parent_item_id || null,
        item_name,
        description: description || '',
        category: category || '',
        date_acquired: date_acquired || null
      }])
      .select()
      .single()

    if (error) return res.status(400).json({ error: error.message })
    return res.status(201).json({ content: data })
  }

  if (method === 'PATCH') {
    const { id } = query
    if (!id) return res.status(400).json({ error: 'id required' })
    const { item_name, description, category, date_acquired, parent_item_id } = body

    const { data, error } = await supabase
      .from('contents')
      .update({
        item_name,
        description,
        category,
        date_acquired: date_acquired || null,
        parent_item_id: parent_item_id || null
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ content: data })
  }

  if (method === 'DELETE') {
    const { id } = query
    if (!id) return res.status(400).json({ error: 'id required' })

    const { error } = await supabase.from('contents').delete().eq('id', id)
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
