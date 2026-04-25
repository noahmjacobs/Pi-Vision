import { useEffect, useState } from 'react'
import { useFirebaseValue } from '../hooks/useFirebaseData'

function formatTimestamp(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

export default function CameraFeed() {
  const [ts, setTs] = useState(formatTimestamp(new Date()))
  const streamUrl = useFirebaseValue<string>('camera/streamUrl', '')

  // Track whether the stream img failed to load (Pi offline / unreachable)
  const [streamError, setStreamError] = useState(false)

  // Reset error state whenever the URL changes (Pi reconnected with a new URL)
  useEffect(() => {
    setStreamError(false)
  }, [streamUrl])

  useEffect(() => {
    const id = setInterval(() => setTs(formatTimestamp(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  const showStream = Boolean(streamUrl) && !streamError

  return (
    <div className="glass-card camera-card">
      <div className="camera-feed-wrap">

        {showStream ? (
          /* ── Live MJPEG stream from Pi ── */
          <img
            key={streamUrl}          /* forces remount when URL changes */
            src={streamUrl}
            alt="Live camera feed"
            className="camera-stream-img"
            onError={() => setStreamError(true)}
          />
        ) : (
          /* ── Offline placeholder ── */
          <>
            <div className="camera-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="camera-grid-cell" />
              ))}
            </div>
            <span className="camera-placeholder-text">
              {streamUrl && streamError ? 'Stream unavailable' : 'Camera Feed'}
            </span>
          </>
        )}

        {/* Overlays — always visible */}
        <div className="camera-rec-badge">
          <div className={`rec-dot${showStream ? '' : ' rec-dot-offline'}`} />
          <span className="rec-text">{showStream ? 'LIVE' : 'REC'}</span>
        </div>

        <div className="camera-timestamp">{ts}</div>
      </div>

      <div className="camera-footer">
        <span className="camera-label">CAM · 01</span>
        <div className="camera-dot-sep" />
        <span className="camera-location">Provo, UT</span>
        {showStream && (
          <>
            <div className="camera-dot-sep" />
            <span className="camera-location" style={{ color: '#22c55e' }}>Live</span>
          </>
        )}
      </div>
    </div>
  )
}
