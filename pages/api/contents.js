import { randomUUID } from 'crypto'
import { supabase, getRequestContext } from '../../lib/supabaseServer'
import { buildItemsById, pathString, contentPathString } from '../../lib/itemPath'

// Tools live as `items` rows with type='item' (see the 2026-07-28 unification
// migration — Phase 1 copied the old `contents` rows over, Phase 2/3 here
// repoints this route's read/write paths to the new home). Categories go
// through the shared `item_categories` junction table, same shape as
// `content_categories` did. The `contents`/`content_categories` tables have
// since been dropped; only the point-in-time snapshots items_backup_20260730
// and contents_backup_20260730 remain, and nothing reads them.
//
// The request/response shape here is unchanged on purpose — `item_name`,
// `parent_item_id`, `date_added`, etc. — so pages/contents.js, pages/scan.js,
// and pages/entry.js didn't need to change at all.

function reshape(row) {
  return {
    id: row.id,
    item_name: row.name,
    description: row.description || '',
    date_acquired: row.date_acquired,
    date_added: row.created_at,
    updated_at: row.updated_at,
    parent_item_id: row.parent_id,
    user_id: row.user_id
  }
}

async function fetchCategoryMap(userId, itemIds) {
  let q = supabase
    .from('item_categories')
    .select('item_id, categories(name)')
    .eq('user_id', userId)
  if (itemIds) q = q.in('item_id', itemIds)
  const { data } = await q
  const map = {}
  ;(data || []).forEach(row => {
    const name = row.categories?.name
    if (!name) return
    if (!map[row.item_id]) map[row.item_id] = []
    map[row.item_id].push(name)
  })
  return map
}

// Finds an existing category row (case-insensitive) for each name, or
// creates one, returning the full set of category ids.
async function findOrCreateCategoryIds(userId, names) {
  const clean = [...new Set((names || []).map(n => (n || '').trim()).filter(Boolean))]
  if (!clean.length) return []

  const { data: existing } = await supabase.from('categories').select('id, name').eq('user_id', userId)
  const byLower = new Map((existing || []).map(c => [c.name.toLowerCase(), c.id]))

  const ids = []
  const toInsert = []
  for (const name of clean) {
    const found = byLower.get(name.toLowerCase())
    if (found) ids.push(found)
    else toInsert.push({ name, user_id: userId })
  }
  if (toInsert.length) {
    const { data: inserted, error } = await supabase.from('categories').insert(toInsert).select('id, name')
    if (error) throw error
    ids.push(...(inserted || []).map(c => c.id))
  }
  return ids
}

async function replaceItemCategories(userId, itemId, names) {
  const cleanNames = (names || []).map(n => (n || '').trim()).filter(Boolean)
  await supabase.from('item_categories').delete().eq('item_id', itemId).eq('user_id', userId)
  const catIds = await findOrCreateCategoryIds(userId, cleanNames)
  if (catIds.length) {
    await supabase.from('item_categories').insert(catIds.map(category_id => ({ item_id: itemId, category_id, user_id: userId })))
  }
  return cleanNames
}

export default async function handler(req, res) {
  const { method, query, body } = req

  const { userId, canWrite } = await getRequestContext(req)
  if (!userId) return res.status(401).json({ error: 'Not signed in' })

  if (method === 'GET') {
    const { parent_item_id, categories_only } = query

    if (categories_only) {
      const { data, error } = await supabase
        .from('categories')
        .select('name')
        .eq('user_id', userId)
        .order('name')
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ categories: (data || []).map(c => c.name) })
    }

    let q = supabase.from('items').select('*').eq('user_id', userId).eq('type', 'item').order('created_at', { ascending: true })
    if (parent_item_id) q = q.eq('parent_id', parent_item_id)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    const { data: allItems } = await supabase.from('items').select('id, name, parent_id').eq('user_id', userId)
    const itemsById = buildItemsById(allItems)
    const categoryMap = await fetchCategoryMap(userId, (data || []).map(r => r.id))

    const enriched = (data || []).map(raw => {
      const row = reshape(raw)
      const parent = row.parent_item_id ? itemsById[row.parent_item_id] : null
      return {
        ...row,
        categories: categoryMap[row.id] || [],
        box_name: parent ? parent.name : 'Unassigned',
        path: row.parent_item_id ? pathString(row.parent_item_id, itemsById) : 'Unassigned',
        full_path: contentPathString(row, itemsById)
      }
    })

    return res.json({ contents: enriched, canWrite })
  }

  // Everything below mutates data — anonymous/read-only requests are blocked
  if (!canWrite) return res.status(403).json({ error: 'Sign in to make changes' })

  if (method === 'POST') {
    const { parent_item_id, item_name, description, categories, date_acquired } = body
    const cleanCategories = (categories || []).map(c => (c || '').trim()).filter(Boolean)
    if (!item_name && cleanCategories.length === 0) {
      return res.status(400).json({ error: 'Enter an item name, or at least one category' })
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
      .from('items')
      .insert([{
        id: randomUUID(),
        type: 'item',
        name: item_name,
        parent_id: parent_item_id || null,
        description: description || '',
        date_acquired: date_acquired || new Date().toISOString(),
        notes: '',
        user_id: userId
      }])
      .select()
      .single()

    if (error) return res.status(400).json({ error: error.message })

    const catIds = await findOrCreateCategoryIds(userId, cleanCategories)
    if (catIds.length) {
      await supabase.from('item_categories').insert(catIds.map(category_id => ({ item_id: data.id, category_id, user_id: userId })))
    }

    return res.status(201).json({ content: { ...reshape(data), categories: cleanCategories } })
  }

  if (method === 'PATCH') {
    const { id } = query
    if (!id) return res.status(400).json({ error: 'id required' })
    const { item_name, description, categories, parent_item_id } = body

    if (parent_item_id) {
      const { data: parent } = await supabase
        .from('items')
        .select('id')
        .eq('id', parent_item_id)
        .eq('user_id', userId)
        .single()
      if (!parent) return res.status(400).json({ error: 'Invalid location' })
    }

    const updatePayload = {}
    if (item_name !== undefined) updatePayload.name = item_name
    if (description !== undefined) updatePayload.description = description
    if (parent_item_id !== undefined) updatePayload.parent_id = parent_item_id || null

    const { data, error } = await supabase
      .from('items')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId)
      .eq('type', 'item')
      .select()
      .single()

    if (error) return res.status(400).json({ error: error.message })

    const finalCategories = categories !== undefined
      ? await replaceItemCategories(userId, id, categories)
      : (await fetchCategoryMap(userId, [id]))[id] || []

    return res.json({ content: { ...reshape(data), categories: finalCategories } })
  }

  if (method === 'DELETE') {
    const { id } = query
    if (!id) return res.status(400).json({ error: 'id required' })

    const { error } = await supabase.from('items').delete().eq('id', id).eq('user_id', userId).eq('type', 'item')
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
