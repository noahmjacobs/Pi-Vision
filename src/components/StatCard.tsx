import { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string
  sub: string
  icon: ReactNode
  iconBg: string
  showReset?: boolean
  onReset?: () => void
}

export default function StatCard({ label, value, sub, icon, iconBg, showReset, onReset }: StatCardProps) {
  return (
    <div className="glass-card stat-card">
      <div className="stat-icon-wrap" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="stat-info">
        <span className="stat-label">{label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="stat-value">{value}</span>
          <span className="stat-sub">{sub}</span>
        </div>
      </div>
      {showReset && (
        <button className="stat-reset-btn" onClick={onReset}>
          ↺ Reset
        </button>
      )}
    </div>
  )
}
