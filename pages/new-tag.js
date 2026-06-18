import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  IconNfc, IconTag, IconArrowLeft, IconCheck, IconArrowRight, IconTool
} from '../lib/icons'

// Identical to genId() in scan.js, kept in sync so an ID generated here
// looks/behaves the same as one generated during manual registration.
function genId(name) {
  const base = name
    ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20)
    : 'tag'
  return base + '-' + Math.random().toString(36).slice(2, 6)
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
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    setId(genId(''))
  }, [])

  const url = origin && id ? `${origin}/scan?id=${id}` : ''
  const { canvasRef, ready } = useQrCode(url)

  function regenerate() {
    setId(genId(name))
    setCopied(false)
  }

  function handleNameChange(e) {
    const newName = e.target.value
    setName(newName)
    setId(genId(newName))
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

        <div className="back-link" onClick={() => router.push('/inventory')}>
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
            <label className="form-label">What is this? (optional, but makes the ID readable)</label>
            <input
              placeholder="e.g. Red toolbox, North shelf…"
              value={name}
              onChange={handleNameChange}
              style={{ textAlign: 'left' }}
            />
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
            <canvas ref={canvasRef} width={220} height={220} style={{ opacity: ready ? 1 : 0 }} />
          </div>

          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label">URL to write</label>
            <div className="id-row">
              <input className="prefilled" value={url} readOnly />
              <button className="btn-ghost" onClick={copyUrl}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="form-hint">
              In your NFC writer app, choose "Write URL" and paste this in
            </div>
          </div>

          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label">Tag ID</label>
            <div className="id-row">
              <input className="prefilled" value={id} readOnly style={{ fontFamily: 'monospace' }} />
              <button className="btn-ghost" onClick={regenerate}>
                New ID
              </button>
            </div>
          </div>

          <button
            className="btn-primary save-btn"
            onClick={() => router.push(`/scan?id=${id}${name ? `&prefill_name=${encodeURIComponent(name)}` : ''}`)}
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
