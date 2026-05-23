import { useEffect, useState } from 'react'
import { useFirebaseValue } from '../hooks/useFirebaseData'
import { useAuth } from '../context/AuthContext'

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
  const { devicePath } = useAuth()
  const [ts, setTs] = useState(formatTimestamp(new Date()))
  const { data: snapshot }   = useFirebaseValue<string>(devicePath('camera/snapshot'), '', { cache: false })
  const { data: piIsOnline } = useFirebaseValue<boolean>(devicePath('camera/piConnected'), false)

  const imgSrc = snapshot ? `data:image/jpeg;base64,${snapshot}` : ''

  useEffect(() => {
    const id = setInterval(() => setTs(formatTimestamp(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

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
          <div className={`rec-dot${piIsOnline && imgSrc ? '' : ' rec-dot-offline'}`} />
          <span className="rec-text">{piIsOnline && imgSrc ? 'LIVE' : 'REC'}</span>
        </div>
        <div className="camera-timestamp">{ts}</div>
      </div>

      <div className="camera-footer">
        <span className="camera-label">CAM · 01</span>
        <div className="camera-dot-sep" />
        <span className="camera-location">Provo, UT</span>
        {piIsOnline && imgSrc && (
          <>
            <div className="camera-dot-sep" />
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>Live</span>
          </>
        )}
      </div>
    </div>
  )
}
