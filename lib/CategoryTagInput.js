import { useState, useRef, useEffect } from 'react'

// Multi-value "type to add a category" input. Selected categories render
// as removable chips; typing filters existing category names, and a name
// that doesn't match anything can be added as a new category on save
// (categories are found-or-created server-side, see api/contents.js).
//
// value: string[] of currently selected category names
// onChange(newValue: string[])
// suggestions: string[] of all known category names for this user
export default function CategoryTagInput({ value, onChange, suggestions = [], placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function addCategory(name) {
    const clean = name.trim()
    if (!clean) return
    if (value.some(v => v.toLowerCase() === clean.toLowerCase())) { setQuery(''); return }
    onChange([...value, clean])
    setQuery('')
  }

  function removeCategory(name) {
    onChange(value.filter(v => v !== name))
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (query.trim()) addCategory(query)
    } else if (e.key === 'Backspace' && !query && value.length) {
      removeCategory(value[value.length - 1])
    }
  }

  const filtered = suggestions.filter(s =>
    !value.some(v => v.toLowerCase() === s.toLowerCase()) &&
    (!query.trim() || s.toLowerCase().includes(query.trim().toLowerCase()))
  )
  const queryIsNew = query.trim() && !suggestions.some(s => s.toLowerCase() === query.trim().toLowerCase())

  return (
    <div className="combo" ref={rootRef}>
      <div className="tag-input" onClick={() => setOpen(true)}>
        {value.map(v => (
          <span key={v} className="chip purple tag-chip">
            {v}
            <button type="button" onClick={e => { e.stopPropagation(); removeCategory(v) }} aria-label={`Remove ${v}`}>×</button>
          </span>
        ))}
        <input
          value={query}
          placeholder={value.length ? '' : (placeholder || 'Type to add a category…')}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (filtered.length > 0 || queryIsNew) && (
        <div className="combo-menu">
          {filtered.map(s => (
            <div key={s} className="combo-option" onMouseDown={e => { e.preventDefault(); addCategory(s) }}>
              <span>{s}</span>
            </div>
          ))}
          {queryIsNew && (
            <div className="combo-option combo-create" onMouseDown={e => { e.preventDefault(); addCategory(query) }}>
              Create "{query.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  )
}
