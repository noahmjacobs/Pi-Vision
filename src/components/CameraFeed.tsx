import { useEffect, useState } from 'react'

function formatTimestamp(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

export default function CameraFeed() {
  const [ts, setTs] = useState(formatTimestamp(new Date()))

  useEffect(() => {
    const id = setInterval(() => setTs(formatTimestamp(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="glass-card camera-card">
      <div className="camera-feed-wrap">
        {/* 3x3 grid overlay */}
        <div className="camera-grid">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="camera-grid-cell" />
          ))}
        </div>

        {/* REC badge */}
        <div className="camera-rec-badge">
          <div className="rec-dot" />
          <span className="rec-text">REC</span>
        </div>

        {/* Timestamp */}
        <div className="camera-timestamp">{ts}</div>

        {/* Placeholder text */}
        <span className="camera-placeholder-text">Camera Feed</span>
      </div>

      <div className="camera-footer">
        <span className="camera-label">CAM · 01</span>
        <div className="camera-dot-sep" />
        <span className="camera-location">Provo, UT</span>
      </div>
    </div>
  )
}
