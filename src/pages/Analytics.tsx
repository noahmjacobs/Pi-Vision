import { useMemo, useState } from 'react'
import { useFirebaseValue } from '../hooks/useFirebaseData'
import { DBEvent } from '../types'

export default function Analytics() {
  const todayStr = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)
  const [hoveredDay, setHoveredDay]   = useState<number | null>(null)

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

  const { data: allCounts } = useFirebaseValue<Record<string, { total: number }>>(
    'counts',
    {},
    { cache: false }
  )

  const weekData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key   = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-US', { weekday: 'short' })
      const total = (allCounts as Record<string, { total?: number }>)[key]?.total ?? 0
      days.push({ key, label, total })
    }
    return days
  }, [allCounts])

  const maxWeekly = Math.max(...weekData.map(d => d.total), 1)

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

  const maxHourly    = Math.max(...hourlyData, 1)
  const displayTotal = dailyTotal > 0 ? dailyTotal : filteredEvents.length
  const tableEvents  = filteredEvents.slice(0, 50)

  const BAR_HEIGHT      = 80
  const WEEK_BAR_HEIGHT = 60

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

      {/* 7-day overview */}
      <div className="glass-card chart-card">
        <div className="chart-title">Last 7 Days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: WEEK_BAR_HEIGHT + 28, paddingBottom: 22, position: 'relative' }}>
          {weekData.map((day, i) => (
            <div
              key={day.key}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                position: 'relative',
                cursor: 'pointer',
              }}
              onClick={() => setSelectedDate(day.key)}
              onMouseEnter={() => setHoveredDay(i)}
              onMouseLeave={() => setHoveredDay(null)}
            >
              {hoveredDay === i && day.total > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: `calc(${(day.total / maxWeekly) * WEEK_BAR_HEIGHT}px + 6px)`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(15,20,30,0.92)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '3px 7px',
                  borderRadius: 5,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}>
                  {day.total}
                </div>
              )}
              <div style={{
                width: '100%',
                height: `${(day.total / maxWeekly) * WEEK_BAR_HEIGHT}px`,
                minHeight: day.total > 0 ? 3 : 0,
                background: day.key === selectedDate
                  ? '#1d6ef4'
                  : day.key === todayStr
                  ? 'rgba(29,110,244,0.7)'
                  : hoveredDay === i
                  ? 'rgba(29,110,244,0.55)'
                  : 'rgba(29,110,244,0.25)',
                borderRadius: '3px 3px 0 0',
                transition: 'height 0.2s, background 0.15s',
              }} />
            </div>
          ))}
          {/* X-axis labels */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', pointerEvents: 'none' }}>
            {weekData.map(day => (
              <div key={day.key} style={{ flex: 1, textAlign: 'center' }}>
                <span className="bar-label">{day.label}</span>
              </div>
            ))}
          </div>
        </div>
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
                  bottom: `calc(${(v / maxHourly) * BAR_HEIGHT}px + 6px)`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(15,20,30,0.92)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '3px 7px',
                  borderRadius: 5,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}>
                  {v}
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
