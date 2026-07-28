import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  IconPackage, IconLayers, IconCheck, IconNfc, IconEdit, IconNote,
  IconSitemap, IconTrash, IconTool, IconArrowRight, IconPlus, IconCamera
} from '../lib/icons'
import { apiFetch } from '../lib/apiFetch'
import SearchableSelect from '../lib/SearchableSelect'
import CategoryTagInput from '../lib/CategoryTagInput'
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
  const [draftRow, setDraftRow] = useState(null)
  const [savingDraft, setSavingDraft] = useState(false)
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
    if (status === 'new' || view === 'edit') {
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

  // Commits the in-table draft row (blank Name/Categories fields that
  // appear directly above the contents list when "Add item" is clicked).
  // continueAdding leaves a fresh blank draft row in place afterward, so
  // typing a name and hitting Enter repeatedly logs one item after another
  // without reopening a separate form each time.
  async function commitDraftRow(continueAdding) {
    if (!draftRow) return
    const hasContent = draftRow.item_name.trim() || draftRow.categories.length > 0
    if (!hasContent) {
      setDraftRow(continueAdding ? { item_name: '', categories: [] } : null)
      return
    }

    setSavingDraft(true)
    const r = await apiFetch('/api/contents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draftRow, parent_item_id: item.id })
    })
    const data = await r.json()
    setSavingDraft(false)
    if (!r.ok) return alert(data.error)
    setDraftRow(continueAdding ? { item_name: '', categories: [] } : null)
    loadContents(item.id)
    const newCategories = data.content?.categories || []
    setCategorySuggestions(c => [...new Set([...c, ...newCategories])].sort())
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

  return (
    <>
      <Head>
        <title>{item ? item.name : 'Workshop'} · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#1a1a19" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" />
      </Head>

      <div className="page" style={{ paddingTop: 64, maxWidth: status === 'known' && (view === 'main' || view === 'edit') ? 900 : undefined }}>

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
                  <SearchableSelect
                    value={form.parent_id}
                    onChange={v => setForm(f => ({ ...f, parent_id: v }))}
                    emptyLabel="— unassigned —"
                    options={allItems.filter(i => i.type === 'location').map(loc => ({ value: loc.id, label: loc.name }))}
                  />
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
              <div className="scan-grid">
              <div className="scan-col-main">
                <div className="card" style={{ border: `2px solid ${item.type === 'location' ? 'var(--blue-text)' : 'var(--purple-border)'}` }}>
                  {(item.photo_url || loggedIn) && (
                    <div style={{ background: item.type === 'location' ? 'var(--blue-bg)' : 'var(--purple-bg)', borderRadius: 'var(--radius-sm)', padding: 6, marginBottom: 14 }}>
                      {item.photo_url ? (
                        <a href={item.photo_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', aspectRatio: '4 / 3' }}>
                          <img
                            src={item.photo_url}
                            alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer', borderRadius: 4 }}
                          />
                        </a>
                      ) : (
                        <div style={{ width: '100%', aspectRatio: '4 / 3', background: 'var(--bg2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
                          No photo yet
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <div className="item-head">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {view !== 'edit' && (
                          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: item.type === 'location' ? 'var(--blue-text)' : 'var(--purple-text)', marginBottom: 4 }}>
                            {item.type === 'location' ? 'Location' : 'Container'}
                          </div>
                        )}
                        {view === 'edit' ? (
                          <input
                            value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            style={{ fontWeight: 600, fontSize: 22, padding: '4px 8px' }}
                          />
                        ) : (
                          <div className="item-name-lg">{item.name}</div>
                        )}
                      </div>

                      {loggedIn && (
                        <button
                          className={`action-btn${view === 'edit' ? ' primary' : ''}`}
                          style={{ flexDirection: 'row', gap: 6, padding: '8px 12px', fontSize: 13, flexShrink: 0 }}
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
                        <label
                          className="btn-primary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '8px 12px', cursor: 'pointer', flexShrink: 0 }}
                        >
                          <IconCamera />
                          {uploadingPhoto ? 'Uploading…' : item.photo_url ? 'Replace' : 'Add photo'}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            disabled={uploadingPhoto}
                            onChange={e => uploadPhoto(e.target.files?.[0])}
                          />
                        </label>
                      )}

                      {view === 'edit' && (
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
                      )}
                    </div>

                    {item.parent_id && itemPath && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, fontFamily: 'monospace', wordBreak: 'break-word' }}>
                        {itemPath}
                      </div>
                    )}

                    <div className="meta">
                      <div className="meta-row">
                        <IconSitemap />
                        <span className="meta-label">Location</span>
                        {view === 'edit' ? (
                          <SearchableSelect
                            style={{ marginLeft: 'auto', width: '60%' }}
                            value={editForm.parent_id}
                            onChange={v => setEditForm(f => ({ ...f, parent_id: v }))}
                            options={allItems.filter(i => i.id !== item.id).map(i => ({ value: i.id, label: i.name, sub: i.type }))}
                          />
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
                      {view === 'edit' ? (
                        <div className="meta-row">
                          <IconNote />
                          <span className="meta-label">Notes</span>
                          <input
                            value={editForm.notes}
                            onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Notes…"
                            style={{ marginLeft: 'auto', width: '60%', fontSize: 13, padding: '3px 8px' }}
                          />
                        </div>
                      ) : item.notes ? (
                        <div className="meta-row">
                          <IconNote />
                          <span className="meta-value" style={{ marginLeft: 0 }}>{item.notes}</span>
                        </div>
                      ) : null}
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
                </div>
              </div>

              <div className="scan-col-side">
                <div className="card">
                  {contents.length === 0 && children.length === 0 && !draftRow ? (
                    <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '12px 0' }}>
                      No items logged yet
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border2)', textAlign: 'left' }}>
                            {['Name', 'Categories', ...(loggedIn ? [''] : [])].map(h => (
                              <th key={h} style={{ padding: '6px 8px', color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {draftRow && (
                            <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                              <td style={{ padding: '4px 6px' }}>
                                <input
                                  autoFocus
                                  placeholder="Item name…"
                                  value={draftRow.item_name}
                                  onChange={e => setDraftRow(d => ({ ...d, item_name: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') commitDraftRow(true) }}
                                  style={{ fontSize: 12, padding: '4px 6px' }}
                                />
                              </td>
                              <td style={{ padding: '4px 6px' }}>
                                <CategoryTagInput
                                  value={draftRow.categories}
                                  onChange={v => setDraftRow(d => ({ ...d, categories: v }))}
                                  suggestions={categorySuggestions}
                                />
                              </td>
                              {loggedIn && (
                                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                  <button className="btn-ghost" style={{ padding: '3px 7px' }} onClick={() => commitDraftRow(false)} disabled={savingDraft} aria-label="Save item">
                                    <IconCheck />
                                  </button>
                                  <button className="btn-ghost" style={{ padding: '3px 7px' }} onClick={() => setDraftRow(null)} aria-label="Discard">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                  </button>
                                </td>
                              )}
                            </tr>
                          )}
                          {children.map(c => (
                            <tr
                              key={c.id}
                              style={{ borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }}
                              onClick={() => router.push(`/scan?id=${c.id}`)}
                            >
                              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{c.name}</td>
                              <td style={{ padding: '6px 8px' }}>
                                {c.type === 'location' ? 'Location' : 'Container'}
                              </td>
                              {loggedIn && <td style={{ padding: '6px 8px' }} />}
                            </tr>
                          ))}
                          {contents.map(row => {
                            const displayName = row.item_name || row.categories?.[0] || '—'
                            return (
                              <tr
                                key={row.id}
                                style={{ borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }}
                                onClick={() => router.push(`/entry?id=${row.id}`)}
                              >
                                <td style={{ padding: '6px 8px', fontWeight: 500 }}>{displayName}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  {row.categories?.length ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                      {row.categories.map(c => <span key={c} className="chip purple">{c}</span>)}
                                    </div>
                                  ) : '—'}
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
              </div>
              </div>

                {loggedIn && (
                  <div className="action-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <button className="action-btn" onClick={() => setDraftRow(d => d || { item_name: '', categories: [] })}>
                      <IconPlus /> Add item
                    </button>
                  </div>
                )}
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
