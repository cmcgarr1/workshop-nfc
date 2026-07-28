import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { IconArrowLeft, IconTool, IconCheck, IconTrash } from '../lib/icons'
import { apiFetch } from '../lib/apiFetch'
import SearchableSelect from '../lib/SearchableSelect'
import { useAuth } from './_app'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function EntryPage() {
  const router = useRouter()
  const { loggedIn } = useAuth()
  const { id } = router.query

  const [entry, setEntry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [allItems, setAllItems] = useState([])
  const [categorySuggestions, setCategorySuggestions] = useState([])

  useEffect(() => {
    if (!id) return
    apiFetch(`/api/contents?id=${id}`)
      .then(r => r.json())
      .then(d => {
        const row = (d.contents || []).find(r => r.id === id) || d.contents?.[0] || null
        setEntry(row)
        if (row) setForm({
          item_name: row.item_name || '',
          description: row.description || '',
          category: row.category || '',
          date_acquired: row.date_acquired ? row.date_acquired.slice(0, 10) : '',
          parent_item_id: row.parent_item_id || ''
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))

    apiFetch('/api/items')
      .then(r => r.json())
      .then(d => setAllItems(d.items || []))
    apiFetch('/api/contents?categories_only=1')
      .then(r => r.json())
      .then(d => setCategorySuggestions(d.categories || []))
  }, [id])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function saveEdit() {
    setSaving(true)
    const r = await apiFetch(`/api/contents?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) return alert(data.error)
    setEntry(data.content)
    setEditing(false)
    showToast('Saved!')
  }

  async function deleteEntry() {
    if (!confirm('Delete this entry?')) return
    await apiFetch(`/api/contents?id=${id}`, { method: 'DELETE' })
    router.back()
  }

  const displayName = entry?.item_name || entry?.category || 'Entry'

  return (
    <>
      <Head>
        <title>{displayName} · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="page">
        <div className="topbar">
          <div className="topbar-logo"><IconTool /></div>
          <h1>Workshop</h1>
        </div>

        <div className="back-link" onClick={() => router.back()}>
          <IconArrowLeft /> Back
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" />Loading…</div>
        ) : !entry ? (
          <div className="error-box">Entry not found.</div>
        ) : editing ? (
          <div className="card">
            <div className="form-group">
              <label className="form-label">Item name</label>
              <input value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))} placeholder="e.g. Cordless drill" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. 4 in, 24V" />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Type to see suggestions…"
                list="category-suggestions"
                spellCheck="true"
                autoCorrect="on"
                autoCapitalize="words"
              />
              <datalist id="category-suggestions">
                {categorySuggestions.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Date acquired</label>
              <div className="meta-value" style={{ textAlign: 'left' }}>{fmtDate(entry.date_acquired)}</div>
              <div className="form-hint">Set automatically when the item was added — doesn't change on edit.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Location (box/shelf)</label>
              <SearchableSelect
                value={form.parent_item_id}
                onChange={v => setForm(f => ({ ...f, parent_item_id: v }))}
                options={allItems.map(i => ({ value: i.id, label: i.name, sub: i.type }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="btn-primary save-btn" style={{ flex: 1 }} onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : <><IconCheck /> Save</>}
              </button>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="item-head">
              <div className="item-icon">
                <IconTool />
              </div>
              <div>
                <div className="item-name">{displayName}</div>
                {entry.path && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', marginTop: 2 }}>
                    {entry.path}
                  </div>
                )}
              </div>
              {entry.category && (
                <span className="chip purple" style={{ marginLeft: 'auto' }}>{entry.category}</span>
              )}
            </div>

            <div className="meta">
              {entry.item_name && (
                <div className="meta-row">
                  <span className="meta-label">Item</span>
                  <span className="meta-value">{entry.item_name}</span>
                </div>
              )}
              {entry.description && (
                <div className="meta-row">
                  <span className="meta-label">Description</span>
                  <span className="meta-value">{entry.description}</span>
                </div>
              )}
              <div className="meta-row">
                <span className="meta-label">Location</span>
                <span className="meta-value" style={{ cursor: entry.parent_item_id ? 'pointer' : 'default' }}
                  onClick={() => entry.parent_item_id && router.push(`/scan?id=${entry.parent_item_id}`)}>
                  {entry.box_name || 'Unassigned'}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Added</span>
                <span className="meta-value">{fmtDate(entry.date_added)}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Acquired</span>
                <span className="meta-value">{fmtDate(entry.date_acquired)}</span>
              </div>
            </div>

            {loggedIn && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn-ghost save-btn" style={{ flex: 1 }} onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button className="btn-danger" style={{ padding: '10px 14px' }} onClick={deleteEntry}>
                  <IconTrash />
                </button>
              </div>
            )}
          </div>
        )}

        {toast && (
          <div className="success-toast">
            <IconCheck /> {toast}
          </div>
        )}
      </div>
    </>
  )
}
