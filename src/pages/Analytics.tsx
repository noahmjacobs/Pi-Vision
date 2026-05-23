import { useMemo, useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { DBEvent, DBViolationEvent } from '../types'

const localDate = (ts: number) => new Date(ts).toLocaleDateString('en-CA')

export const PALETTE = [
  '#1d6ef4', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
]

export function deviceColor(color: string | undefined, index: number) {
  return color ?? PALETTE[index % PALETTE.length]
}

function DonutChart({ slices, total }: {
  slices: { label: string; value: number; color: string }[]
  total: number
}) {
  const size = 130
  const strokeWidth = 24
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  let cursor = 0

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      {total === 0 ? (
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="rgba(0,0,0,0.08)" strokeWidth={strokeWidth} />
      ) : slices.map((sl, i) => {
        const frac  = sl.value / total
        const dash  = frac * circ
        const start = cursor
        cursor += frac
        return (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={sl.color} strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={-(start * circ) + circ * 0.25}
          />
        )
      })}
    </svg>
  )
}

function PeopleCounterAnalytics() {
  const { companyId, devices } = useAuth()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [hoveredHour, setHoveredHour]   = useState<number | null>(null)
  const [hoveredDay,  setHoveredDay]    = useState<number | null>(null)

  const [deviceEventsMap, setDeviceEventsMap] = useState<Record<string, DBEvent[]>>({})
  const [deviceCountsMap, setDeviceCountsMap] = useState<Record<string, Record<string, { total?: number }>>>({})

  useEffect(() => {
    if (!companyId || !devices.length) return
    const rawEvents: Record<string, Record<string, DBEvent>> = {}
    const rawCounts: Record<string, Record<string, { total?: number }>> = {}
    const unsubs: (() => void)[] = []

    devices.forEach(device => {
      const evRef = ref(db, `companies/${companyId}/devices/${device.id}/events`)
      const coRef = ref(db, `companies/${companyId}/devices/${device.id}/counts`)

      unsubs.push(onValue(evRef, snap => {
        rawEvents[device.id] = snap.exists() ? snap.val() : {}
        setDeviceEventsMap(prev => ({
          ...prev,
          [device.id]: Object.values(rawEvents[device.id]),
        }))
      }))

      unsubs.push(onValue(coRef, snap => {
        rawCounts[device.id] = snap.exists() ? snap.val() : {}
        setDeviceCountsMap(prev => ({ ...prev, [device.id]: rawCounts[device.id] }))
      }))
    })

    return () => unsubs.forEach(fn => fn())
  }, [companyId, devices.map(d => d.id).join(',')])

  const allEvents = useMemo(() =>
    Object.values(deviceEventsMap).flat(), [deviceEventsMap])

  const combinedCounts = useMemo(() => {
    const out: Record<string, number> = {}
    Object.values(deviceCountsMap).forEach(counts => {
      Object.entries(counts).forEach(([date, val]) => {
        out[date] = (out[date] ?? 0) + (val.total ?? 0)
      })
    })
    return out
  }, [deviceCountsMap])

  // Per-camera breakdown for selected date + optional hour
  const perCamera = useMemo(() => {
    return devices.map((device, i) => {
      const events = (deviceEventsMap[device.id] ?? []).filter(ev => {
        if (ev.type !== 'person') return false
        if (localDate(ev.timestamp) !== selectedDate) return false
        if (selectedHour !== null && new Date(ev.timestamp).getHours() !== selectedHour) return false
        return true
      })
      return {
        device,
        count: events.length,
        color: deviceColor(device.color, i),
      }
    })
  }, [devices, deviceEventsMap, selectedDate, selectedHour])

  const weekData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key   = d.toLocaleDateString('en-CA')
      const label = d.toLocaleDateString('en-US', { weekday: 'short' })
      days.push({ key, label, total: combinedCounts[key] ?? 0 })
    }
    return days
  }, [combinedCounts])

  const maxWeekly = Math.max(...weekData.map(d => d.total), 1)

  const filteredEvents = useMemo(() =>
    allEvents
      .filter(ev => ev.type === 'person' && localDate(ev.timestamp) === selectedDate)
      .sort((a, b) => b.timestamp - a.timestamp),
    [allEvents, selectedDate])

  const hourlyData = useMemo(() => {
    const counts = Array(24).fill(0)
    for (const ev of filteredEvents) counts[new Date(ev.timestamp).getHours()]++
    return counts
  }, [filteredEvents])

  const maxHourly = Math.max(...hourlyData, 1)

  const pieTotalCount = perCamera.reduce((s, c) => s + c.count, 0)
  const displayTotal  = selectedHour !== null
    ? pieTotalCount
    : (combinedCounts[selectedDate] ?? pieTotalCount)

  const tableEvents = filteredEvents.slice(0, 50)
  const BAR_HEIGHT      = 80
  const WEEK_BAR_HEIGHT = 60

  function fmtHour(h: number) {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const disp = h % 12 || 12
    return `${disp}${ampm}`
  }

  return (
    <div className="analytics-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-subtitle">
            People crossings · all cameras{devices.length > 1 ? ` (${devices.length})` : ''}
          </div>
        </div>
        <input
          type="date" value={selectedDate} max={todayStr}
          onChange={e => { setSelectedDate(e.target.value); setSelectedHour(null) }}
          style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8, color: 'var(--text-primary)', fontSize: 14,
            padding: '6px 12px', cursor: 'pointer',
          }}
        />
      </div>

      {/* 7-day overview */}
      <div className="glass-card chart-card">
        <div className="chart-title">Last 7 Days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: WEEK_BAR_HEIGHT + 28, paddingBottom: 22, position: 'relative' }}>
          {weekData.map((day, i) => (
            <div key={day.key}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: 'pointer' }}
              onClick={() => { setSelectedDate(day.key); setSelectedHour(null) }}
              onMouseEnter={() => setHoveredDay(i)}
              onMouseLeave={() => setHoveredDay(null)}
            >
              {hoveredDay === i && day.total > 0 && (
                <div style={{
                  position: 'absolute', bottom: `calc(${(day.total / maxWeekly) * WEEK_BAR_HEIGHT}px + 6px)`,
                  left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(15,20,30,0.92)', color: '#fff',
                  fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                  whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
                }}>{day.total}</div>
              )}
              <div style={{
                width: '100%', height: `${(day.total / maxWeekly) * WEEK_BAR_HEIGHT}px`,
                minHeight: day.total > 0 ? 3 : 0,
                background: day.key === selectedDate ? '#1d6ef4'
                  : day.key === todayStr ? 'rgba(29,110,244,0.7)'
                  : hoveredDay === i ? 'rgba(29,110,244,0.55)' : 'rgba(29,110,244,0.25)',
                borderRadius: '3px 3px 0 0', transition: 'height 0.2s, background 0.15s',
              }} />
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', pointerEvents: 'none' }}>
            {weekData.map(day => (
              <div key={day.key} style={{ flex: 1, textAlign: 'center' }}>
                <span className="bar-label">{day.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Total crossings + donut */}
      <div className="glass-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>

          {/* Left: number + hour filter */}
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Total Crossings — {selectedDate}
              {selectedHour !== null && ` · ${fmtHour(selectedHour)}`}
            </div>
            <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              {displayTotal.toLocaleString()}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 16 }}>
              people counted across all cameras
            </div>

            {/* Hour filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>Filter hour:</span>
              <select
                value={selectedHour ?? ''}
                onChange={e => setSelectedHour(e.target.value === '' ? null : Number(e.target.value))}
                style={{
                  background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 8, padding: '5px 10px', fontSize: 13,
                  color: 'var(--text-primary)', fontFamily: 'var(--font)', cursor: 'pointer',
                }}
              >
                <option value="">All Day</option>
                {hourlyData.map((v, h) => v > 0 && (
                  <option key={h} value={h}>{fmtHour(h)} ({v})</option>
                ))}
              </select>
              {selectedHour !== null && (
                <button
                  onClick={() => setSelectedHour(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)', padding: 0 }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Right: donut + legend */}
          {devices.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ position: 'relative' }}>
                <DonutChart slices={perCamera.map(c => ({ label: c.device.name, value: c.count, color: c.color }))} total={pieTotalCount} />
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{pieTotalCount}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>total</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {perCamera.map(c => (
                  <div key={c.device.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{c.device.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.count.toLocaleString()} crossings</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hourly bar chart — click bar to filter pie */}
      <div className="glass-card chart-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="chart-title" style={{ marginBottom: 0 }}>Crossings by Hour</div>
          {selectedHour !== null && (
            <button onClick={() => setSelectedHour(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)' }}>
              Clear filter
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: BAR_HEIGHT + 24, paddingBottom: 20, position: 'relative' }}>
          {hourlyData.map((v, i) => (
            <div key={i}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: v > 0 ? 'pointer' : 'default' }}
              onClick={() => v > 0 && setSelectedHour(i === selectedHour ? null : i)}
              onMouseEnter={() => setHoveredHour(i)}
              onMouseLeave={() => setHoveredHour(null)}
            >
              {hoveredHour === i && v > 0 && (
                <div style={{
                  position: 'absolute', bottom: `calc(${(v / maxHourly) * BAR_HEIGHT}px + 6px)`,
                  left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(15,20,30,0.92)', color: '#fff',
                  fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                  whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
                }}>{v}</div>
              )}
              <div style={{
                width: '100%', height: `${(v / maxHourly) * BAR_HEIGHT}px`, minHeight: v > 0 ? 3 : 0,
                background: i === selectedHour ? '#1d6ef4'
                  : i === new Date().getHours() && selectedDate === todayStr ? 'rgba(29,110,244,0.7)'
                  : hoveredHour === i ? 'rgba(29,110,244,0.65)' : 'rgba(29,110,244,0.35)',
                borderRadius: '3px 3px 0 0', transition: 'height 0.2s, background 0.15s',
                outline: i === selectedHour ? '2px solid rgba(29,110,244,0.4)' : 'none',
              }} />
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
            {[0, 6, 12, 18, 24].map(h => (
              <span key={h} className="bar-label">{h}h</span>
            ))}
          </div>
        </div>
        {selectedHour !== null && (
          <div style={{ fontSize: 12, color: 'var(--accent-blue)', marginTop: 4 }}>
            Showing breakdown for {fmtHour(selectedHour)} — click bar again or "Clear filter" to reset
          </div>
        )}
      </div>

      {/* Event log */}
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

const VEHICLE_COLORS: Record<string, string> = {
  car:        '#1d6ef4',
  truck:      '#f59e0b',
  van:        '#a855f7',
  motorcycle: '#f97316',
}
const VEHICLE_LABELS: Record<string, string> = {
  car: 'Car', truck: 'Truck', van: 'Van', motorcycle: 'Motorcycle',
}

function SeatbeltAnalytics() {
  const { companyId, devices } = useAuth()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [hoveredHour, setHoveredHour]   = useState<number | null>(null)
  const [hoveredDay,  setHoveredDay]    = useState<number | null>(null)

  const [deviceEventsMap, setDeviceEventsMap] = useState<Record<string, DBViolationEvent[]>>({})
  const [deviceCountsMap, setDeviceCountsMap] = useState<Record<string, Record<string, { total?: number }>>>({})

  useEffect(() => {
    if (!companyId || !devices.length) return
    const rawEvents: Record<string, Record<string, DBViolationEvent>> = {}
    const rawCounts: Record<string, Record<string, { total?: number }>> = {}
    const unsubs: (() => void)[] = []

    devices.forEach(device => {
      const evRef = ref(db, `companies/${companyId}/devices/${device.id}/events`)
      const coRef = ref(db, `companies/${companyId}/devices/${device.id}/counts`)
      unsubs.push(onValue(evRef, snap => {
        rawEvents[device.id] = snap.exists() ? snap.val() : {}
        setDeviceEventsMap(prev => ({ ...prev, [device.id]: Object.values(rawEvents[device.id]) }))
      }))
      unsubs.push(onValue(coRef, snap => {
        rawCounts[device.id] = snap.exists() ? snap.val() : {}
        setDeviceCountsMap(prev => ({ ...prev, [device.id]: rawCounts[device.id] }))
      }))
    })
    return () => unsubs.forEach(fn => fn())
  }, [companyId, devices.map(d => d.id).join(',')])

  const allEvents = useMemo(() => Object.values(deviceEventsMap).flat(), [deviceEventsMap])

  const combinedCounts = useMemo(() => {
    const out: Record<string, number> = {}
    Object.values(deviceCountsMap).forEach(counts => {
      Object.entries(counts).forEach(([date, val]) => {
        out[date] = (out[date] ?? 0) + (val.total ?? 0)
      })
    })
    return out
  }, [deviceCountsMap])

  const filteredEvents = useMemo(() =>
    allEvents.filter(ev =>
      localDate(ev.timestamp) === selectedDate &&
      (selectedHour === null || new Date(ev.timestamp).getHours() === selectedHour)
    ).sort((a, b) => b.timestamp - a.timestamp),
    [allEvents, selectedDate, selectedHour])

  const byVehicleType = useMemo(() => {
    const counts: Record<string, number> = { car: 0, truck: 0, van: 0, motorcycle: 0 }
    for (const ev of filteredEvents) {
      const t = ev.vehicleType ?? 'car'
      counts[t] = (counts[t] ?? 0) + 1
    }
    return counts
  }, [filteredEvents])

  const vehicleSlices = Object.entries(byVehicleType)
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({ label: VEHICLE_LABELS[type] ?? type, value, color: VEHICLE_COLORS[type] ?? '#888' }))
  const pieTotal = vehicleSlices.reduce((s, sl) => s + sl.value, 0)

  const weekData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key   = d.toLocaleDateString('en-CA')
      const label = d.toLocaleDateString('en-US', { weekday: 'short' })
      days.push({ key, label, total: combinedCounts[key] ?? 0 })
    }
    return days
  }, [combinedCounts])

  const maxWeekly = Math.max(...weekData.map(d => d.total), 1)

  const hourlyData = useMemo(() => {
    const counts = Array(24).fill(0)
    for (const ev of allEvents.filter(ev => localDate(ev.timestamp) === selectedDate))
      counts[new Date(ev.timestamp).getHours()]++
    return counts
  }, [allEvents, selectedDate])

  const maxHourly = Math.max(...hourlyData, 1)
  const BAR_HEIGHT = 80
  const WEEK_BAR_HEIGHT = 60

  function fmtHour(h: number) {
    const ampm = h >= 12 ? 'PM' : 'AM'; const disp = h % 12 || 12
    return `${disp}${ampm}`
  }

  return (
    <div className="analytics-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-subtitle">Seatbelt violations by vehicle · all cameras</div>
        </div>
        <input type="date" value={selectedDate} max={todayStr}
          onChange={e => { setSelectedDate(e.target.value); setSelectedHour(null) }}
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, padding: '6px 12px', cursor: 'pointer' }} />
      </div>

      {/* 7-day overview */}
      <div className="glass-card chart-card">
        <div className="chart-title">Last 7 Days — Unbelted Occupants</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: WEEK_BAR_HEIGHT + 28, paddingBottom: 22, position: 'relative' }}>
          {weekData.map((day, i) => (
            <div key={day.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: 'pointer' }}
              onClick={() => { setSelectedDate(day.key); setSelectedHour(null) }}
              onMouseEnter={() => setHoveredDay(i)} onMouseLeave={() => setHoveredDay(null)}>
              {hoveredDay === i && day.total > 0 && (
                <div style={{ position: 'absolute', bottom: `calc(${(day.total / maxWeekly) * WEEK_BAR_HEIGHT}px + 6px)`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,20,30,0.92)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>{day.total}</div>
              )}
              <div style={{ width: '100%', height: `${(day.total / maxWeekly) * WEEK_BAR_HEIGHT}px`, minHeight: day.total > 0 ? 3 : 0, background: day.key === selectedDate ? '#ef4444' : day.key === todayStr ? 'rgba(239,68,68,0.7)' : hoveredDay === i ? 'rgba(239,68,68,0.55)' : 'rgba(239,68,68,0.25)', borderRadius: '3px 3px 0 0', transition: 'height 0.2s, background 0.15s' }} />
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', pointerEvents: 'none' }}>
            {weekData.map(day => (
              <div key={day.key} style={{ flex: 1, textAlign: 'center' }}>
                <span className="bar-label">{day.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Totals + vehicle type donut */}
      <div className="glass-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Violations — {selectedDate}{selectedHour !== null && ` · ${fmtHour(selectedHour)}`}
            </div>
            <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              {filteredEvents.length.toLocaleString()}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 16 }}>vehicles with unbelted occupants</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>Filter hour:</span>
              <select value={selectedHour ?? ''} onChange={e => setSelectedHour(e.target.value === '' ? null : Number(e.target.value))}
                style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '5px 10px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font)', cursor: 'pointer' }}>
                <option value="">All Day</option>
                {hourlyData.map((v, h) => v > 0 && <option key={h} value={h}>{fmtHour(h)} ({v})</option>)}
              </select>
              {selectedHour !== null && (
                <button onClick={() => setSelectedHour(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)', padding: 0 }}>Clear</button>
              )}
            </div>
          </div>

          {/* Vehicle type donut */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative' }}>
              <DonutChart slices={vehicleSlices} total={pieTotal} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{pieTotal}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>total</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(VEHICLE_LABELS).map(([type, label]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: VEHICLE_COLORS[type], flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{(byVehicleType[type] ?? 0).toLocaleString()} violations</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hourly bar chart */}
      <div className="glass-card chart-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="chart-title" style={{ marginBottom: 0 }}>Violations by Hour of Day</div>
          {selectedHour !== null && <button onClick={() => setSelectedHour(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)' }}>Clear filter</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: BAR_HEIGHT + 24, paddingBottom: 20, position: 'relative' }}>
          {hourlyData.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: v > 0 ? 'pointer' : 'default' }}
              onClick={() => v > 0 && setSelectedHour(i === selectedHour ? null : i)}
              onMouseEnter={() => setHoveredHour(i)} onMouseLeave={() => setHoveredHour(null)}>
              {hoveredHour === i && v > 0 && (
                <div style={{ position: 'absolute', bottom: `calc(${(v / maxHourly) * BAR_HEIGHT}px + 6px)`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,20,30,0.92)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>{v}</div>
              )}
              <div style={{ width: '100%', height: `${(v / maxHourly) * BAR_HEIGHT}px`, minHeight: v > 0 ? 3 : 0, background: i === selectedHour ? '#ef4444' : i === new Date().getHours() && selectedDate === todayStr ? 'rgba(239,68,68,0.7)' : hoveredHour === i ? 'rgba(239,68,68,0.65)' : 'rgba(239,68,68,0.35)', borderRadius: '3px 3px 0 0', transition: 'height 0.2s, background 0.15s' }} />
          </div>
          ))}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
            {[0, 6, 12, 18, 24].map(h => <span key={h} className="bar-label">{h}h</span>)}
          </div>
        </div>
      </div>

      {/* Violation event log */}
      <div className="glass-card analytics-table-card">
        <div className="table-title">
          Vehicle Log — {filteredEvents.length} violation{filteredEvents.length !== 1 ? 's' : ''}
          {filteredEvents.length > 50 ? ` (showing 50 of ${filteredEvents.length})` : ''}
        </div>
        {filteredEvents.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '16px 0' }}>No violations recorded for {selectedDate}.</div>
        ) : (
          <table className="events-table">
            <thead>
              <tr><th>Time</th><th>Vehicle</th><th>Unbelted</th><th>Details</th></tr>
            </thead>
            <tbody>
              {filteredEvents.slice(0, 50).map(ev => (
                <tr key={ev.id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td style={{ fontWeight: 500 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: VEHICLE_COLORS[ev.vehicleType] ?? '#888', display: 'inline-block' }} />
                      {VEHICLE_LABELS[ev.vehicleType] ?? ev.vehicleType}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, color: '#ef4444' }}>{ev.unbelted}</td>
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

export default function Analytics() {
  const { companyMode } = useAuth()
  return companyMode === 'seatbelt'
    ? <SeatbeltAnalytics />
    : <PeopleCounterAnalytics />
}
