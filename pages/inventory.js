import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { IconPackage, IconLayers, IconArrowRight, IconPlus, IconTool } from '../lib/icons'
import { apiFetch } from '../lib/apiFetch'
import { useAuth } from './_app'

export default function InventoryPage() {
  const router = useRouter()
  const { loggedIn } = useAuth()
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [allContents, setAllContents] = useState([])

  useEffect(() => {
    apiFetch('/api/items')
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false) })
    apiFetch('/api/contents')
      .then(r => r.json())
      .then(d => setAllContents(d.contents || []))
  }, [])

  const filtered = items.filter(i => {
    const matchFilter = filter === 'all' || i.type === filter
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.notes?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const [expanded, setExpanded] = useState(new Set())
  const [contentsCache, setContentsCache] = useState({})
  const [contentsLoading, setContentsLoading] = useState({})

  function collectIds(node) {
    let ids = [node.id]
    node.children.forEach(c => { ids = ids.concat(collectIds(c)) })
    return ids
  }

  function toggleExpand(node) {
    const id = node.id
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        // Fetch contents for this node AND every descendant, since an open
        // node shows its own items plus anything from closed descendants
        // (a descendant that's separately opened shows its own items itself,
        // so it's excluded from the parent's list to avoid double-display).
        const idsNeeded = collectIds(node)
        idsNeeded.forEach(needId => {
          if (!contentsCache[needId] && !contentsLoading[needId]) {
            setContentsLoading(l => ({ ...l, [needId]: true }))
            apiFetch(`/api/contents?parent_item_id=${encodeURIComponent(needId)}`)
              .then(r => r.json())
              .then(d => {
                setContentsCache(c => ({ ...c, [needId]: d.contents || [] }))
                setContentsLoading(l => ({ ...l, [needId]: false }))
              })
              .catch(() => setContentsLoading(l => ({ ...l, [needId]: false })))
          }
        })
      }
      return next
    })
  }

  // Top-level locations start expanded so their contents are visible
  // immediately, without needing to click the eye icon first. Only runs
  // once per page load — collapsing one afterward stays collapsed.
  const [rootsAutoExpanded, setRootsAutoExpanded] = useState(false)
  useEffect(() => {
    if (loading || rootsAutoExpanded || items.length === 0) return
    buildTree().forEach(node => toggleExpand(node))
    setRootsAutoExpanded(true)
  }, [loading, items])

  function getParentName(parentId) {
    if (!parentId) return 'Unassigned'
    return items.find(i => i.id === parentId)?.name || parentId
  }

  function getChildCount(id) {
    return items.filter(i => i.parent_id === id).length
  }

  // "Items" here means entries in the contents table (actual logged tools),
  // as distinct from sub-locations (child rows in the items table).
  function getDirectItemCount(id) {
    return allContents.filter(c => c.parent_item_id === id).length
  }

  function getAggregatedItemCount(node) {
    let count = getDirectItemCount(node.id)
    node.children.forEach(child => { count += getAggregatedItemCount(child) })
    return count
  }

  // Builds a nested tree: top-level items (no parent) first, each with its
  // children attached recursively. Siblings are sorted by "rarity" — the
  // total count of locations/containers nested inside them, recursively,
  // not just direct children — so the most built-out parts of the shop
  // surface first; ties fall back to alphabetical.
  function buildTree() {
    const byParent = {}
    items.forEach(i => {
      const key = i.parent_id || '__root__'
      if (!byParent[key]) byParent[key] = []
      byParent[key].push(i)
    })

    const nestedCountCache = {}
    function countNested(id) {
      if (nestedCountCache[id] !== undefined) return nestedCountCache[id]
      const kids = byParent[id] || []
      const total = kids.reduce((sum, k) => sum + 1 + countNested(k.id), 0)
      nestedCountCache[id] = total
      return total
    }

    Object.values(byParent).forEach(list =>
      list.sort((a, b) => countNested(b.id) - countNested(a.id) || a.name.localeCompare(b.name))
    )

    function attach(item) {
      return { ...item, children: (byParent[item.id] || []).map(attach) }
    }
    return (byParent['__root__'] || []).map(attach)
  }

  // Gathers the contents to show under an open node: its own logged items,
  // plus anything from closed descendants (recursively) — but stops
  // descending into any descendant that's separately open, since that
  // descendant displays its own items in its own dropdown instead.
  function aggregatedContents(node) {
    let list = contentsCache[node.id] || []
    node.children.forEach(child => {
      if (!expanded.has(child.id)) {
        list = list.concat(aggregatedContents(child))
      }
    })
    return list
  }

  function isStillLoading(node) {
    if (contentsLoading[node.id]) return true
    return node.children.some(c => !expanded.has(c.id) && isStillLoading(c))
  }

  function TreeRow({ node, depth }) {
    const subLocationCount = node.children.length
    const itemCount = getAggregatedItemCount(node)
    const isOpen = expanded.has(node.id)
    const nodeContents = isOpen ? aggregatedContents(node) : []
    const isLoadingContents = isOpen && isStillLoading(node)

    const subParts = []
    if (subLocationCount > 0) subParts.push(`${subLocationCount} sub-location${subLocationCount !== 1 ? 's' : ''}`)
    subParts.push(`${itemCount} item${itemCount !== 1 ? 's' : ''}`)

    const shownContents = nodeContents.slice(0, 3)
    const hiddenCount = nodeContents.length - shownContents.length

    return (
      <>
        <div
          className="inv-item"
          style={{ marginLeft: depth * 18, cursor: 'pointer' }}
          onClick={() => (isOpen ? router.push(`/scan?id=${node.id}`) : toggleExpand(node))}
        >
          <div>
            <div className="inv-item-name">{node.name}</div>
            <div className="inv-item-sub">
              {subParts.join(' · ')}
              {node.notes ? ` · ${node.notes}` : ''}
            </div>
          </div>
          <div className="inv-item-arrow" style={{ marginLeft: 'auto' }}><IconArrowRight /></div>
        </div>

        {isOpen && (
          <div style={{ marginLeft: depth * 18 + 18, marginBottom: 8 }}>
            {isLoadingContents ? (
              <div style={{ fontSize: 12, color: 'var(--text2)', padding: '4px 0' }}>Loading…</div>
            ) : nodeContents.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 0' }}>Nothing logged here yet</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0' }}>
                {shownContents.map(row => (
                  <span key={row.id} className="chip purple">
                    {row.item_name || row.categories?.[0]}
                    {row.item_name && row.categories?.length ? ` · ${row.categories.join(', ')}` : ''}
                  </span>
                ))}
                {hiddenCount > 0 && (
                  <span className="chip" style={{ color: 'var(--text2)' }}>+{hiddenCount} more</span>
                )}
              </div>
            )}
          </div>
        )}

        {isOpen && node.children.map(child => <TreeRow key={child.id} node={child} depth={depth + 1} />)}
      </>
    )
  }

  const tree = buildTree()
  const isSearching = search.trim().length > 0

  return (
    <>
      <Head>
        <title>Shop hierarchy · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="page" style={{ paddingTop: 64 }}>

        <div className="filter-row">
          <button className="filter-btn active" style={{ flex: 1, textAlign: 'center' }}>
            Shop hierarchy
          </button>
          <button className="filter-btn" style={{ flex: 1, textAlign: 'center' }} onClick={() => router.push('/contents')}>
            Tools
          </button>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" />Loading…</div>
        ) : (
          <>
            <input
              placeholder="Search to filter, or browse the hierarchy below…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: 12 }}
            />

            {isSearching && (
              <div className="filter-row">
                {['all', 'location', 'container'].map(f => (
                  <button key={f} className={`filter-btn${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                    {f === 'all' ? 'All' : f === 'location' ? 'Locations' : 'Containers'}
                  </button>
                ))}
              </div>
            )}

            {isSearching ? (
              <>
                {filtered.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0', fontSize: 14 }}>
                    No items found
                  </div>
                )}

                {filtered.map(item => {
                  const subLocationCount = getChildCount(item.id)
                  const itemCount = getDirectItemCount(item.id)
                  return (
                    <div key={item.id} className="inv-item" onClick={() => router.push(`/scan?id=${item.id}`)}>
                      <div className={`inv-item-icon ${item.type === 'location' ? 'loc' : 'con'}`}>
                        {item.type === 'location' ? <IconLayers /> : <IconPackage />}
                      </div>
                      <div>
                        <div className="inv-item-name">{item.name}</div>
                        <div className="inv-item-sub">
                          {item.type === 'container' ? `In ${getParentName(item.parent_id)} · ` : ''}
                          {subLocationCount > 0 ? `${subLocationCount} sub-location${subLocationCount !== 1 ? 's' : ''} · ` : ''}
                          {itemCount} item{itemCount !== 1 ? 's' : ''}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </div>
                      </div>
                      <div className="inv-item-arrow"><IconArrowRight /></div>
                    </div>
                  )
                })}
              </>
            ) : (
              <>
                {tree.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0', fontSize: 14 }}>
                    No items yet
                  </div>
                )}
                {tree.map(node => <TreeRow key={node.id} node={node} depth={0} />)}
              </>
            )}
          </>
        )}

        {loggedIn && (
          <button className="fab" onClick={() => router.push('/new-tag')} aria-label="Generate new tag">
            <IconPlus />
          </button>
        )}
      </div>
    </>
  )
}
