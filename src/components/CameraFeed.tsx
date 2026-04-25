import { useEffect, useState } from 'react'
import { useFirebaseValue } from '../hooks/useFirebaseData'

function formatTimestamp(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
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
  const snapshotUrl = useFirebaseValue<string>('camera/snapshotUrl', '')
  const [imgSrc, setImgSrc] = useState('')

  const piIsOnline = Boolean(snapshotUrl)

  useEffect(() => {
    const id = setInterval(() => setTs(formatTimestamp(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  // Refresh snapshot every second with a cache-busting timestamp
  useEffect(() => {
    if (!snapshotUrl) {
      setImgSrc('')
      return
    }
    const tick = () => setImgSrc(`${snapshotUrl}&t=${Date.now()}`)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [snapshotUrl])

  return (
    <div className="glass-card camera-card">
      <div className="camera-feed-wrap">

        {imgSrc ? (
          <img
            src={imgSrc}
            alt="Live camera snapshot"
            className="camera-stream-img"
          />
        ) : (
          <>
            <div className="camera-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="camera-grid-cell" />
              ))}
            </div>
            <div className="camera-offline-content">
              <VideoIcon />
              <span className="camera-placeholder-text">Camera Feed</span>
            </div>
          </>
        )}

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
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>Live</span>
          </>
        )}
      </div>
    </div>
  )
}
