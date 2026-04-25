import { DBEvent } from '../types'

// Derive dot color from event type and label
function eventColor(ev: DBEvent): string {
  if (ev.type === 'motion') return '#1d6ef4'
  const l = ev.label.toLowerCase()
  if (l.includes('person')) return '#22c55e'
  if (l.includes('package')) return '#f59e0b'
  if (l.includes('vehicle')) return '#a855f7'
  if (l.includes('animal')) return '#f97316'
  return '#6b7280'
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

interface RecentEventsProps {
  events: DBEvent[]
  onSeeAll?: () => void
}

export default function RecentEvents({ events, onSeeAll }: RecentEventsProps) {
  return (
    <div className="glass-card events-card">
      <div className="events-header">
        <span className="events-title">Recent Events</span>
        <button className="see-all-btn" onClick={onSeeAll}>See all</button>
      </div>
      <div className="events-list">
        {events.map(ev => (
          <div key={ev.id} className="event-item">
            <div className="event-dot" style={{ background: eventColor(ev) }} />
            <div className="event-info">
              <div className="event-name">{ev.label}</div>
              <div className="event-sub">{ev.sublabel}</div>
            </div>
            <div className="event-time">{formatTime(ev.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
