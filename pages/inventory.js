import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { IconPackage, IconLayers, IconArrowRight, IconPlus, IconTool, IconList } from '../lib/icons'

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

  function getParentName(parentId) {
    if (!parentId) return 'Unassigned'
    return items.find(i => i.id === parentId)?.name || parentId
  }

  function getChildCount(id) {
    return items.filter(i => i.parent_id === id).length
  }

  return (
    <>
      <Head>
        <title>Inventory · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="page">
        <div className="topbar">
          <div className="topbar-logo"><IconTool /></div>
          <h1>Inventory</h1>
          <span className="topbar-sub" style={{ cursor: 'pointer' }} onClick={() => router.push('/contents')}>
            Contents →
          </span>
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
              placeholder="Search by name or contents…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: 12 }}
            />

            <div className="filter-row">
              {['all', 'location', 'container'].map(f => (
                <button key={f} className={`filter-btn${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'location' ? 'Locations' : 'Containers'}
                </button>
              ))}
            </div>

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
        )}

        <button
          className="fab"
          style={{ right: 88, background: 'var(--bg)', color: 'var(--text)', border: '0.5px solid var(--border2)' }}
          onClick={() => router.push('/contents')}
          aria-label="View all contents"
        >
          <IconList />
        </button>
        <button className="fab" onClick={() => router.push('/new-tag')} aria-label="Generate new tag">
          <IconPlus />
        </button>
      </div>
    </>
  )
}
