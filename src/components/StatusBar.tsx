import { SystemStatus } from '../types'

interface StatusBarProps {
  status: SystemStatus
}

export default function StatusBar({ status }: StatusBarProps) {
  const piConnected = status.piStatus === 'Connected'

  return (
    <div className="glass-card status-bar">
      <div className="status-item">
        <span className="status-label">Pi Status</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: piConnected ? '#22c55e' : '#ef4444',
            boxShadow: piConnected ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 0 0 3px rgba(239,68,68,0.2)'
          }} />
          <span className="status-value">{status.piStatus}</span>
        </div>
      </div>

      <div className="status-divider" />

      <div className="status-item">
        <span className="status-label">Frame Rate</span>
        <span className="status-value">{status.frameRate} fps</span>
      </div>

      <div className="status-divider" />

      <div className="status-item">
        <span className="status-label">Resolution</span>
        <span className="status-value">{status.resolution}</span>
      </div>

      <div className="status-divider" />

      <div className="status-item">
        <span className="status-label">Storage</span>
        <span className="status-value">{status.storage}</span>
      </div>

      <div className="status-divider" />

      <div className="status-item">
        <span className="status-label">Model</span>
        <span className="status-value">{status.model}</span>
      </div>
    </div>
  )
}
