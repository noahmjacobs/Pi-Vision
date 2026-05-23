import { DBVehicleEvent } from '../types'
import { Skeleton } from './Skeleton'

const VEHICLE_COLORS: Record<string, string> = {
  car:   '#1d6ef4',
  truck: '#f59e0b',
  van:   '#a855f7',
  suv:   '#22c55e',
}

const VEHICLE_LABELS: Record<string, string> = {
  car: 'Car', truck: 'Truck', van: 'Van', suv: 'SUV',
}

function seatbeltSummary(ev: DBVehicleEvent): string {
  const { seatbelts, occupants } = ev
  if (occupants === 1) {
    return seatbelts === 'driver' ? 'Belted' : 'Unbelted'
  }
  if (seatbelts === 'both')      return 'Both belted'
  if (seatbelts === 'driver')    return 'Passenger unbelted'
  if (seatbelts === 'passenger') return 'Driver unbelted'
  return 'Both unbelted'
}

function isCompliant(ev: DBVehicleEvent): boolean {
  if (ev.occupants === 1) return ev.seatbelts === 'driver'
  return ev.seatbelts === 'both'
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

interface RecentViolationsProps {
  events: DBVehicleEvent[]
  loading?: boolean
  onSeeAll?: () => void
}

export default function RecentViolations({ events, loading, onSeeAll }: RecentViolationsProps) {
  return (
    <div className="glass-card events-card">
      <div className="events-header">
        <span className="events-title">Recent Vehicles</span>
        {!loading && <button className="see-all-btn" onClick={onSeeAll}>See all</button>}
      </div>
      <div className="events-list">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="event-item">
                <Skeleton width="9px" height="9px" radius="50%" style={{ flexShrink: 0 }} />
                <div className="event-info">
                  <Skeleton width="130px" height="13px" style={{ marginBottom: 5 }} />
                  <Skeleton width="90px" height="11px" />
                </div>
                <Skeleton width="32px" height="12px" style={{ flexShrink: 0 }} />
              </div>
            ))
          : events.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>No vehicles logged yet.</div>
            : events.map(ev => (
                <div key={ev.id} className="event-item">
                  <div className="event-dot" style={{ background: VEHICLE_COLORS[ev.vehicleType] ?? '#6b7280' }} />
                  <div className="event-info">
                    <div className="event-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {VEHICLE_LABELS[ev.vehicleType] ?? ev.vehicleType}
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>· {ev.occupants} occ</span>
                      {ev.driverDistracted && <span title="Distracted driver" style={{ fontSize: 12 }}>📱</span>}
                    </div>
                    <div className="event-sub" style={{ color: isCompliant(ev) ? '#22c55e' : '#ef4444' }}>
                      {seatbeltSummary(ev)}
                    </div>
                  </div>
                  <div className="event-time">{formatTime(ev.timestamp)}</div>
                </div>
              ))
        }
      </div>
    </div>
  )
}
