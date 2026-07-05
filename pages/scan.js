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
  const [itemPath, setItemPath] = useState('')
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

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
        setItemPath(data.path || '')
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

  function resizeImage(file, maxDim = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()
      reader.onload = e => { img.src = e.target.result }
      reader.onerror = reject
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * (maxDim / width))
            width = maxDim
          } else {
            width = Math.round(width * (maxDim / height))
            height = maxDim
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('Resize failed'))
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
        }, 'image/jpeg', quality)
      }
      img.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function uploadPhoto(file) {
    if (!file) return
    setUploadingPhoto(true)
    let toUpload = file
    try {
      toUpload = await resizeImage(file)
    } catch {
      // If resizing fails for any reason, fall back to the original file
    }
    const formData = new FormData()
    formData.append('item_id', item.id)
    formData.append('photo', toUpload)
    const r = await apiFetch('/api/upload-photo', { method: 'POST', body: formData })
    const data = await r.json()
    setUploadingPhoto(false)
    if (!r.ok) return alert(data.error)
    setItem(data.item)
    showToast('Photo updated!')
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

      <div className="page" style={{ paddingTop: 64 }}>

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
                <textarea
                  placeholder="What's inside, or any notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  spellCheck="true"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  rows={3}
                  style={{ resize: 'vertical' }}
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
            {(view === 'main' || view === 'edit') && (
              <>
                <div className="flash known">
                  <div className="flash-icon"><IconCheck /></div>
                  <div>
                    <p>Tag recognised</p>
                    <span>Scanned just now</span>
                  </div>
                </div>

                <div className="card">
                  {(item.photo_url || loggedIn) && (
                    <div style={{ marginBottom: 14 }}>
                      {item.photo_url ? (
                        <a href={item.photo_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={item.photo_url}
                            alt={item.name}
                            style={{ width: '100%', maxHeight: 320, objectFit: 'contain', background: 'var(--bg2)', borderRadius: 'var(--radius-sm)', display: 'block', cursor: 'pointer' }}
                          />
                        </a>
                      ) : (
                        <div
                          style={{
                            width: '100%', height: 140, borderRadius: 'var(--radius-sm)',
                            border: '1px dashed var(--border2)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: 'var(--text3)', fontSize: 13
                          }}
                        >
                          No photo yet
                        </div>
                      )}
                      {loggedIn && (
                        <label
                          className="btn-ghost"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}
                        >
                          {uploadingPhoto ? 'Uploading…' : item.photo_url ? 'Replace photo' : 'Add photo'}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            disabled={uploadingPhoto}
                            onChange={e => uploadPhoto(e.target.files?.[0])}
                          />
                        </label>
                      )}
                    </div>
                  )}

                  <div className="item-head">
                    <div className={`item-icon${item.type === 'location' ? ' loc' : ''}`}>
                      {item.type === 'location' ? <IconLayers /> : <IconPackage />}
                    </div>
                    <div style={{ flex: 1 }}>
                      {view === 'edit' ? (
                        <input
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          style={{ fontWeight: 500, fontSize: 17, padding: '4px 8px' }}
                        />
                      ) : (
                        <div className="item-name">{item.name}</div>
                      )}
                      {loggedIn && <div className="item-id">{item.id}</div>}
                    </div>
                    {view === 'edit' ? (
                      <div className="type-toggle" style={{ margin: 0 }}>
                        <button
                          className={`type-opt${editForm.type === 'container' ? ' active' : ''}`}
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => setEditForm(f => ({ ...f, type: 'container' }))}
                        >
                          Container
                        </button>
                        <button
                          className={`type-opt${editForm.type === 'location' ? ' active' : ''}`}
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => setEditForm(f => ({ ...f, type: 'location' }))}
                        >
                          Location
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`chip${item.type === 'location' ? ' blue' : ' purple'}`}
                        style={{ marginLeft: 'auto' }}
                      >
                        {item.type === 'location' ? 'Location' : 'Container'}
                      </span>
                    )}
                  </div>

                  {item.parent_id && itemPath && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, fontFamily: 'monospace', wordBreak: 'break-word' }}>
                      {itemPath}
                    </div>
                  )}

                  <div className="meta">
                    <div className="meta-row">
                      <IconNote />
                      <span className="meta-label">Notes</span>
                      {view === 'edit' ? (
                        <input
                          value={editForm.notes}
                          onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="Notes…"
                          style={{ marginLeft: 'auto', width: '60%', fontSize: 13, padding: '3px 8px' }}
                        />
                      ) : (
                        <span className="meta-value">{item.notes || <span style={{ color: 'var(--text3)' }}>—</span>}</span>
                      )}
                    </div>
                    <div className="meta-row">
                      <IconSitemap />
                      <span className="meta-label">Location</span>
                      {view === 'edit' ? (
                        <select
                          value={editForm.parent_id}
                          onChange={e => setEditForm(f => ({ ...f, parent_id: e.target.value }))}
                          style={{ marginLeft: 'auto', width: '60%', fontSize: 13, padding: '3px 8px' }}
                        >
                          <option value="">Unassigned</option>
                          {allItems.filter(i => i.id !== item.id).map(i => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="meta-value">
                          {item.parent_id
                            ? <span className="chip blue">
                                {allItems.find(i => i.id === item.parent_id)?.name || item.parent_id}
                              </span>
                            : <span style={{ color: 'var(--text3)' }}>Unassigned</span>
                          }
                        </span>
                      )}
                    </div>
                    {loggedIn && (
                      <div className="meta-row">
                        <IconTag />
                        <span className="meta-label">NFC tag</span>
                        <span className="meta-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.id}</span>
                      </div>
                    )}
                  </div>

                  {view === 'edit' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button className="btn-primary save-btn" style={{ flex: 1 }} onClick={saveEdit} disabled={saving}>
                        <IconCheck /> {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn-ghost" style={{ padding: '10px 14px' }} onClick={() => setView('main')}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="card">
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
                            {['Name', 'Category', ...(loggedIn ? [''] : [])].map(h => (
                              <th key={h} style={{ padding: '6px 8px', color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {contents.map(row => {
                            const displayName = row.item_name || row.category || '—'
                            return (
                              <tr
                                key={row.id}
                                style={{ borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }}
                                onClick={() => router.push(`/entry?id=${row.id}`)}
                              >
                                <td style={{ padding: '6px 8px', fontWeight: 500 }}>{displayName}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  {row.category ? <span className="chip purple">{row.category}</span> : '—'}
                                </td>
                                {loggedIn && (
                                  <td style={{ padding: '6px 8px' }} onClick={e => e.stopPropagation()}>
                                    <button className="btn-ghost" style={{ padding: '3px 7px' }} onClick={() => deleteContentItem(row.id)}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                      </svg>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
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

                <div className="action-grid" style={{ gridTemplateColumns: loggedIn ? '1fr 1fr 1fr 1fr' : '1fr' }}>
                  {loggedIn && (
                    <button className="action-btn" onClick={() => setShowAddContent(s => !s)}>
                      <IconPlus /> Add item
                    </button>
                  )}
                  {loggedIn && (
                    <button
                      className={`action-btn${view === 'edit' ? ' primary' : ''}`}
                      onClick={() => {
                        if (view === 'edit') { setView('main') } else {
                          setView('edit')
                          apiFetch('/api/items').then(r => r.json()).then(d => setAllItems(d.items || []))
                        }
                      }}
                    >
                      <IconEdit /> {view === 'edit' ? 'Done' : 'Edit'}
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
