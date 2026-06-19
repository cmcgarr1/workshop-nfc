import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { IconPackage, IconLayers, IconArrowRight, IconPlus, IconTool } from '../lib/icons'

export default function InventoryPage() {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/items')
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false) })
  }, [])

  const filtered = items.filter(i => {
    const matchFilter = filter === 'all' || i.type === filter
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.notes?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const locations = items.filter(i => i.type === 'location')
  const containers = items.filter(i => i.type === 'container')

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
            fetch(`/api/contents?parent_item_id=${encodeURIComponent(needId)}`)
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

  function EyeIcon({ open }) {
    return open ? (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ) : (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 4.22-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <path d="M1 1l22 22" />
      </svg>
    )
  }

  function getParentName(parentId) {
    if (!parentId) return 'Unassigned'
    return items.find(i => i.id === parentId)?.name || parentId
  }

  function getChildCount(id) {
    return items.filter(i => i.parent_id === id).length
  }

  // Builds a nested tree: top-level items (no parent) first, each with its
  // children attached recursively, sorted alphabetically at every level so
  // the hierarchy reads top-to-bottom the way you'd actually walk the shop.
  function buildTree() {
    const byParent = {}
    items.forEach(i => {
      const key = i.parent_id || '__root__'
      if (!byParent[key]) byParent[key] = []
      byParent[key].push(i)
    })
    Object.values(byParent).forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)))

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
    const childCount = node.children.length
    const isOpen = expanded.has(node.id)
    const nodeContents = isOpen ? aggregatedContents(node) : []
    const isLoadingContents = isOpen && isStillLoading(node)

    return (
      <>
        <div className="inv-item" style={{ marginLeft: depth * 18 }}>
          <button
            className="btn-ghost"
            style={{ padding: 6, flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); toggleExpand(node) }}
            aria-label={isOpen ? 'Hide contents' : 'Show contents'}
          >
            <EyeIcon open={isOpen} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer' }} onClick={() => router.push(`/scan?id=${node.id}`)}>
            <div className={`inv-item-icon ${node.type === 'location' ? 'loc' : 'con'}`}>
              {node.type === 'location' ? <IconLayers /> : <IconPackage />}
            </div>
            <div>
              <div className="inv-item-name">{node.name}</div>
              <div className="inv-item-sub">
                {childCount > 0 ? `${childCount} item${childCount !== 1 ? 's' : ''} inside` : (node.type === 'container' ? 'Empty' : 'Nothing inside')}
                {node.notes ? ` · ${node.notes}` : ''}
              </div>
            </div>
            <div className="inv-item-arrow" style={{ marginLeft: 'auto' }}><IconArrowRight /></div>
          </div>
        </div>

        {isOpen && (
          <div style={{ marginLeft: depth * 18 + 18, marginBottom: 8 }}>
            {isLoadingContents ? (
              <div style={{ fontSize: 12, color: 'var(--text2)', padding: '4px 0' }}>Loading…</div>
            ) : nodeContents.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 0' }}>Nothing logged here yet</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0' }}>
                {nodeContents.map(row => (
                  <span key={row.id} className="chip purple">
                    {row.item_name || row.category}
                    {row.item_name && row.category ? ` · ${row.category}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {node.children.map(child => <TreeRow key={child.id} node={child} depth={depth + 1} />)}
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

      <div className="page">
        <div className="topbar">
          <div className="topbar-logo"><IconTool /></div>
          <h1>Workshop</h1>
        </div>

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
            <div className="inv-stats">
              <div className="inv-stat">
                <div className="inv-stat-val">{locations.length}</div>
                <div className="inv-stat-lbl">Locations</div>
              </div>
              <div className="inv-stat">
                <div className="inv-stat-val">{containers.length}</div>
                <div className="inv-stat-lbl">Containers</div>
              </div>
              <div className="inv-stat">
                <div className="inv-stat-val">{items.length}</div>
                <div className="inv-stat-lbl">Total</div>
              </div>
            </div>

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

                {filtered.map(item => (
                  <div key={item.id} className="inv-item" onClick={() => router.push(`/scan?id=${item.id}`)}>
                    <div className={`inv-item-icon ${item.type === 'location' ? 'loc' : 'con'}`}>
                      {item.type === 'location' ? <IconLayers /> : <IconPackage />}
                    </div>
                    <div>
                      <div className="inv-item-name">{item.name}</div>
                      <div className="inv-item-sub">
                        {item.type === 'container'
                          ? getParentName(item.parent_id)
                          : `${getChildCount(item.id)} item${getChildCount(item.id) !== 1 ? 's' : ''} inside`
                        }
                        {item.notes ? ` · ${item.notes}` : ''}
                      </div>
                    </div>
                    <div className="inv-item-arrow"><IconArrowRight /></div>
                  </div>
                ))}
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

        <button className="fab" onClick={() => router.push('/new-tag')} aria-label="Generate new tag">
          <IconPlus />
        </button>
      </div>
    </>
  )
}
