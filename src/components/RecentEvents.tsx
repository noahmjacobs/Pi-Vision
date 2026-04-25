import { CameraEvent } from '../types'

interface RecentEventsProps {
  events: CameraEvent[]
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
            <div className="event-dot" style={{ background: ev.color }} />
            <div className="event-info">
              <div className="event-name">{ev.name}</div>
              <div className="event-sub">{ev.sub}</div>
            </div>
            <div className="event-time">{ev.time}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
