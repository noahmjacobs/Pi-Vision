import { useMemo, useState } from 'react'
import { useFirebaseValue } from '../hooks/useFirebaseData'
import { DBEvent } from '../types'

export default function Analytics() {
  const todayStr = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayStr)

  const { data: eventsRaw } = useFirebaseValue<Record<string, DBEvent>>(
    'events',
    {} as Record<string, DBEvent>,
    { cache: false }
  )

  const { data: dailyTotal } = useFirebaseValue<number>(
    `counts/${selectedDate}/total`,
    0,
    { cache: false }
  )

  const filteredEvents = useMemo(() => {
    const all = Object.values(eventsRaw)
    return all
      .filter(ev => {
        if (ev.type !== 'person') return false
        const d = new Date(ev.timestamp).toISOString().split('T')[0]
        return d === selectedDate
      })
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [eventsRaw, selectedDate])

  const hourlyData = useMemo(() => {
    const counts = Array(24).fill(0)
    for (const ev of filteredEvents) {
      const h = new Date(ev.timestamp).getHours()
      counts[h]++
    }
    return counts
  }, [filteredEvents])

  const maxHourly = Math.max(...hourlyData, 1)

  const displayTotal = dailyTotal > 0 ? dailyTotal : filteredEvents.length

  const tableEvents = filteredEvents.slice(0, 50)

  const BAR_HEIGHT = 80

  const [hoveredHour, setHoveredHour] = useState<number | null>(null)

  return (
    <div className="analytics-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-subtitle">People crossings by date</div>
        </div>
        <input
          type="date"
          value={selectedDate}
          max={todayStr}
          onChange={e => setSelectedDate(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 14,
            padding: '6px 12px',
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Total crossings */}
      <div className="glass-card" style={{ padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Total Crossings — {selectedDate}
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
            {displayTotal.toLocaleString()}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
            people counted this day
          </div>
        </div>
      </div>

      {/* Hourly bar chart */}
      <div className="glass-card chart-card">
        <div className="chart-title">Crossings by Hour</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 3,
            height: BAR_HEIGHT + 24,
            paddingBottom: 20,
            position: 'relative',
          }}
        >
          {hourlyData.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                position: 'relative',
                cursor: v > 0 ? 'pointer' : 'default',
              }}
              onMouseEnter={() => setHoveredHour(i)}
              onMouseLeave={() => setHoveredHour(null)}
            >
              {hoveredHour === i && (
                <div style={{
                  position: 'absolute',
                  bottom: `calc(${(v / maxHourly) * BAR_HEIGHT}px + 8px)`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(15,20,30,0.92)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 8px',
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                  {i}:00 — {v} {v === 1 ? 'crossing' : 'crossings'}
                </div>
              )}
              <div
                style={{
                  width: '100%',
                  height: `${(v / maxHourly) * BAR_HEIGHT}px`,
                  minHeight: v > 0 ? 3 : 0,
                  background: i === new Date().getHours() && selectedDate === todayStr
                    ? '#1d6ef4'
                    : hoveredHour === i
                    ? 'rgba(29,110,244,0.65)'
                    : 'rgba(29,110,244,0.35)',
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 0.2s, background 0.15s',
                }}
              />
            </div>
          ))}
          {/* X-axis labels */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            pointerEvents: 'none',
          }}>
            {[0, 6, 12, 18, 24].map(h => (
              <span key={h} className="bar-label">{h}h</span>
            ))}
          </div>
        </div>
      </div>

      {/* Event log table */}
      <div className="glass-card analytics-table-card">
        <div className="table-title">
          Event Log — {tableEvents.length} events
          {filteredEvents.length > 50 ? ` (showing 50 of ${filteredEvents.length})` : ''}
        </div>
        {tableEvents.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '16px 0' }}>
            No person events recorded for {selectedDate}.
          </div>
        ) : (
          <table className="events-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Label</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {tableEvents.map(ev => (
                <tr key={ev.id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td style={{ fontWeight: 500 }}>{ev.label}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{ev.sublabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
