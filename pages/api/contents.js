import { supabase, getRequestContext } from '../../lib/supabaseServer'

export default async function handler(req, res) {
  const { method, query, body } = req

  const { userId, canWrite } = await getRequestContext(req)
  if (!userId) return res.status(401).json({ error: 'Not signed in' })

  if (method === 'GET') {
    const { parent_item_id, categories_only } = query

    if (categories_only) {
      const { data, error } = await supabase
        .from('contents')
        .select('category')
        .eq('user_id', userId)
      if (error) return res.status(500).json({ error: error.message })
      const unique = [...new Set((data || []).map(r => r.category).filter(Boolean))].sort()
      return res.json({ categories: unique })
    }

    let q = supabase.from('contents').select('*').eq('user_id', userId).order('date_added', { ascending: false })
    if (parent_item_id) q = q.eq('parent_item_id', parent_item_id)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    const { data: items } = await supabase.from('items').select('id, name, parent_id').eq('user_id', userId)
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

    return res.json({ contents: enriched, canWrite })
  }

  // Everything below mutates data — anonymous/read-only requests are blocked
  if (!canWrite) return res.status(403).json({ error: 'Sign in to make changes' })

  if (method === 'POST') {
    const { parent_item_id, item_name, description, category, date_acquired } = body
    if (!item_name && !category) {
      return res.status(400).json({ error: 'item_name or category required' })
    }

    if (parent_item_id) {
      const { data: parent } = await supabase
        .from('items')
        .select('id')
        .eq('id', parent_item_id)
        .eq('user_id', userId)
        .single()
      if (!parent) return res.status(400).json({ error: 'Invalid location' })
    }

    const { data, error } = await supabase
      .from('contents')
      .insert([{
        parent_item_id: parent_item_id || null,
        item_name,
        description: description || '',
        category: category || '',
        date_acquired: date_acquired || null,
        user_id: userId
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

    if (parent_item_id) {
      const { data: parent } = await supabase
        .from('items')
        .select('id')
        .eq('id', parent_item_id)
        .eq('user_id', userId)
        .single()
      if (!parent) return res.status(400).json({ error: 'Invalid location' })
    }

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
      .eq('user_id', userId)
      .select()
      .single()

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ content: data })
  }

  if (method === 'DELETE') {
    const { id } = query
    if (!id) return res.status(400).json({ error: 'id required' })

    const { error } = await supabase.from('contents').delete().eq('id', id).eq('user_id', userId)
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
