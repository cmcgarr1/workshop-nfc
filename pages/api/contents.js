import { supabase, getRequestContext } from '../../lib/supabaseServer'
import { buildItemsById, pathString, contentPathString } from '../../lib/itemPath'

// Categories are many-to-many (see supabase-schema-categories.sql):
// `categories` holds one row per distinct name per user, and
// `content_categories` links a contents row to zero or more of them.
// The old single-value `contents.category` column is left untouched
// but no longer read from or written to.

async function fetchCategoryMap(userId, contentIds) {
  let q = supabase
    .from('content_categories')
    .select('content_id, categories(name)')
    .eq('user_id', userId)
  if (contentIds) q = q.in('content_id', contentIds)
  const { data } = await q
  const map = {}
  ;(data || []).forEach(row => {
    const name = row.categories?.name
    if (!name) return
    if (!map[row.content_id]) map[row.content_id] = []
    map[row.content_id].push(name)
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

async function replaceContentCategories(userId, contentId, names) {
  const cleanNames = (names || []).map(n => (n || '').trim()).filter(Boolean)
  await supabase.from('content_categories').delete().eq('content_id', contentId).eq('user_id', userId)
  const catIds = await findOrCreateCategoryIds(userId, cleanNames)
  if (catIds.length) {
    await supabase.from('content_categories').insert(catIds.map(category_id => ({ content_id: contentId, category_id, user_id: userId })))
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

    let q = supabase.from('contents').select('*').eq('user_id', userId).order('date_added', { ascending: true })
    if (parent_item_id) q = q.eq('parent_item_id', parent_item_id)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    const { data: items } = await supabase.from('items').select('id, name, parent_id').eq('user_id', userId)
    const itemsById = buildItemsById(items)
    const categoryMap = await fetchCategoryMap(userId, (data || []).map(r => r.id))

    const enriched = (data || []).map(row => {
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
      .from('contents')
      .insert([{
        parent_item_id: parent_item_id || null,
        item_name,
        description: description || '',
        date_acquired: date_acquired || new Date().toISOString(),
        user_id: userId
      }])
      .select()
      .single()

    if (error) return res.status(400).json({ error: error.message })

    const catIds = await findOrCreateCategoryIds(userId, cleanCategories)
    if (catIds.length) {
      await supabase.from('content_categories').insert(catIds.map(category_id => ({ content_id: data.id, category_id, user_id: userId })))
    }

    return res.status(201).json({ content: { ...data, categories: cleanCategories } })
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

    const { data, error } = await supabase
      .from('contents')
      .update({
        item_name,
        description,
        parent_item_id: parent_item_id || null
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) return res.status(400).json({ error: error.message })

    const finalCategories = categories !== undefined
      ? await replaceContentCategories(userId, id, categories)
      : (await fetchCategoryMap(userId, [id]))[id] || []

    return res.json({ content: { ...data, categories: finalCategories } })
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
