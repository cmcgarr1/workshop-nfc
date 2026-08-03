import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { IconDoor, IconPackage, IconTag, IconPlus, IconNfc } from '../lib/icons'
import { apiFetch } from '../lib/apiFetch'
import { useAuth } from './_app'

// One level of the workshop is on screen at a time: the boxes here are the
// children of whatever you last drilled into, and the breadcrumb walks back
// out. The whole tree is fetched once (79 rows today) and drilling is pure
// client state — no per-level round trips.

// How long the pop-out of the old level runs before the next level is swapped
// in. Must stay in sync with the .bx.pop / .bx.chosen durations in globals.css.
const SWAP_MS = 320

// Entrance stagger per box, and the index at which the stagger stops growing —
// a room with 15 containers shouldn't take a full second to finish arriving.
const STAGGER_S = 0.06
const STAGGER_CAP = 8

// A card previews one level down only. Deeper nesting is what drilling in is
// for, and these caps keep a busy room's card the same size as a quiet one's.
const PREVIEW_CONTAINERS = 3
const PREVIEW_ITEMS = 4

// Rows are as square as possible: 5 boxes go 3+2, never 4+1.
function balancedCols(n, maxCols) {
  if (n <= 1) return 1
  const rows = Math.ceil(n / maxCols)
  return Math.ceil(n / rows)
}

