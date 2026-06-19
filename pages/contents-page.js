import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { IconTool, IconArrowLeft, IconPlus, IconTrash } from '../lib/icons'

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

  useEffect(() => {
    fetch('/api/contents')
      .then(r => r.json())
      .then(d => { setContents(d.contents || []); setLoading(false) })
  }, [])

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
        <title>Contents · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="page" style={{ maxWidth: 900 }}>
        <div className="topbar">
          <div className="topbar-logo"><IconTool /></div>
          <h1>All contents</h1>
          <span className="topbar-sub" style={{ cursor: 'pointer' }} onClick={() => router.push('/inventory')}>
            Inventory →
          </span>
        </div>

        <input
          placeholder="Search item, description, category, box, location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 16 }}
        />

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
                    <td style={{ padding: '8px 10px' }}>
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
    </>
  )
}
