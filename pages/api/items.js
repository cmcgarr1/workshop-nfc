import { supabase, getRequestContext } from '../../lib/supabaseServer'
import { buildItemsById, pathString } from '../../lib/itemPath'

export default async function handler(req, res) {
  const { method, query, body } = req

  const { userId, canWrite } = await getRequestContext(req)
  if (!userId) return res.status(401).json({ error: 'Not signed in' })

  if (method === 'GET') {
    const { id } = query
    if (id) {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()
      if (error) return res.status(404).json({ error: 'Not found' })
      const { data: children } = await supabase
        .from('items')
        .select('*')
        .eq('parent_id', id)
        .eq('user_id', userId)
      const { data: allUserItems } = await supabase.from('items').select('id, name, parent_id').eq('user_id', userId)
      const itemsById = buildItemsById(allUserItems)
      return res.json({ item: data, children: children || [], canWrite, path: pathString(id, itemsById) })
    }
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ items: data, canWrite })
  }

  // Everything below mutates data — anonymous/read-only requests are blocked
  if (!canWrite) return res.status(403).json({ error: 'Sign in to make changes' })

  if (method === 'POST') {
    const { id, name, type, parent_id, notes, tag_written_at } = body
    if (!id || !name || !type) return res.status(400).json({ error: 'id, name, type required' })

    if (parent_id) {
      const { data: parent } = await supabase
        .from('items')
        .select('id')
        .eq('id', parent_id)
        .eq('user_id', userId)
        .single()
      if (!parent) return res.status(400).json({ error: 'Invalid parent location' })
    }

    const { data, error } = await supabase
      .from('items')
      .insert([{ id, name, type, parent_id: parent_id || null, notes: notes || '', user_id: userId, tag_written_at: tag_written_at || null }])
      .select()
      .single()
    if (error) return res.status(400).json({ error: error.message })
    return res.status(201).json({ item: data })
  }

  if (method === 'PATCH') {
    const { id } = query
    const { name, type, parent_id, notes, tag_written_at } = body

    if (parent_id) {
      const { data: parent } = await supabase
        .from('items')
        .select('id')
        .eq('id', parent_id)
        .eq('user_id', userId)
        .single()
      if (!parent) return res.status(400).json({ error: 'Invalid parent location' })
    }

    // parent_id and tag_written_at are only touched when explicitly present
    // in the body — this route also serves lightweight single-field patches
    // (e.g. the audit checklist's "mark as tagged" action), which must not
    // blow away an unrelated field like parent_id by coercing a missing key
    // to null.
    const updatePayload = { name, type, notes }
    if (parent_id !== undefined) updatePayload.parent_id = parent_id || null
    if (tag_written_at !== undefined) updatePayload.tag_written_at = tag_written_at || null

    const { data, error } = await supabase
      .from('items')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ item: data })
  }

  if (method === 'DELETE') {
    const { id, cascade } = query

    if (cascade === 'true') {
      const idsToDelete = [id]
      let frontier = [id]
      while (frontier.length) {
        const { data: kids } = await supabase
          .from('items')
          .select('id')
          .in('parent_id', frontier)
          .eq('user_id', userId)
        const kidIds = (kids || []).map(k => k.id)
        if (!kidIds.length) break
        idsToDelete.push(...kidIds)
        frontier = kidIds
      }
      await supabase.from('contents').delete().in('parent_item_id', idsToDelete).eq('user_id', userId)
      const { error } = await supabase.from('items').delete().in('id', idsToDelete).eq('user_id', userId)
      if (error) return res.status(400).json({ error: error.message })
      return res.json({ ok: true, deletedCount: idsToDelete.length })
    }

    await supabase.from('items').update({ parent_id: null }).eq('parent_id', id).eq('user_id', userId)
    const { error } = await supabase.from('items').delete().eq('id', id).eq('user_id', userId)
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
