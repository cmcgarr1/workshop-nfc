import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { IconTool, IconArrowLeft, IconPlus, IconTrash, IconEdit, IconCheck } from '../lib/icons'

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

  const filtered = contents.filter(r => {
    if (!search) return true
    const haystack = `${r.item_name} ${r.description} ${r.category} ${r.box_name} ${r.location_name}`.toLowerCase()
    return haystack.includes(search.toLowerCase())
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

        {loading ? (
          <div className="loading"><div className="spinner" />Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0', fontSize: 14 }}>
            No contents logged yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border2)', textAlign: 'left' }}>
                  {['Item', 'Description', 'Category', 'Date added', 'Date acquired', 'Box', 'Location', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
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
                      {row.location_name !== 'Unassigned'
                        ? <span className="chip blue">{row.location_name}</span>
                        : <span style={{ color: 'var(--text3)' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => openEditForm(row)}>
                        <IconEdit />
                      </button>
                      <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => deleteRow(row.id)}>
                        <IconTrash />
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
