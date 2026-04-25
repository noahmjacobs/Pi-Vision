import { useEffect, useState } from 'react'
import { useFirebaseValue } from '../hooks/useFirebaseData'

function formatTimestamp(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )
}

export default function CameraFeed() {
  const [ts, setTs] = useState(formatTimestamp(new Date()))
  const streamUrl = useFirebaseValue<string>('camera/streamUrl', '')

  // Try embedding only when served over HTTP (avoids mixed-content blocking on HTTPS)
  const pageIsHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const streamIsHttps = streamUrl.startsWith('https://')

  // We can safely embed when both sides match protocol, or stream is HTTPS on any page
  const canEmbed = Boolean(streamUrl) && (streamIsHttps || !pageIsHttps)

  const [embedError, setEmbedError] = useState(false)

  useEffect(() => { setEmbedError(false) }, [streamUrl])

  useEffect(() => {
    const id = setInterval(() => setTs(formatTimestamp(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  const showEmbed   = canEmbed && !embedError
  const piIsOnline  = Boolean(streamUrl)

  return (
    <div className="glass-card camera-card">
      <div className="camera-feed-wrap">

        {showEmbed ? (
          /* ── Embedded MJPEG stream (same-network HTTP or HTTPS stream) ── */
          <img
            key={streamUrl}
            src={streamUrl}
            alt="Live camera feed"
            className="camera-stream-img"
            onError={() => setEmbedError(true)}
          />
        ) : (
          /* ── Placeholder + optional "Open Stream" button ── */
          <>
            <div className="camera-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="camera-grid-cell" />
              ))}
            </div>

            <div className="camera-offline-content">
              <VideoIcon />
              {piIsOnline ? (
                /* Pi is running but can't embed (HTTPS page + HTTP stream) */
                <a
                  href={streamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="stream-open-btn"
                >
                  <ExternalLinkIcon />
                  Open Live Stream
                </a>
              ) : (
                <span className="camera-placeholder-text">Camera Feed</span>
              )}
            </div>
          </>
        )}

        {/* ── Overlays — always on top ── */}
        <div className="camera-rec-badge">
          <div className={`rec-dot${piIsOnline ? '' : ' rec-dot-offline'}`} />
          <span className="rec-text">{piIsOnline ? 'LIVE' : 'REC'}</span>
        </div>
        <div className="camera-timestamp">{ts}</div>
      </div>

      <div className="camera-footer">
        <span className="camera-label">CAM · 01</span>
        <div className="camera-dot-sep" />
        <span className="camera-location">Provo, UT</span>
        {piIsOnline && (
          <>
            <div className="camera-dot-sep" />
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>
              {showEmbed ? 'Live' : 'Pi Connected'}
            </span>
          </>
        )}
        {piIsOnline && !showEmbed && (
          <a
            href={streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="stream-footer-link"
          >
            <ExternalLinkIcon />
            View feed
          </a>
        )}
      </div>
    </div>
  )
}
