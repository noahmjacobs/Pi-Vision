const ALERTS = [
  {
    id: 1,
    name: 'Unrecognized Person Detected',
    desc: 'A person not in the known-faces database was identified near the doorway. Face recognition confidence: 72%. Review footage for manual verification.',
    meta: 'CAM·01 · Doorway · Left frame',
    time: '07:40',
    severity: 'high',
    iconBg: 'rgba(239,68,68,0.12)',
    iconColor: '#ef4444',
  },
  {
    id: 2,
    name: 'Package Delivery',
    desc: 'A package was detected at the entrance. No motion after placement for 14 minutes — likely awaiting pickup.',
    meta: 'CAM·01 · Entrance',
    time: '07:15',
    severity: 'medium',
    iconBg: 'rgba(245,158,11,0.12)',
    iconColor: '#f59e0b',
  },
  {
    id: 3,
    name: 'Repeated Motion — Left Panel',
    desc: 'Multiple motion detections from the same region within a 10-minute window. May indicate a person loitering or a vegetation / lighting artifact.',
    meta: 'CAM·01 · Left side panel',
    time: '07:08',
    severity: 'medium',
    iconBg: 'rgba(245,158,11,0.12)',
    iconColor: '#f59e0b',
  },
  {
    id: 4,
    name: 'Camera Feed Stable',
    desc: 'No anomalies detected. Feed is running at 30 fps with 1080p resolution. Firebase sync is active.',
    meta: 'System · All clear',
    time: '06:58',
    severity: 'low',
    iconBg: 'rgba(34,197,94,0.12)',
    iconColor: '#22c55e',
  },
  {
    id: 5,
    name: 'Vehicle in Driveway',
    desc: 'An unfamiliar vehicle was detected in the driveway zone. License plate recognition not available at this resolution.',
    meta: 'CAM·01 · Driveway',
    time: '06:32',
    severity: 'high',
    iconBg: 'rgba(239,68,68,0.12)',
    iconColor: '#ef4444',
  },
]

const SEVERITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  high: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', label: 'High' },
  medium: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', label: 'Medium' },
  low: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', label: 'Low' },
}

function BellIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

export default function Alerts() {
  return (
    <div className="alerts-page">
      <div>
        <div className="page-title">Alerts</div>
        <div className="page-subtitle">{ALERTS.length} alerts in the last 24 hours</div>
      </div>

      <div className="alerts-list">
        {ALERTS.map(alert => {
          const s = SEVERITY_STYLE[alert.severity]
          return (
            <div key={alert.id} className="glass-card alert-card">
              <div className="alert-icon-wrap" style={{ background: alert.iconBg }}>
                <BellIcon color={alert.iconColor} />
              </div>
              <div className="alert-body">
                <div className="alert-title-row">
                  <span className="alert-name">{alert.name}</span>
                  <span className="severity-badge" style={{ background: s.bg, color: s.color }}>
                    {s.label}
                  </span>
                </div>
                <p className="alert-desc">{alert.desc}</p>
                <div className="alert-meta">{alert.meta}</div>
              </div>
              <div className="alert-time">{alert.time}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
