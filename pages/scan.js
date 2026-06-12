import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  IconPackage, IconLayers, IconCheck, IconNfc, IconEdit,
  IconMove, IconList, IconArrowLeft, IconTag, IconNote,
  IconSitemap, IconTrash, IconTool, IconArrowRight
} from '../lib/icons'

function genId(name) {
  const base = name
    ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20)
    : 'item'
  return base + '-' + Math.random().toString(36).slice(2, 6)
}

export default function ScanPage() {
  const router = useRouter()
  const { id } = router.query

  const [status, setStatus] = useState('loading')
  const [item, setItem] = useState(null)
  const [children, setChildren] = useState([])
  const [allItems, setAllItems] = useState([])
  const [view, setView] = useState('main')
  const [toast, setToast] = useState(null)

  const [form, setForm] = useState({ name: '', type: 'container', id: '', parent_id: '', notes: '' })
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/items?id=${encodeURIComponent(id)}`)
      .then(r => {
        if (r.status === 404) { setStatus('new'); setForm(f => ({ ...f, id })); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setItem(data.item)
        setChildren(data.children)
        setStatus('known')
        setEditForm({
          name: data.item.name,
          type: data.item.type,
          parent_id: data.item.parent_id || '',
          notes: data.item.notes || ''
        })
      })
      .catch(() => setStatus('error'))
  }, [id])

  useEffect(() => {
    if (status === 'new' || view === 'edit' || view === 'move') {
      fetch('/api/items')
        .then(r => r.json())
        .then(d => setAllItems(d.items || []))
    }
  }, [status, view])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function registerItem() {
    if (!form.name.trim()) return alert('Please enter a name')
    if (!form.id.trim()) return alert('Please enter an ID')
    setSaving(true)
    const r = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, parent_id: form.parent_id || null })
    })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) return alert(data.error)
    setItem(data.item)
    setChildren([])
    setStatus('known')
    showToast('Tag registered!')
  }

  async function saveEdit() {
    setSaving(true)
    const r = await fetch(`/api/items?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, parent_id: editForm.parent_id || null })
    })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) return alert(data.error)
    setItem(data.item)
    setView('main')
    showToast('Saved!')
  }

  async function moveItem(newParentId) {
    const r = await fetch(`/api/items?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, parent_id: newParentId || null })
    })
    const data = await r.json()
    if (!r.ok) return alert(data.error)
    setItem(data.item)
    setView('main')
    showToast('Moved!')
  }

  async function deleteItem() {
    if (!confirm(`Delete "${item.name}"? Children will be unassigned.`)) return
    await fetch(`/api/items?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    router.push('/inventory')
  }

  const parentItem = item && allItems.find(i => i.id === item.parent_id)
  const locations = allItems.filter(i => i.type === 'location' && i.id !== id)

  return (
    <>
      <Head>
        <title>{item ? item.name : 'Workshop'} · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#1a1a19" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" />
      </Head>

      <div className="page">
        <div className="topbar">
          <div className="topbar-logo">
            <IconTool />
          </div>
          <h1>Workshop</h1>
          <span className="topbar-sub" style={{ cursor: 'pointer' }} onClick={() => router.push('/inventory')}>
            Inventory →
          </span>
        </div>

        {status === 'loading' && (
          <div className="loading">
            <div className="spinner" />
            Looking up tag…
          </div>
        )}

        {status === 'error' && (
          <div className="error-box">Something went wrong. Try scanning again.</div>
        )}

        {status === 'new' && (
          <>
            <div className="flash new">
              <div className="flash-icon"><IconNfc /></div>
              <div>
                <p>New tag detected</p>
                <span>Register it to your workshop</span>
              </div>
            </div>

            <div className="card">
              <div className="section-label" style={{ marginBottom: 12 }}>What is this?</div>
              <div className="type-toggle">
                <button
                  className={`type-opt${form.type === 'container' ? ' active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, type: 'container' }))}
                >
                  <IconPackage /> Container
                </button>
                <button
                  className={`type-opt${form.type === 'location' ? ' active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, type: 'location' }))}
                >
                  <IconLayers /> Location
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  placeholder={form.type === 'container' ? 'e.g. Red toolbox, Blue bin…' : 'e.g. North shelf, Workbench…'}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Tag ID <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(pre-filled from scan)</span>
                </label>
                <div className="id-row">
                  <input className="prefilled" value={form.id} readOnly />
                  <button className="btn-ghost" onClick={() => setForm(f => ({ ...f, id: genId(form.name) }))}>
                    Rename
                  </button>
                </div>
                <div className="form-hint">This ID is encoded on the physical NFC tag</div>
              </div>

              {form.type === 'container' && (
                <div className="form-group">
                  <label className="form-label">Parent location</label>
                  <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}>
                    <option value="">— unassigned —</option>
                    {allItems.filter(i => i.type === 'location').map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Contents / notes</label>
                <input
                  placeholder="What's inside? Any useful notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <button className="btn-primary save-btn" onClick={registerItem} disabled={saving}>
                <IconCheck /> {saving ? 'Registering…' : 'Register tag'}
              </button>
            </div>
          </>
        )}

        {status === 'known' && item && (
          <>
            {view === 'main' && (
              <>
                <div className="flash known">
                  <div className="flash-icon"><IconCheck /></div>
                  <div>
                    <p>Tag recognised</p>
                    <span>Scanned just now</span>
                  </div>
                </div>

                <div className="card">
                  <div className="item-head">
                    <div className={`item-icon${item.type === 'location' ? ' loc' : ''}`}>
                      {item.type === 'location' ? <IconLayers /> : <IconPackage />}
                    </div>
                    <div>
                      <div className="item-name">{item.name}</div>
                      <div className="item-id">{item.id}</div>
                    </div>
                    <span
                      className={`chip${item.type === 'location' ? ' blue' : ' purple'}`}
                      style={{ marginLeft: 'auto' }}
                    >
                      {item.type === 'location' ? 'Location' : 'Container'}
                    </span>
                  </div>

                  <div className="meta">
                    {item.notes && (
                      <div className="meta-row">
                        <IconNote />
                        <span className="meta-label">Contents</span>
                        <span className="meta-value">{item.notes}</span>
                      </div>
                    )}
                    <div className="meta-row">
                      <IconSitemap />
                      <span className="meta-label">Location</span>
                      <span className="meta-value">
                        {item.parent_id
                          ? <span className="chip blue">
                              {allItems.find(i => i.id === item.parent_id)?.name || item.parent_id}
                            </span>
                          : <span style={{ color: 'var(--text3)' }}>Unassigned</span>
                        }
                      </span>
                    </div>
                    <div className="meta-row">
                      <IconTag />
                      <span className="meta-label">NFC tag</span>
                      <span className="meta-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.id}</span>
                    </div>
                  </div>
                </div>

                {children.length > 0 && (
                  <div className="card">
                    <div className="section-label">Contains ({children.length})</div>
                    <div className="children-grid">
                      {children.map(c => (
                        <div key={c.id} className="child-tag" onClick={() => router.push(`/scan?id=${c.id}`)}>
                          <IconPackage /> {c.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="action-grid">
                  <button className="action-btn" onClick={() => { setView('edit'); fetch('/api/items').then(r=>r.json()).then(d=>setAllItems(d.items||[])) }}>
                    <IconEdit /> Edit
                  </button>
                  <button className="action-btn" onClick={() => { setView('move'); fetch('/api/items').then(r=>r.json()).then(d=>setAllItems(d.items||[])) }}>
                    <IconMove /> Move
                  </button>
                  <button className="action-btn primary" onClick={() => router.push('/inventory')}>
                    <IconList /> Inventory
                  </button>
                </div>
              </>
            )}

            {view === 'edit' && (
              <>
                <div className="back-link" onClick={() => setView('main')}>
                  <IconArrowLeft /> Back
                </div>
                <div className="card">
                  <div className="section-label" style={{ marginBottom: 14 }}>Edit item</div>

                  <div className="type-toggle">
                    <button
                      className={`type-opt${editForm.type === 'container' ? ' active' : ''}`}
                      onClick={() => setEditForm(f => ({ ...f, type: 'container' }))}
                    >
                      <IconPackage /> Container
                    </button>
                    <button
                      className={`type-opt${editForm.type === 'location' ? ' active' : ''}`}
                      onClick={() => setEditForm(f => ({ ...f, type: 'location' }))}
                    >
                      <IconLayers /> Location
                    </button>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Parent location</label>
                    <select value={editForm.parent_id || ''} onChange={e => setEditForm(f => ({ ...f, parent_id: e.target.value }))}>
                      <option value="">— unassigned —</option>
                      {locations.map(i => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contents / notes</label>
                    <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>

                  <button className="btn-primary save-btn" onClick={saveEdit} disabled={saving}>
                    <IconCheck /> {saving ? 'Saving…' : 'Save changes'}
                  </button>

                  <button
                    className="btn-danger"
                    style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={deleteItem}
                  >
                    <IconTrash /> Delete item
                  </button>
                </div>
              </>
            )}

            {view === 'move' && (
              <>
                <div className="back-link" onClick={() => setView('main')}>
                  <IconArrowLeft /> Back
                </div>
                <div className="card">
                  <div className="section-label" style={{ marginBottom: 12 }}>Move to location</div>
                  <div
                    className="inv-item"
                    style={{ borderColor: !item.parent_id ? 'var(--purple-border)' : undefined }}
                    onClick={() => moveItem(null)}
                  >
                    <div className="inv-item-icon loc"><IconLayers /></div>
                    <div>
                      <div className="inv-item-name">Unassigned</div>
                      <div className="inv-item-sub">Remove from current location</div>
                    </div>
                    {!item.parent_id && <span className="chip purple" style={{ marginLeft: 'auto' }}>Current</span>}
                  </div>
                  {locations.map(loc => (
                    <div
                      key={loc.id}
                      className="inv-item"
                      style={{ borderColor: item.parent_id === loc.id ? 'var(--purple-border)' : undefined }}
                      onClick={() => moveItem(loc.id)}
                    >
                      <div className="inv-item-icon loc"><IconLayers /></div>
                      <div>
                        <div className="inv-item-name">{loc.name}</div>
                        <div className="inv-item-sub">{loc.notes || loc.id}</div>
                      </div>
                      {item.parent_id === loc.id && (
                        <span className="chip purple" style={{ marginLeft: 'auto' }}>Current</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="success-toast">
          <IconCheck /> {toast}
        </div>
      )}
    </>
  )
}
