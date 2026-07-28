import { useState, useRef, useEffect } from 'react'

// A searchable dropdown for picking one option out of a (potentially long)
// list — used in place of a flat <select> for location/parent pickers,
// which get unwieldy once every container/location is a candidate parent.
//
// options: [{ value, label, sub }]  (sub is optional secondary text)
// value: currently selected option's value ('' for none)
// onChange(value)
// emptyLabel: label shown for the "no selection" option (default 'Unassigned')
export default function SearchableSelect({ options, value, onChange, placeholder, emptyLabel = 'Unassigned', style }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const allOptions = [{ value: '', label: emptyLabel }, ...options]
  const filtered = query.trim()
    ? allOptions.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : allOptions

  function openMenu() {
    setQuery('')
    setActiveIndex(0)
    setOpen(true)
  }

  function pick(opt) {
    onChange(opt.value)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { openMenu(); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIndex]) pick(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div className="combo" ref={rootRef} style={style}>
      <input
        ref={inputRef}
        value={open ? query : (selected ? selected.label : '')}
        placeholder={open ? 'Type to search…' : (placeholder || emptyLabel)}
        onFocus={openMenu}
        onChange={e => { setQuery(e.target.value); setActiveIndex(0); if (!open) setOpen(true) }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && (
        <div className="combo-menu">
          {filtered.length === 0 ? (
            <div className="combo-empty">No matches</div>
          ) : (
            filtered.map((opt, i) => (
              <div
                key={opt.value || '__empty__'}
                className={`combo-option${i === activeIndex ? ' active' : ''}${opt.value === value ? ' selected' : ''}`}
                onMouseDown={e => { e.preventDefault(); pick(opt) }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span>{opt.label}</span>
                {opt.sub && <span className="combo-option-sub">{opt.sub}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
