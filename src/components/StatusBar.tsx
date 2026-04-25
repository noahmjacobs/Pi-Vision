import { DBCamera } from '../types'

interface StatusBarProps {
  camera: DBCamera
}

export default function StatusBar({ camera }: StatusBarProps) {
  return (
    <div className="glass-card status-bar">
      <div className="status-item">
        <span className="status-label">Pi Status</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: camera.piConnected ? '#22c55e' : '#ef4444',
            boxShadow: camera.piConnected
              ? '0 0 0 3px rgba(34,197,94,0.2)'
              : '0 0 0 3px rgba(239,68,68,0.2)',
          }} />
          <span className="status-value">{camera.status}</span>
        </div>
      </div>

      <div className="status-divider" />

      <div className="status-item">
        <span className="status-label">Frame Rate</span>
        <span className="status-value">{camera.fps} fps</span>
      </div>

      <div className="status-divider" />

      <div className="status-item">
        <span className="status-label">Resolution</span>
        <span className="status-value">{camera.resolution}</span>
      </div>

      <div className="status-divider" />

      <div className="status-item">
        <span className="status-label">Storage</span>
        <span className="status-value">Firebase · Synced</span>
      </div>

      <div className="status-divider" />

      <div className="status-item">
        <span className="status-label">Model</span>
        <span className="status-value">Claude 3.5</span>
      </div>
    </div>
  )
}