export default function InventoryPage() {
  const router = useRouter()
  const { loggedIn } = useAuth()

  const [items, setItems] = useState([])
  const [categoriesById, setCategoriesById] = useState({})
  const [loading, setLoading] = useState(true)

  // `at` is the URL's idea of where we are; `displayAt` is what's rendered.
  // They diverge only for the length of a transition — the clicked box has to
  // finish popping before the next level replaces it.
  const [displayAt, setDisplayAt] = useState(null)
  const [phase, setPhase] = useState('in')
  const [chosenId, setChosenId] = useState(null)
  const [gen, setGen] = useState(0)
  const animatingRef = useRef(false)
  const timerRef = useRef(null)

  const [maxCols, setMaxCols] = useState(2)
  const [reduceMotion, setReduceMotion] = useState(false)

  // Companion-app bits, mirrored from the Audit page: inside the WebView the
  // fab offers a native NFC scan, in a browser it just goes to /new-tag.
  const [inApp, setInApp] = useState(false)
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const [scanning, setScanning] = useState(false)

  const at = typeof router.query.at === 'string' ? router.query.at : null

  useEffect(() => {
    setInApp(typeof window !== 'undefined' && !!window.ReactNativeWebView)
  }, [])

  useEffect(() => {
    if (!inApp) return
    window.onNfcScanResult = (result) => {
      setScanning(false)
      if (result?.ok) {
        router.push(result.url.replace(/^https?:\/\/[^/]+/, ''))
      } else {
        alert(result?.error || 'Could not read the tag. Try again.')
      }
    }
    return () => { delete window.onNfcScanResult }
  }, [inApp, router])

  useEffect(() => {
    const cols = window.matchMedia('(min-width: 620px)')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const applyCols = () => setMaxCols(cols.matches ? 4 : 2)
    const applyMotion = () => setReduceMotion(motion.matches)
    applyCols()
    applyMotion()
    cols.addEventListener('change', applyCols)
    motion.addEventListener('change', applyMotion)
    return () => {
      cols.removeEventListener('change', applyCols)
      motion.removeEventListener('change', applyMotion)
    }
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    apiFetch('/api/items')
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false) })
      .catch(() => setLoading(false))
    // Category names live on the tools feed, which already joins through
    // item_categories — no need for a second junction fetch here.
    apiFetch('/api/contents')
      .then(r => r.json())
      .then(d => {
        const map = {}
        ;(d.contents || []).forEach(row => {
          if (row.categories?.length) map[row.id] = row.categories
        })
        setCategoriesById(map)
      })
      .catch(() => {})
  }, [])

  // The URL is the source of truth for the level; this effect is what actually
  // swaps the rendered level, whether the change came from a box click or from
  // the browser's back button.
  useEffect(() => {
    if (!router.isReady) return
    if (at === displayAt) return
    setDisplayAt(at)
    setChosenId(null)
    setPhase('in')
    setGen(g => g + 1)
    animatingRef.current = false
  }, [at, displayAt, router.isReady])

  const byId = useMemo(() => {
    const map = {}
    items.forEach(i => { map[i.id] = i })
    return map
  }, [items])

  const childrenOf = useMemo(() => {
    const map = {}
    items.forEach(i => {
      // A row whose parent_id points at nothing is treated as top level rather
      // than hidden — otherwise it would be unreachable in the explorer.
      const key = i.parent_id && byId[i.parent_id] ? i.parent_id : '__root__'
      if (!map[key]) map[key] = []
      map[key].push(i)
    })
    Object.values(map).forEach(list => list.sort((a, b) => {
      const rank = t => (t === 'location' ? 0 : t === 'container' ? 1 : 2)
      return rank(a.type) - rank(b.type) || (a.name || '').localeCompare(b.name || '')
    }))
    return map
  }, [items, byId])

  const current = displayAt ? byId[displayAt] : null
  const boxes = childrenOf[displayAt || '__root__'] || []

  const trail = useMemo(() => {
    const path = []
    let node = current
    const seen = new Set()
    while (node && !seen.has(node.id)) {
      seen.add(node.id)
      path.unshift(node)
      node = node.parent_id ? byId[node.parent_id] : null
    }
    return path
  }, [current, byId])

  const go = useCallback((id) => {
    const url = id ? `/inventory?at=${encodeURIComponent(id)}` : '/inventory'
    // Clearing the guard here as well as in the swap effect: if the push ever
    // lands on the level we're already showing, the effect bails early and
    // this is the only thing that would let the next click through.
    router.push(url, undefined, { shallow: true }).finally(() => {
      animatingRef.current = false
    })
  }, [router])

  function drill(id) {
    if (animatingRef.current) return
    if (id === displayAt) return
    if (reduceMotion) { go(id); return }
    animatingRef.current = true
    setChosenId(id)
    setPhase('out')
    timerRef.current = setTimeout(() => go(id), SWAP_MS)
  }

  function openBox(box) {
    // Tools are leaves here — they hand off to the existing entry page rather
    // than drilling into an empty level.
    if (box.type === 'item') router.push(`/entry?id=${encodeURIComponent(box.id)}`)
    else drill(box.id)
  }

  function pressFab() {
    if (!inApp) { router.push('/new-tag'); return }
    setFabMenuOpen(open => !open)
  }

  function pressFabScan() {
    setFabMenuOpen(false)
    setScanning(true)
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCAN_NFC' }))
  }

  const cols = balancedCols(boxes.length, maxCols)

  function boxClass(id) {
    const cls = ['bx', `bx-${byId[id]?.type || 'container'}`]
    if (phase === 'out') cls.push(id === chosenId ? 'chosen' : 'pop')
    return cls.join(' ')
  }

  function boxDelay(index) {
    if (reduceMotion || phase === 'out') return '0s'
    return `${Math.min(index, STAGGER_CAP) * STAGGER_S}s`
  }

  function Preview({ box }) {
    const kids = childrenOf[box.id] || []
    if (!kids.length) return <div className="bx-empty">Empty</div>

    const nested = kids.filter(k => k.type !== 'item')
    const tools = kids.filter(k => k.type === 'item')
    const shownNested = nested.slice(0, PREVIEW_CONTAINERS)
    const shownTools = tools.slice(0, PREVIEW_ITEMS)
    const hidden = (nested.length - shownNested.length) + (tools.length - shownTools.length)

    return (
      <div className="bx-preview">
        {shownNested.map(k => {
          const n = (childrenOf[k.id] || []).length
          return (
            <div key={k.id} className="bx-mini">
              <span className="bx-mini-name">{k.name}</span>
              {n > 0 && <span className="bx-mini-count">· {n} inside</span>}
            </div>
          )
        })}
        {shownTools.length > 0 && (
          <div className="bx-pills">
            {shownTools.map(k => <span key={k.id} className="bx-pill">{k.name || 'Untitled'}</span>)}
          </div>
        )}
        {hidden > 0 && <div className="bx-more">+{hidden} more</div>}
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Explore · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="page page-wide" style={{ paddingTop: 64 }}>

        <div className="filter-row">
          <button className="filter-btn active" style={{ flex: 1, textAlign: 'center' }}>
            Explore
          </button>
          <button className="filter-btn" style={{ flex: 1, textAlign: 'center' }} onClick={() => router.push('/audit')}>
            Audit
          </button>
          <button className="filter-btn" style={{ flex: 1, textAlign: 'center' }} onClick={() => router.push('/contents')}>
            Tools
          </button>
        </div>

        <nav className="crumbs" aria-label="Breadcrumb">
          {trail.length === 0 ? (
            <span className="crumb current">Workshop</span>
          ) : (
            <span className="crumb link" onClick={() => drill(null)}>Workshop</span>
          )}
          {trail.map((node, i) => (
            <span key={node.id} className="crumb-group">
              <span className="crumb-sep">/</span>
              {i === trail.length - 1 ? (
                <span className="crumb current">{node.name}</span>
              ) : (
                <span className="crumb link" onClick={() => drill(node.id)}>{node.name}</span>
              )}
            </span>
          ))}
        </nav>

        {loading ? (
          <div className="loading"><div className="spinner" />Loading…</div>
        ) : boxes.length === 0 ? (
          <div className="bx-nothing">
            {current ? `${current.name} is empty.` : 'Nothing logged yet.'}
          </div>
        ) : (
          <div
            key={gen}
            className="bx-grid"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {boxes.map((box, i) => (
              <button
                key={box.id}
                className={boxClass(box.id)}
                style={{ animationDelay: boxDelay(i) }}
                onClick={() => openBox(box)}
              >
                <div className="bx-head">
                  <span className="bx-icon">
                    {box.type === 'location' ? <IconDoor /> : box.type === 'container' ? <IconPackage /> : <IconTag />}
                  </span>
                  <span className="bx-name">{box.name || 'Untitled'}</span>
                </div>
                {box.type === 'item' ? (
                  <div className="bx-sub">{(categoriesById[box.id] || []).join(', ')}</div>
                ) : (
                  <Preview box={box} />
                )}
              </button>
            ))}
          </div>
        )}

        {loggedIn && fabMenuOpen && (
          <div className="fab-backdrop" onClick={() => setFabMenuOpen(false)} />
        )}

        {loggedIn && fabMenuOpen && (
          <>
            <button className="fab-action" style={{ bottom: 166 }} onClick={() => { setFabMenuOpen(false); router.push('/new-tag') }}>
              <IconPlus /> Add
            </button>
            <button className="fab-action" style={{ bottom: 106 }} onClick={pressFabScan}>
              <IconNfc /> Scan
            </button>
          </>
        )}

        {loggedIn && (
          <button
            className="fab"
            onClick={pressFab}
            disabled={scanning}
            aria-label={inApp ? 'Add or scan' : 'Generate new tag'}
          >
            {scanning ? <span className="spinner" style={{ width: 20, height: 20 }} /> : <IconPlus />}
          </button>
        )}
      </div>
    </>
  )
}
