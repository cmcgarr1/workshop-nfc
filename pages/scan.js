import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  IconPackage, IconLayers, IconCheck, IconNfc, IconEdit,
  IconMove, IconList, IconArrowLeft, IconTag, IconNote,
  IconSitemap, IconTrash, IconTool, IconArrowRight, IconPlus
} from '../lib/icons'
import { apiFetch } from '../lib/apiFetch'
import { useAuth } from './_app'

function genId(name) {
  const base = name
    ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20)
    : 'item'
  return base + '-' + Math.random().toString(36).slice(2, 6)
}

export default function ScanPage() {
  const router = useRouter()
  const { loggedIn } = useAuth()
  const { id, prefill_name } = router.query

  const [status, setStatus] = useState('loading')
  const [item, setItem] = useState(null)
  const [children, setChildren] = useState([])
  const [allItems, setAllItems] = useState([])
  const [view, setView] = useState('main')
  const [toast, setToast] = useState(null)

  const [form, setForm] = useState({ name: '', type: 'container', id: '', parent_id: '', notes: '' })
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  const [contents, setContents] = useState([])
  const [categorySuggestions, setCategorySuggestions] = useState([])
  const [showAddContent, setShowAddContent] = useState(false)
  const [contentForm, setContentForm] = useState({ item_name: '', description: '', category: '', date_acquired: '', is_category: false })
  const [addingContent, setAddingContent] = useState(false)

  function loadContents(parentId) {
    apiFetch(`/api/contents?parent_item_id=${encodeURIComponent(parentId)}`)
      .then(r => r.json())
      .then(d => setContents(d.contents || []))
  }

  useEffect(() => {
    if (!id) return
    apiFetch(`/api/items?id=${encodeURIComponent(id)}`)
      .then(r => {
        if (r.status === 404) {
          setStatus('new')
          // If we arrived here from the new-tag generator page with a name
          // already chosen, carry it straight into the registration form
          // instead of making the person type it again.
          setForm(f => ({ ...f, id, name: prefill_name || f.name }))
          return null
        }
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
        loadContents(data.item.id)
        apiFetch('/api/contents?categories_only=1')
          .then(r => r.json())
          .then(d => setCategorySuggestions(d.categories || []))
      })
      .catch(() => setStatus('error'))
  }, [id, prefill_name])

  useEffect(() => {
    if (status === 'new' || view === 'edit' || view === 'move') {
      apiFetch('/api/items')
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
    const r = await apiFetch('/api/items', {
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
    const r = await apiFetch(`/api/items?id=${encodeURIComponent(id)}`, {
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
    const r = await apiFetch(`/api/items?id=${encodeURIComponent(id)}`, {
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

  async function addContentItem() {
    const payload = contentForm.is_category
      ? { category: contentForm.item_name.trim() }
      : { ...contentForm }

    if (contentForm.is_category && !payload.category) {
      return alert('Please enter a category name')
    }
    if (!contentForm.is_category && !contentForm.item_name.trim() && !contentForm.category.trim()) {
      return alert('Enter an item name, or check Category and enter a category name')
    }

    setAddingContent(true)
    const r = await apiFetch('/api/contents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, parent_item_id: item.id })
    })
    const data = await r.json()
    setAddingContent(false)
    if (!r.ok) return alert(data.error)
    setContentForm({ item_name: '', description: '', category: '', date_acquired: '', is_category: false })
    setShowAddContent(false)
    loadContents(item.id)
    const newCategory = payload.category || contentForm.category
    if (newCategory && !categorySuggestions.includes(newCategory)) {
      setCategorySuggestions(c => [...c, newCategory].sort())
    }
    showToast('Item added!')
  }

  async function deleteContentItem(id) {
    if (!confirm('Remove this item from the contents list?')) return
    await apiFetch(`/api/contents?id=${id}`, { method: 'DELETE' })
    loadContents(item.id)
  }

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function openDeleteItem() {
    if (children.length === 0) {
      if (!confirm(`Delete "${item.name}"?`)) return
      runDelete(false)
    } else {
      setShowDeleteModal(true)
    }
  }

  async function runDelete(cascade) {
    setDeleting(true)
    await apiFetch(`/api/items?id=${encodeURIComponent(id)}${cascade ? '&cascade=true' : ''}`, { method: 'DELETE' })
    setDeleting(false)
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
            Home →
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

        {status === 'new' && !loggedIn && (
          <div className="error-box">
            This tag isn't registered yet. <a onClick={() => router.push('/login')} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Sign in</a> to add it to the workshop.
          </div>
        )}

        {status === 'new' && loggedIn && (
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
                  <select
                    value={form.parent_id}
                    onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                  >
                    <option value="">— unassigned —</option>
                    {allItems.filter(i => i.type === 'location').map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Contents / notes</label>
                <input
                  placeholder="What's inside, or any notes…"
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

                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div className="section-label" style={{ marginBottom: 0 }}>
                      Contents log ({contents.length})
                    </div>
                    {loggedIn && (
                      <button
                        className="btn-ghost"
                        style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                        onClick={() => setShowAddContent(s => !s)}
                      >
                        <IconPlus /> Add item
                      </button>
                    )}
                  </div>

                  {showAddContent && (
                    <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          checked={contentForm.is_category}
                          onChange={e => setContentForm(f => ({ ...f, is_category: e.target.checked }))}
                        />
                        Category <span style={{ color: 'var(--text3)' }}>(no individual item, just a label like "Hand tools")</span>
                      </label>

                      {contentForm.is_category ? (
                        <div className="form-group">
                          <label className="form-label">Category name</label>
                          <input
                            placeholder="e.g. Hand tools"
                            list="category-suggestions"
                            value={contentForm.item_name}
                            onChange={e => setContentForm(f => ({ ...f, item_name: e.target.value }))}
                          />
                          <datalist id="category-suggestions">
                            {categorySuggestions.map(c => <option key={c} value={c} />)}
                          </datalist>
                        </div>
                      ) : (
                        <>
                          <div className="form-group">
                            <label className="form-label">Item name</label>
                            <input
                              placeholder="e.g. Phillips screwdriver"
                              value={contentForm.item_name}
                              onChange={e => setContentForm(f => ({ ...f, item_name: e.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Description</label>
                            <input
                              placeholder="Optional details"
                              value={contentForm.description}
                              onChange={e => setContentForm(f => ({ ...f, description: e.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Category</label>
                            <input
                              placeholder="Type to see suggestions…"
                              list="category-suggestions"
                              value={contentForm.category}
                              onChange={e => setContentForm(f => ({ ...f, category: e.target.value }))}
                            />
                            <datalist id="category-suggestions">
                              {categorySuggestions.map(c => <option key={c} value={c} />)}
                            </datalist>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Date acquired</label>
                            <input
                              type="date"
                              value={contentForm.date_acquired}
                              onChange={e => setContentForm(f => ({ ...f, date_acquired: e.target.value }))}
                            />
                          </div>
                        </>
                      )}

                      <button className="btn-primary save-btn" onClick={addContentItem} disabled={addingContent}>
                        <IconCheck /> {addingContent ? 'Adding…' : 'Add to contents'}
                      </button>
                    </div>
                  )}

                  {contents.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '12px 0' }}>
                      No items logged yet
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border2)', textAlign: 'left' }}>
                            {['Item', 'Description', 'Category', 'Added', 'Acquired', ...(loggedIn ? [''] : [])].map(h => (
                              <th key={h} style={{ padding: '6px 8px', color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {contents.map(row => (
                            <tr key={row.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 500 }}>
                                {row.item_name || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>—</span>}
                              </td>
                              <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{row.description || '—'}</td>
                              <td style={{ padding: '6px 8px' }}>
                                {row.category ? <span className="chip purple">{row.category}</span> : '—'}
                              </td>
                              <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                {new Date(row.date_added).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </td>
                              <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                {row.date_acquired ? new Date(row.date_acquired).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                              </td>
                              {loggedIn && (
                                <td style={{ padding: '6px 8px' }}>
                                  <button className="btn-ghost" style={{ padding: '3px 7px' }} onClick={() => deleteContentItem(row.id)}>
                                    <IconTrash />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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

                <div className="action-grid" style={{ gridTemplateColumns: loggedIn ? '1fr 1fr 1fr' : '1fr' }}>
                  {loggedIn && (
                    <button className="action-btn" onClick={() => { setView('edit'); apiFetch('/api/items').then(r=>r.json()).then(d=>setAllItems(d.items||[])) }}>
                      <IconEdit /> Edit
                    </button>
                  )}
                  {loggedIn && (
                    <button className="action-btn" onClick={() => { setView('move'); apiFetch('/api/items').then(r=>r.json()).then(d=>setAllItems(d.items||[])) }}>
                      <IconMove /> Move
                    </button>
                  )}
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
                    onClick={openDeleteItem}
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

      {showDeleteModal && (
        <div className="modal-bg" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2>Delete "{item.name}"?</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
              This {item.type} has {children.length} sub-item{children.length !== 1 ? 's' : ''} inside it.
              Choose what should happen to them.
            </p>

            <button
              className="btn-danger"
              style={{ width: '100%', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => runDelete(true)}
              disabled={deleting}
            >
              <IconTrash /> Delete this and all {children.length} sub-item{children.length !== 1 ? 's' : ''}
            </button>

            <button
              className="btn-ghost"
              style={{ width: '100%', marginBottom: 8 }}
              onClick={() => runDelete(false)}
              disabled={deleting}
            >
              Delete only this — keep sub-items, unassigned
            </button>

            <button
              className="btn-ghost"
              style={{ width: '100%', borderColor: 'transparent' }}
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
