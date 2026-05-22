import { ReactNode } from 'react'
import { Skeleton } from './Skeleton'

interface StatCardProps {
  label: string
  value: string
  sub: string
  icon: ReactNode
  iconBg: string
  showReset?: boolean
  onReset?: () => void
  loading?: boolean
}

export default function StatCard({ label, value, sub, icon, iconBg, showReset, onReset, loading }: StatCardProps) {
  return (
    <div className="glass-card stat-card">
      <div className="stat-icon-wrap" style={{ background: loading ? 'rgba(0,0,0,0.06)' : iconBg }}>
        {loading ? <Skeleton width="22px" height="22px" radius="50%" /> : icon}
      </div>
      <div className="stat-info">
        <span className="stat-label">{label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {loading ? (
            <Skeleton width="72px" height="26px" radius="6px" style={{ marginTop: 2 }} />
          ) : (
            <>
              <span key={value} className="stat-value stat-value-enter">{value}</span>
              <span className="stat-sub">{sub}</span>
            </>
          )}
        </div>
      </div>
      {showReset && !loading && (
        <button className="stat-reset-btn" onClick={onReset}>
          ↺ Reset
        </button>
      )}
    </div>
  )
}
