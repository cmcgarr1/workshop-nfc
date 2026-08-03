import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { IconPackage, IconLayers, IconArrowRight, IconPlus, IconNfc } from '../lib/icons'
import { apiFetch } from '../lib/apiFetch'
import { useAuth } from './_app'

// A location/container that hasn't been touched in this many days gets
// surfaced in the "stale" nudge. Easy to tune later, not meant to be exact.
const STALE_DAYS = 60

// How many entries to show in the two recency-ranked feeds before trailing
// off — the other sections are checklists meant to be shown in full.
const RECENTLY_ADDED_LIMIT = 4
const STALE_LIMIT = 8

function daysAgo(iso) {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / 86400000
}

function fmtRelative(iso) {
  const days = Math.floor(daysAgo(iso))
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years !== 1 ? 's' : ''} ago`
}

export default function InventoryPage() {
  const router = useRouter()
  const { loggedIn } = useAuth()
  const [items, setItems] = useState([])
  const [contents, setContents] = useState([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState(null)

  // True when this page is opened inside the Workshop NFC companion app's
  // WebView (rather than a normal mobile browser) — the fab only offers a
  // Scan option there, since NFC reading needs the native app.
  const [inApp, setInApp] = useState(false)
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    setInApp(typeof window !== 'undefined' && !!window.ReactNativeWebView)
  }, [])

  // The app calls window.onNfcScanResult(...) via injectJavaScript once a
  // native NFC read finishes, mirroring window.onNfcWriteResult on new-tag.js.
  useEffect(() => {
    if (!inApp) return
    window.onNfcScanResult = (result) => {
      setScanning(false)
      if (result?.ok) {
        const path = result.url.replace(/^https?:\/\/[^/]+/, '')
        router.push(path)
      } else {
        alert(result?.error || 'Could not read the tag. Try again.')
      }
    }
    return () => { delete window.onNfcScanResult }
  }, [inApp, router])

  function pressFab() {
    if (!inApp) {
      router.push('/new-tag')
      return
    }
    setFabMenuOpen(open => !open)
  }

  function pressFabAdd() {
    setFabMenuOpen(false)
    router.push('/new-tag')
  }

  function pressFabScan() {
    setFabMenuOpen(false)
    setScanning(true)
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCAN_NFC' }))
  }

  useEffect(() => {
    apiFetch('/api/items')
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false) })
    apiFetch('/api/contents')
      .then(r => r.json())
      .then(d => setContents(d.contents || []))
  }, [])

  async function markTagged(id) {
    setMarkingId(id)
    const r = await apiFetch(`/api/items?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_written_at: new Date().toISOString() })
    })
    setMarkingId(null)
    if (!r.ok) return
    const { item } = await r.json()
    setItems(list => list.map(i => (i.id === item.id ? item : i)))
  }

  const hasItemChild = id => items.some(i => i.parent_id === id)
  const hasContentChild = id => contents.some(c => c.parent_item_id === id)

  // Scope every section to locations/containers only — these feeds are about
  // storage that needs tagging or review, not about individual tools. Since
  // the unification the type='item' rows here ARE the real tools (same rows
  // /api/contents serves), so including them is a live design question, not
  // the duplicate-row problem this filter originally worked around.
  const locationsAndContainers = items.filter(i => i.type === 'location' || i.type === 'container')

  // 1. Recently added — most recently created/updated locations and
  // containers, so the page reopens to whatever was just touched.
  const recentlyAdded = locationsAndContainers
    .slice()
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, RECENTLY_ADDED_LIMIT)

  // 2. Stale nudge — nothing touched in a while, oldest first.
  const staleItems = locationsAndContainers
    .filter(i => daysAgo(i.updated_at || i.created_at) >= STALE_DAYS)
    .slice()
    .sort((a, b) => daysAgo(b.updated_at || b.created_at) - daysAgo(a.updated_at || a.created_at))
    .slice(0, STALE_LIMIT)

  // 3. Unassigned containers — boxes with no home location yet.
  const unassignedContainers = items.filter(i => i.type === 'container' && !i.parent_id)

  // 4. Empty locations — nothing (no sub-items, no logged tools) assigned.
  const emptyLocations = items.filter(i => i.type === 'location' && !hasItemChild(i.id) && !hasContentChild(i.id))

  // 5. Tagging progress — locations/containers logged in the DB but without
  // a physical NFC tag written for them yet.
  const taggable = locationsAndContainers
  const untagged = taggable.filter(i => !i.tag_written_at)
  const taggedCount = taggable.length - untagged.length

  function typeIcon(type) {
    return type === 'location' ? <IconLayers /> : <IconPackage />
  }

  function Section({ title, hint, count, children, empty }) {
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <div className="section-label">{title}</div>
          {count != null && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{count}</div>}
        </div>
        {hint && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>{hint}</div>}
        {empty ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>{empty}</div>
        ) : children}
      </div>
    )
  }

  function Row({ item, subtitle, action }) {
    return (
      <div className="inv-item" onClick={() => router.push(`/scan?id=${item.id}`)}>
        <div className={`inv-item-icon ${item.type === 'location' ? 'loc' : 'con'}`}>
          {typeIcon(item.type)}
        </div>
        <div>
          <div className="inv-item-name">{item.name}</div>
          <div className="inv-item-sub">{subtitle}</div>
        </div>
        {action ? (
          <div style={{ marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>{action}</div>
        ) : (
          <div className="inv-item-arrow"><IconArrowRight /></div>
        )}
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Audit · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="page" style={{ paddingTop: 64 }}>

        <div className="filter-row">
          <button className="filter-btn" style={{ flex: 1, textAlign: 'center' }} onClick={() => router.push('/inventory')}>
            Explore
          </button>
          <button className="filter-btn active" style={{ flex: 1, textAlign: 'center' }}>
            Audit
          </button>
          <button className="filter-btn" style={{ flex: 1, textAlign: 'center' }} onClick={() => router.push('/contents')}>
            Tools
          </button>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" />Loading…</div>
        ) : (
          <>
            <Section title="Recently added" hint="What you were just working on">
              {recentlyAdded.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>Nothing logged yet</div>
              ) : recentlyAdded.map(item => (
                <Row key={item.id} item={item} subtitle={fmtRelative(item.updated_at || item.created_at)} />
              ))}
            </Section>

            {staleItems.length > 0 && (
              <Section
                title="Stale items"
                hint={`Not touched in ${STALE_DAYS}+ days — review, relocate, or discard`}
              >
                {staleItems.map(item => (
                  <Row key={item.id} item={item} subtitle={`Last touched ${fmtRelative(item.updated_at || item.created_at)}`} />
                ))}
              </Section>
            )}

            <Section
              title="Unassigned containers"
              count={unassignedContainers.length}
              hint="Boxes with no home location yet"
              empty={unassignedContainers.length === 0 ? 'Every container has a home' : null}
            >
              {unassignedContainers.map(item => (
                <Row key={item.id} item={item} subtitle="No parent location" />
              ))}
            </Section>

            {emptyLocations.length > 0 && (
              <Section
                title="Empty locations"
                count={emptyLocations.length}
                hint="Registered but nothing assigned to them yet"
              >
                {emptyLocations.map(item => (
                  <Row key={item.id} item={item} subtitle="Nothing assigned here" />
                ))}
              </Section>
            )}

            <Section
              title="Tagging progress"
              count={`${taggedCount} / ${taggable.length} tagged`}
              hint="Logged but not physically tagged yet"
              empty={untagged.length === 0 ? 'Everything logged has a physical tag' : null}
            >
              {untagged.map(item => (
                <Row
                  key={item.id}
                  item={item}
                  subtitle="Not yet tagged"
                  action={loggedIn && (
                    <button
                      className="btn-ghost"
                      style={{ padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' }}
                      disabled={markingId === item.id}
                      onClick={() => markTagged(item.id)}
                    >
                      {markingId === item.id ? 'Saving…' : 'Mark tagged'}
                    </button>
                  )}
                />
              ))}
            </Section>
          </>
        )}

        {loggedIn && fabMenuOpen && (
          <div className="fab-backdrop" onClick={() => setFabMenuOpen(false)} />
        )}

        {loggedIn && fabMenuOpen && (
          <>
            <button className="fab-action" style={{ bottom: 166 }} onClick={pressFabAdd}>
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
