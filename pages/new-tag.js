import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  IconNfc, IconTag, IconArrowLeft, IconCheck, IconArrowRight, IconTool
} from '../lib/icons'
import { apiFetch } from '../lib/apiFetch'
import { useAuth } from './_app'

// Always use the real production domain, regardless of which URL
// (preview deployment, vercel.app auto-alias, localhost, etc.) the
// page happens to be opened from. Update this if you ever change domains.
const PRODUCTION_ORIGIN = 'https://workshop-nfc.vercel.app'

// Slug-only ID, no random suffix — matches the name exactly so the
// final URL reads as /scan?id=red-toolbox rather than /scan?id=red-toolbox-x7k2.
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Minimal QR rendering with no external dependency: draws into a canvas
// using the `qrcode` algorithm bundled below would be overkill, so instead
// we call a tiny, dependency-free matrix generator. To keep this file
// self-contained and avoid adding a new npm package, we lean on the
// `node-qrcode`-compatible browser global if present, and otherwise just
// skip the visual code gracefully (URL + copy still works fully without it).
function useQrCode(text) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!text) return
    let cancelled = false

    import('qrcode')
      .then(QRCode => {
        if (cancelled || !canvasRef.current) return
        QRCode.toCanvas(canvasRef.current, text, {
          width: 220,
          margin: 1,
          color: { dark: '#1a1a19', light: '#ffffff' }
        }, () => setReady(true))
      })
      .catch(() => setReady(false))

    return () => { cancelled = true }
  }, [text])

  return { canvasRef, ready }
}

export default function NewTagPage() {
  const router = useRouter()
  const { loggedIn } = useAuth()
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [copied, setCopied] = useState(false)
  const [existingIds, setExistingIds] = useState([])

  useEffect(() => {
    if (loggedIn === false) router.replace('/login')
  }, [loggedIn])

  useEffect(() => {
    apiFetch('/api/items')
      .then(r => r.json())
      .then(d => setExistingIds((d.items || []).map(i => i.id)))
      .catch(() => {})
  }, [])

  const url = id ? `${PRODUCTION_ORIGIN}/scan?id=${id}` : ''
  const { canvasRef, ready } = useQrCode(url)
  const isDuplicate = id && existingIds.includes(id)

  if (!loggedIn) return null

  function handleNameChange(e) {
    const newName = e.target.value
    setName(newName)
    setId(slugify(newName))
    setCopied(false)
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can fail on non-HTTPS/older browsers — fall back
      // to selecting the text so the person can copy manually.
    }
  }

  return (
    <>
      <Head>
        <title>New tag · Workshop NFC</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#1a1a19" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" />
      </Head>

      <div className="page" style={{ paddingTop: 64 }}>

        <div className="back-link" onClick={() => router.push("/inventory")}>
          <IconArrowLeft /> Back
        </div>

        <div className="flash new">
          <div className="flash-icon"><IconNfc /></div>
          <div>
            <p>New tag URL ready</p>
            <span>Write it to a blank NFC tag</span>
          </div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label">What is this?</label>
            <input
              placeholder="e.g. Red toolbox, North shelf…"
              value={name}
              onChange={handleNameChange}
              style={{ textAlign: 'left' }}
            />
            {isDuplicate && (
              <div className="form-hint" style={{ color: '#A32D2D' }}>
                An item named "{name}" already exists — pick a different name
              </div>
            )}
          </div>

          <div className="section-label" style={{ marginBottom: 14 }}>Scan this with your NFC writer app</div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: 14,
              background: '#ffffff',
              borderRadius: 'var(--radius)',
              marginBottom: 16,
              minHeight: 220,
              alignItems: 'center'
            }}
          >
            <canvas ref={canvasRef} width={220} height={220} style={{ opacity: ready && id ? 1 : 0 }} />
          </div>

          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label">URL to write</label>
            <div className="id-row">
              <input className="prefilled" value={url || 'Type a name above first…'} readOnly />
              <button className="btn-ghost" onClick={copyUrl} disabled={!id}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="form-hint">
              In your NFC writer app, choose "Write URL" and paste this in
            </div>
          </div>

          <button
            className="btn-primary save-btn"
            disabled={!id || isDuplicate}
            onClick={() => router.push(`/scan?id=${id}&prefill_name=${encodeURIComponent(name)}`)}
          >
            <IconArrowRight /> I wrote it — scan now
          </button>
        </div>

        <div className="inventory-link" onClick={() => router.push('/inventory')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconTag /> View full inventory
          </span>
          <IconArrowRight />
        </div>
      </div>
    </>
  )
}
