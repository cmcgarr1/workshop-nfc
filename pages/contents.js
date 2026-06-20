import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { IconTool, IconArrowLeft, IconPlus, IconCheck } from '../lib/icons'

function IconPencil() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="M15 5l4 4" />
    </svg>
  )
}

function IconTrashCan() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function IconFilter({ active }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

const emptyForm = { item_name: '', description: '', category: '', date_acquired: '', parent_item_id: '' }

// This page fetches live data from /api/contents on mount. Next.js tries
// to statically pre-render pages at build time by default, but there's no
// live server to call during the build step — forcing this page to render
// fresh on every request (server-side) instead avoids that build error.
export async function getServerSideProps() {
  return { props: {} }
}

export default function ContentsPage() {
  const router = useRouter()
  const [contents, setContents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [containers, setContainers] = useState([])
  const [categorySuggestions, setCategorySuggestions] = useState([])

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [filters, setFilters] = useState({})       // { category: ['measuring','cutting'], box_name: [...], location_name: [...] }
  const [openFilterCol, setOpenFilterCol] = useState(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [sortKey, setSortKey] = useState('date_added')
  const [sortDir, setSortDir] = useState('desc')

  function loadContents() {
    fetch('/api/contents')
      .then(r => r.json())
      .then(d => { setContents(d.contents || []); setLoading(false) })
  }

  useEffect(() => {
    loadContents()
    fetch('/api/items')
      .then(r => r.json())
      .then(d => setContainers((d.items || []).filter(i => i.type === 'container')))
    fetch('/api/contents?categories_only=1')
      .then(r => r.json())
      .then(d => setCategorySuggestions(d.categories || []))
  }, [])

  function openAddForm() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEditForm(row) {
    setEditingId(row.id)
    setForm({
      item_name: row.item_name || '',
      description: row.description || '',
      category: row.category || '',
      date_acquired: row.date_acquired ? row.date_acquired.slice(0, 10) : '',
      parent_item_id: row.parent_item_id || ''
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function saveForm() {
    if (!form.item_name.trim() && !form.category.trim()) {
      return alert('Enter an item name or a category')
    }
    setSaving(true)
    const payload = { ...form, parent_item_id: form.parent_item_id || null }
    const r = editingId
      ? await fetch(`/api/contents?id=${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      : await fetch('/api/contents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) return alert(data.error)
    if (form.category && !categorySuggestions.includes(form.category)) {
      setCategorySuggestions(c => [...c, form.category].sort())
    }
    closeForm()
    loadContents()
  }

  async function deleteRow(id) {
    if (!confirm('Remove this item from your contents log?')) return
    await fetch(`/api/contents?id=${id}`, { method: 'DELETE' })
    setContents(c => c.filter(r => r.id !== id))
  }

  // Columns that get an Excel-style "filter by value" dropdown
  const filterableKeys = ['category', 'box_name', 'location_name']

  function uniqueValues(key) {
    return [...new Set(contents.map(r => r[key]).filter(v => v && v !== 'Unassigned'))].sort()
  }

  function toggleFilterValue(col, val) {
    setFilters(f => {
      const current = f[col] || []
      const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val]
      return { ...f, [col]: next }
    })
  }

  function selectAllFilter(col, values) {
    setFilters(f => ({ ...f, [col]: values }))
  }

  function clearFilter(col) {
    setFilters(f => ({ ...f, [col]: [] }))
  }

  function clearAllFilters() {
    setFilters({})
  }

  const activeFilterCount = Object.values(filters).filter(v => v && v.length > 0).length

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const columns = [
    { key: 'item_name', label: 'Item' },
    { key: 'description', label: 'Description' },
    { key: 'category', label: 'Category' },
    { key: 'date_added', label: 'Date added' },
    { key: 'date_acquired', label: 'Date acquired' },
    { key: 'box_name', label: 'Box' },
    { key: 'location_name', label: 'Location' },
    { key: null, label: '' }
  ]

  const filtered = contents
    .filter(r => {
      if (!search) return true
      const haystack = `${r.item_name} ${r.description} ${r.category} ${r.box_name} ${r.location_name}`.toLowerCase()
      return haystack.includes(search.toLowerCase())
    })
    .filter(r => filterableKeys.every(col => !filters[col] || filters[col].length === 0 || filters[col].includes(r[col])))
    .slice()
    .sort((a, b) => {
      const av = a[sortKey] || ''
      const bv = b[sortKey] || ''
      let cmp
      if (sortKey === 'date_added' || sortKey === 'date_acquired') {
        cmp = new Date(av || 0) - new Date(bv || 0)
      } else {
        cmp = String(av).toLowerCase().localeCompare(String(bv).toLowerCase())
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <>
      <Head>
        <title>Tools · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="page" style={{ maxWidth: 900 }}>
        <div className="topbar">
          <div className="topbar-logo"><IconTool /></div>
          <h1>Workshop</h1>
        </div>

        <div className="filter-row">
          <button className="filter-btn" style={{ flex: 1, textAlign: 'center' }} onClick={() => router.push('/inventory')}>
            Shop hierarchy
          </button>
          <button className="filter-btn active" style={{ flex: 1, textAlign: 'center' }}>
            Tools
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Search item, description, category, box, location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            onClick={openAddForm}
          >
            <IconPlus /> Add item
          </button>
        </div>

        {activeFilterCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: 'var(--text2)' }}>
            <span>{activeFilterCount} column filter{activeFilterCount !== 1 ? 's' : ''} active</span>
            <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={clearAllFilters}>Clear all</button>
          </div>
        )}

        {loading ? (
          <div className="loading"><div className="spinner" />Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0', fontSize: 14 }}>
            {contents.length === 0 ? 'No contents logged yet' : 'No items match your search or filters'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border2)', textAlign: 'left' }}>
                  {columns.map(col => {
                    const isFilterable = filterableKeys.includes(col.key)
                    const colActive = (filters[col.key] || []).length > 0
                    const colValues = isFilterable ? uniqueValues(col.key) : []
                    const visibleValues = openFilterCol === col.key
                      ? colValues.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
                      : []
                    const selected = filters[col.key] || []

                    return (
                      <th
                        key={col.label || 'actions'}
                        style={{
                          padding: '8px 10px',
                          color: 'var(--text2)',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          position: 'relative'
                        }}
                      >
                        <span
                          onClick={col.key ? () => toggleSort(col.key) : undefined}
                          style={{ cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}
                        >
                          {col.label}
                          {col.key && sortKey === col.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                        </span>

                        {isFilterable && (
                          <button
                            className="btn-ghost"
                            style={{
                              padding: '2px 5px',
                              marginLeft: 5,
                              color: colActive ? 'var(--purple-text)' : 'var(--text3)',
                              borderColor: colActive ? 'var(--purple-border)' : 'transparent',
                              background: colActive ? 'var(--purple-bg)' : 'transparent'
                            }}
                            onClick={e => {
                              e.stopPropagation()
                              setFilterSearch('')
                              setOpenFilterCol(openFilterCol === col.key ? null : col.key)
                            }}
                          >
                            <IconFilter active={colActive} />
                          </button>
                        )}

                        {openFilterCol === col.key && (
                          <>
                            <div
                              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                              onClick={() => setOpenFilterCol(null)}
                            />
                            <div
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                                width: 220, background: 'var(--bg)', border: '0.5px solid var(--border2)',
                                borderRadius: 'var(--radius-sm)', boxShadow: '0 6px 20px rgba(43,33,24,0.25)',
                                zIndex: 50, padding: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0
                              }}
                            >
                              <input
                                placeholder="Search values…"
                                value={filterSearch}
                                onChange={e => setFilterSearch(e.target.value)}
                                style={{ marginBottom: 8, fontSize: 12 }}
                                autoFocus
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span
                                  style={{ fontSize: 11, color: 'var(--purple-text)', cursor: 'pointer' }}
                                  onClick={() => selectAllFilter(col.key, visibleValues)}
                                >
                                  Select all
                                </span>
                                <span
                                  style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer' }}
                                  onClick={() => clearFilter(col.key)}
                                >
                                  Clear
                                </span>
                              </div>
                              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {visibleValues.length === 0 ? (
                                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>No values</span>
                                ) : visibleValues.map(val => (
                                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 400, cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      style={{ width: 'auto' }}
                                      checked={selected.includes(val)}
                                      onChange={() => toggleFilterValue(col.key, val)}
                                    />
                                    {val}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 500 }}>{row.item_name}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>{row.description || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {row.category ? <span className="chip purple">{row.category}</span> : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDate(row.date_added)}</td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDate(row.date_acquired)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {row.parent_item_id
                        ? <span className="chip purple" style={{ cursor: 'pointer' }} onClick={() => router.push(`/scan?id=${row.parent_item_id}`)}>{row.box_name}</span>
                        : <span style={{ color: 'var(--text3)' }}>Unassigned</span>
                      }
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {row.location_item_id
                        ? <span className="chip blue" style={{ cursor: 'pointer' }} onClick={() => router.push(`/scan?id=${row.location_item_id}`)}>{row.location_name}</span>
                        : <span style={{ color: 'var(--text3)' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => openEditForm(row)}>
                        <IconPencil />
                      </button>
                      <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => deleteRow(row.id)}>
                        <IconTrashCan />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-bg" onClick={closeForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2>{editingId ? 'Edit item' : 'Add item'}</h2>

            <div className="form-group">
              <label className="form-label">Item name</label>
              <input
                placeholder="e.g. Phillips screwdriver"
                value={form.item_name}
                onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                placeholder="Optional details"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
              <input
                placeholder="Type to see suggestions…"
                list="category-suggestions"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              />
              <datalist id="category-suggestions">
                {categorySuggestions.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div className="form-group">
              <label className="form-label">Box / container</label>
              <select
                value={form.parent_item_id}
                onChange={e => setForm(f => ({ ...f, parent_item_id: e.target.value }))}
              >
                <option value="">— unassigned —</option>
                {containers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Date acquired</label>
              <input
                type="date"
                value={form.date_acquired}
                onChange={e => setForm(f => ({ ...f, date_acquired: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={closeForm}>Cancel</button>
              <button className="btn-primary save-btn" style={{ flex: 2, marginTop: 0 }} onClick={saveForm} disabled={saving}>
                <IconCheck /> {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to contents'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
