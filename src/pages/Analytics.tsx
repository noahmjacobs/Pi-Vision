import { useMemo, useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { DBEvent, DBVehicleEvent, DBUpload } from '../types'

const localDate = (ts: number) => new Date(ts).toLocaleDateString('en-CA')

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}`
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

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
  const [hovered, setHovered] = useState<number | null>(null)
  const size        = 130
  const strokeWidth = 24
  const r           = (size - strokeWidth) / 2
  const circ        = 2 * Math.PI * r
  let cursor        = 0

  const built = slices.map((sl, i) => {
    const frac  = sl.value / total
    const dash  = frac * circ
    const start = cursor
    cursor += frac
    return { sl, i, dash, start }
  })

  const tip = hovered !== null ? slices[hovered] : null

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {total === 0 ? (
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="rgba(0,0,0,0.08)" strokeWidth={strokeWidth} />
        ) : built.map(({ sl, i, dash, start }) => (
          <circle
            key={i}
            cx={size/2} cy={size/2} r={r} fill="none"
            stroke={sl.color}
            strokeWidth={hovered === i ? strokeWidth + 5 : strokeWidth}
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={-(start * circ) + circ * 0.25}
            style={{ cursor: 'pointer', transition: 'stroke-width 0.15s' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
      {tip && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%) rotate(0deg)',
          pointerEvents: 'none', textAlign: 'center', width: 90,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: tip.color, lineHeight: 1 }}>
            {tip.value}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.2 }}>
            {tip.label}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            {total > 0 ? Math.round(tip.value / total * 100) : 0}%
          </div>
        </div>
      )}
    </div>
  )
}

function PeopleCounterAnalytics() {
  const { companyId, devices } = useAuth()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [hoveredHour, setHoveredHour]   = useState<number | null>(null)
  const [hoveredDay,  setHoveredDay]    = useState<number | null>(null)

  const [deviceEventsMap,  setDeviceEventsMap]  = useState<Record<string, DBEvent[]>>({})
  const [deviceCountsMap,  setDeviceCountsMap]  = useState<Record<string, Record<string, { total?: number }>>>({})
  const [deviceUploadsMap, setDeviceUploadsMap] = useState<Record<string, Record<string, DBUpload>>>({})

  useEffect(() => {
    if (!companyId || !devices.length) return
    const rawEvents:  Record<string, Record<string, DBEvent>>            = {}
    const rawCounts:  Record<string, Record<string, { total?: number }>> = {}
    const rawUploads: Record<string, Record<string, DBUpload>>           = {}
    const unsubs: (() => void)[] = []

    devices.forEach(device => {
      const evRef = ref(db, `companies/${companyId}/devices/${device.id}/events`)
      const coRef = ref(db, `companies/${companyId}/devices/${device.id}/counts`)
      const upRef = ref(db, `companies/${companyId}/devices/${device.id}/uploads`)

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

      unsubs.push(onValue(upRef, snap => {
        rawUploads[device.id] = snap.exists() ? snap.val() : {}
        setDeviceUploadsMap(prev => ({ ...prev, [device.id]: rawUploads[device.id] }))
      }))
    })

    return () => unsubs.forEach(fn => fn())
  }, [companyId, devices.map(d => d.id).join(',')])

  const allEvents = useMemo(() =>
    Object.values(deviceEventsMap).flat(), [deviceEventsMap])

  const allUploads = useMemo(() => {
    const out: Record<string, DBUpload> = {}
    Object.values(deviceUploadsMap).forEach(uploads => {
      Object.entries(uploads).forEach(([id, upload]) => { out[id] = upload })
    })
    return out
  }, [deviceUploadsMap])

  const combinedCounts = useMemo(() => {
    const out: Record<string, number> = {}
    Object.values(deviceCountsMap).forEach(counts => {
      Object.entries(counts).forEach(([date, val]) => {
        out[date] = (out[date] ?? 0) + (val.total ?? 0)
      })
    })
    return out
  }, [deviceCountsMap])

  const perCamera = useMemo(() => {
    return devices.map((device, i) => {
      const events = (deviceEventsMap[device.id] ?? []).filter(ev => {
        if (ev.type !== 'person') return false
        if (selectedDate && localDate(ev.timestamp) !== selectedDate) return false
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
      .filter(ev => ev.type === 'person' && (!selectedDate || localDate(ev.timestamp) === selectedDate))
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
    : selectedDate ? (combinedCounts[selectedDate] ?? pieTotalCount) : pieTotalCount

  const groupedEvents = useMemo(() => {
    const groups: Record<string, DBEvent[]> = {}
    for (const ev of filteredEvents) {
      const key = ev.uploadId ?? '__unknown__'
      if (!groups[key]) groups[key] = []
      groups[key].push(ev)
    }
    return groups
  }, [filteredEvents])

  const sortedGroupKeys = useMemo(() =>
    Object.keys(groupedEvents).sort((a, b) => {
      const aTime = allUploads[a]?.processedAt ?? Math.max(...(groupedEvents[a] ?? []).map(e => e.timestamp), 0)
      const bTime = allUploads[b]?.processedAt ?? Math.max(...(groupedEvents[b] ?? []).map(e => e.timestamp), 0)
      return bTime - aTime
    }),
  [groupedEvents, allUploads])

  const BAR_HEIGHT      = 80
  const WEEK_BAR_HEIGHT = 60

  function fmtHour(h: number) {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const disp = h % 12 || 12
    return `${disp}${ampm}`
  }

  function exportCSV() {
    const rows = filteredEvents.map(ev => [
      new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      ev.label,
      ev.sublabel,
    ])
    downloadCSV(`people-counter-${selectedDate || 'all'}.csv`, rows, ['Time', 'Label', 'Details'])
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={exportCSV}
            disabled={filteredEvents.length === 0}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(29,110,244,0.3)', background: 'rgba(29,110,244,0.08)', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)', cursor: filteredEvents.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredEvents.length === 0 ? 0.5 : 1 }}
          >
            ↓ Export CSV
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Video date:</span>
            <input
              type="date" value={selectedDate} max={todayStr}
              onChange={e => { setSelectedDate(e.target.value); setSelectedHour(null) }}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, padding: '6px 12px', cursor: 'pointer' }}
            />
            {selectedDate && (
              <button onClick={() => { setSelectedDate(''); setSelectedHour(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)', padding: 0 }}>
                Show all
              </button>
            )}
          </div>
        </div>
      </div>

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

      <div className="glass-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>Filter hour:</span>
              <select
                value={selectedHour ?? ''}
                onChange={e => setSelectedHour(e.target.value === '' ? null : Number(e.target.value))}
                style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '5px 10px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font)', cursor: 'pointer' }}
              >
                <option value="">All Day</option>
                {hourlyData.map((v, h) => v > 0 && (
                  <option key={h} value={h}>{fmtHour(h)} ({v})</option>
                ))}
              </select>
              {selectedHour !== null && (
                <button onClick={() => setSelectedHour(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)', padding: 0 }}>Clear</button>
              )}
            </div>
          </div>
          {devices.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ position: 'relative' }}>
                <DonutChart slices={perCamera.map(c => ({ label: c.device.name, value: c.count, color: c.color }))} total={pieTotalCount} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
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

      <div className="glass-card chart-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="chart-title" style={{ marginBottom: 0 }}>Crossings by Hour</div>
          {selectedHour !== null && (
            <button onClick={() => setSelectedHour(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)' }}>Clear filter</button>
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
                <div style={{ position: 'absolute', bottom: `calc(${(v / maxHourly) * BAR_HEIGHT}px + 6px)`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,20,30,0.92)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>{v}</div>
              )}
              <div style={{ width: '100%', height: `${(v / maxHourly) * BAR_HEIGHT}px`, minHeight: v > 0 ? 3 : 0, background: i === selectedHour ? '#1d6ef4' : i === new Date().getHours() && selectedDate === todayStr ? 'rgba(29,110,244,0.7)' : hoveredHour === i ? 'rgba(29,110,244,0.65)' : 'rgba(29,110,244,0.35)', borderRadius: '3px 3px 0 0', transition: 'height 0.2s, background 0.15s', outline: i === selectedHour ? '2px solid rgba(29,110,244,0.4)' : 'none' }} />
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
            {[0, 6, 12, 18, 24].map(h => <span key={h} className="bar-label">{h}h</span>)}
          </div>
        </div>
        {selectedHour !== null && (
          <div style={{ fontSize: 12, color: 'var(--accent-blue)', marginTop: 4 }}>
            Showing breakdown for {fmtHour(selectedHour)} — click bar again or "Clear filter" to reset
          </div>
        )}
      </div>

      <div className="glass-card analytics-table-card">
        <div className="table-title">
          Upload Log — {filteredEvents.length} crossing{filteredEvents.length !== 1 ? 's' : ''}
          {sortedGroupKeys.length > 1 ? ` · ${sortedGroupKeys.length} uploads` : ''}
        </div>
        {filteredEvents.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '16px 0' }}>
            No crossings recorded{selectedDate ? ` for ${selectedDate}` : ''}.
          </div>
        ) : sortedGroupKeys.map((uploadId, gi) => {
          const events = groupedEvents[uploadId]
          const upload = allUploads[uploadId]
          const videoDate = upload?.videoDate
            ? new Date(upload.videoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : events.length > 0
              ? new Date(Math.min(...events.map(e => e.timestamp))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : null
          const uploadTime = upload
            ? new Date(upload.processedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : null
          return (
            <div key={uploadId} style={{ marginBottom: gi < sortedGroupKeys.length - 1 ? 20 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 0 8px 0', borderTop: gi > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none', marginTop: gi > 0 ? 8 : 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {upload?.filename ?? 'Upload'}
                </span>
                {videoDate && <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>Video: {videoDate}</span>}
                {uploadTime && <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>· Uploaded {uploadTime}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.06)', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                  {events.length} crossing{events.length !== 1 ? 's' : ''}
                </span>
              </div>
              <table className="events-table">
                <thead><tr><th>Time</th><th>Label</th><th>Details</th></tr></thead>
                <tbody>
                  {events.map(ev => (
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CarCounterAnalytics() {
  const { companyId, devices } = useAuth()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [hoveredHour, setHoveredHour]   = useState<number | null>(null)
  const [hoveredDay,  setHoveredDay]    = useState<number | null>(null)

  const [deviceEventsMap,  setDeviceEventsMap]  = useState<Record<string, DBEvent[]>>({})
  const [deviceCountsMap,  setDeviceCountsMap]  = useState<Record<string, Record<string, { total?: number }>>>({})
  const [deviceUploadsMap, setDeviceUploadsMap] = useState<Record<string, Record<string, DBUpload>>>({})

  useEffect(() => {
    if (!companyId || !devices.length) return
    const rawEvents:  Record<string, Record<string, DBEvent>>            = {}
    const rawCounts:  Record<string, Record<string, { total?: number }>> = {}
    const rawUploads: Record<string, Record<string, DBUpload>>           = {}
    const unsubs: (() => void)[] = []

    devices.forEach(device => {
      const evRef = ref(db, `companies/${companyId}/devices/${device.id}/events`)
      const coRef = ref(db, `companies/${companyId}/devices/${device.id}/counts`)
      const upRef = ref(db, `companies/${companyId}/devices/${device.id}/uploads`)

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

      unsubs.push(onValue(upRef, snap => {
        rawUploads[device.id] = snap.exists() ? snap.val() : {}
        setDeviceUploadsMap(prev => ({ ...prev, [device.id]: rawUploads[device.id] }))
      }))
    })

    return () => unsubs.forEach(fn => fn())
  }, [companyId, devices.map(d => d.id).join(',')])

  const allEvents = useMemo(() =>
    Object.values(deviceEventsMap).flat(), [deviceEventsMap])

  const allUploads = useMemo(() => {
    const out: Record<string, DBUpload> = {}
    Object.values(deviceUploadsMap).forEach(uploads => {
      Object.entries(uploads).forEach(([id, upload]) => { out[id] = upload })
    })
    return out
  }, [deviceUploadsMap])

  const combinedCounts = useMemo(() => {
    const out: Record<string, number> = {}
    Object.values(deviceCountsMap).forEach(counts => {
      Object.entries(counts).forEach(([date, val]) => {
        out[date] = (out[date] ?? 0) + (val.total ?? 0)
      })
    })
    return out
  }, [deviceCountsMap])

  const perCamera = useMemo(() => {
    return devices.map((device, i) => {
      const events = (deviceEventsMap[device.id] ?? []).filter(ev => {
        if (ev.type !== 'vehicle') return false
        if (selectedDate && localDate(ev.timestamp) !== selectedDate) return false
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
      .filter(ev => ev.type === 'vehicle' && (!selectedDate || localDate(ev.timestamp) === selectedDate))
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
    : selectedDate ? (combinedCounts[selectedDate] ?? pieTotalCount) : pieTotalCount

  const groupedEvents = useMemo(() => {
    const groups: Record<string, DBEvent[]> = {}
    for (const ev of filteredEvents) {
      const key = ev.uploadId ?? '__unknown__'
      if (!groups[key]) groups[key] = []
      groups[key].push(ev)
    }
    return groups
  }, [filteredEvents])

  const sortedGroupKeys = useMemo(() =>
    Object.keys(groupedEvents).sort((a, b) => {
      const aTime = allUploads[a]?.processedAt ?? Math.max(...(groupedEvents[a] ?? []).map(e => e.timestamp), 0)
      const bTime = allUploads[b]?.processedAt ?? Math.max(...(groupedEvents[b] ?? []).map(e => e.timestamp), 0)
      return bTime - aTime
    }),
  [groupedEvents, allUploads])

  const BAR_HEIGHT      = 80
  const WEEK_BAR_HEIGHT = 60

  function fmtHour(h: number) {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const disp = h % 12 || 12
    return `${disp}${ampm}`
  }

  function exportCSV() {
    const rows = filteredEvents.map(ev => [
      new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      ev.label,
      ev.sublabel,
    ])
    downloadCSV(`vehicle-counter-${selectedDate || 'all'}.csv`, rows, ['Time', 'Label', 'Details'])
  }

  return (
    <div className="analytics-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-subtitle">
            Vehicle crossings · all cameras{devices.length > 1 ? ` (${devices.length})` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={exportCSV}
            disabled={filteredEvents.length === 0}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(29,110,244,0.3)', background: 'rgba(29,110,244,0.08)', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)', cursor: filteredEvents.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredEvents.length === 0 ? 0.5 : 1 }}
          >
            ↓ Export CSV
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Video date:</span>
            <input
              type="date" value={selectedDate} max={todayStr}
              onChange={e => { setSelectedDate(e.target.value); setSelectedHour(null) }}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, padding: '6px 12px', cursor: 'pointer' }}
            />
            {selectedDate && (
              <button onClick={() => { setSelectedDate(''); setSelectedHour(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)', padding: 0 }}>
                Show all
              </button>
            )}
          </div>
        </div>
      </div>

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
                background: day.key === selectedDate ? '#10b981'
                  : day.key === todayStr ? 'rgba(16,185,129,0.7)'
                  : hoveredDay === i ? 'rgba(16,185,129,0.55)' : 'rgba(16,185,129,0.25)',
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

      <div className="glass-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Total Crossings — {selectedDate}
              {selectedHour !== null && ` · ${fmtHour(selectedHour)}`}
            </div>
            <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              {displayTotal.toLocaleString()}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 16 }}>
              vehicles counted across all cameras
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>Filter hour:</span>
              <select
                value={selectedHour ?? ''}
                onChange={e => setSelectedHour(e.target.value === '' ? null : Number(e.target.value))}
                style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '5px 10px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font)', cursor: 'pointer' }}
              >
                <option value="">All Day</option>
                {hourlyData.map((v, h) => v > 0 && (
                  <option key={h} value={h}>{fmtHour(h)} ({v})</option>
                ))}
              </select>
              {selectedHour !== null && (
                <button onClick={() => setSelectedHour(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)', padding: 0 }}>Clear</button>
              )}
            </div>
          </div>
          {devices.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ position: 'relative' }}>
                <DonutChart slices={perCamera.map(c => ({ label: c.device.name, value: c.count, color: c.color }))} total={pieTotalCount} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
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

      <div className="glass-card chart-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="chart-title" style={{ marginBottom: 0 }}>Crossings by Hour</div>
          {selectedHour !== null && (
            <button onClick={() => setSelectedHour(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)' }}>Clear filter</button>
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
                <div style={{ position: 'absolute', bottom: `calc(${(v / maxHourly) * BAR_HEIGHT}px + 6px)`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,20,30,0.92)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>{v}</div>
              )}
              <div style={{ width: '100%', height: `${(v / maxHourly) * BAR_HEIGHT}px`, minHeight: v > 0 ? 3 : 0, background: i === selectedHour ? '#10b981' : i === new Date().getHours() && selectedDate === todayStr ? 'rgba(16,185,129,0.7)' : hoveredHour === i ? 'rgba(16,185,129,0.65)' : 'rgba(16,185,129,0.35)', borderRadius: '3px 3px 0 0', transition: 'height 0.2s, background 0.15s', outline: i === selectedHour ? '2px solid rgba(16,185,129,0.4)' : 'none' }} />
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
            {[0, 6, 12, 18, 24].map(h => <span key={h} className="bar-label">{h}h</span>)}
          </div>
        </div>
        {selectedHour !== null && (
          <div style={{ fontSize: 12, color: 'var(--accent-blue)', marginTop: 4 }}>
            Showing breakdown for {fmtHour(selectedHour)} — click bar again or "Clear filter" to reset
          </div>
        )}
      </div>

      <div className="glass-card analytics-table-card">
        <div className="table-title">
          Upload Log — {filteredEvents.length} crossing{filteredEvents.length !== 1 ? 's' : ''}
          {sortedGroupKeys.length > 1 ? ` · ${sortedGroupKeys.length} uploads` : ''}
        </div>
        {filteredEvents.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '16px 0' }}>
            No crossings recorded{selectedDate ? ` for ${selectedDate}` : ''}.
          </div>
        ) : sortedGroupKeys.map((uploadId, gi) => {
          const events = groupedEvents[uploadId]
          const upload = allUploads[uploadId]
          const videoDate = upload?.videoDate
            ? new Date(upload.videoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : events.length > 0
              ? new Date(Math.min(...events.map(e => e.timestamp))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : null
          const uploadTime = upload
            ? new Date(upload.processedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : null
          return (
            <div key={uploadId} style={{ marginBottom: gi < sortedGroupKeys.length - 1 ? 20 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 0 8px 0', borderTop: gi > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none', marginTop: gi > 0 ? 8 : 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {upload?.filename ?? 'Upload'}
                </span>
                {videoDate && <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>Video: {videoDate}</span>}
                {uploadTime && <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>· Uploaded {uploadTime}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.06)', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                  {events.length} crossing{events.length !== 1 ? 's' : ''}
                </span>
              </div>
              <table className="events-table">
                <thead><tr><th>Time</th><th>Label</th><th>Details</th></tr></thead>
                <tbody>
                  {events.map(ev => (
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

const VEHICLE_COLORS: Record<string, string> = {
  car:   '#1d6ef4',
  truck: '#f59e0b',
  van:   '#a855f7',
  suv:   '#22c55e',
}
const VEHICLE_LABELS: Record<string, string> = {
  car: 'Car', truck: 'Truck', van: 'Van', suv: 'SUV',
}

function seatbeltLabel(ev: DBVehicleEvent): string {
  if (ev.occupants === 1) return ev.seatbelts === 'driver' ? 'Belted' : 'Unbelted'
  if (ev.seatbelts === 'both')      return 'Both belted'
  if (ev.seatbelts === 'driver')    return 'Passenger unbelted'
  if (ev.seatbelts === 'passenger') return 'Driver unbelted'
  return 'Both unbelted'
}

function isCompliant(ev: DBVehicleEvent): boolean {
  return ev.occupants === 1 ? ev.seatbelts === 'driver' : ev.seatbelts === 'both'
}

function SeatbeltAnalytics() {
  const { companyId, devices } = useAuth()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [hoveredHour, setHoveredHour]   = useState<number | null>(null)
  const [hoveredDay,  setHoveredDay]    = useState<number | null>(null)

  const [deviceEventsMap,  setDeviceEventsMap]  = useState<Record<string, DBVehicleEvent[]>>({})
  const [deviceCountsMap,  setDeviceCountsMap]  = useState<Record<string, Record<string, { total?: number }>>>({})
  const [deviceUploadsMap, setDeviceUploadsMap] = useState<Record<string, Record<string, DBUpload>>>({})

  useEffect(() => {
    if (!companyId || !devices.length) return
    const rawEvents:  Record<string, Record<string, DBVehicleEvent>> = {}
    const rawCounts:  Record<string, Record<string, { total?: number }>> = {}
    const rawUploads: Record<string, Record<string, DBUpload>> = {}
    const unsubs: (() => void)[] = []

    devices.forEach(device => {
      const evRef = ref(db, `companies/${companyId}/devices/${device.id}/events`)
      const coRef = ref(db, `companies/${companyId}/devices/${device.id}/counts`)
      const upRef = ref(db, `companies/${companyId}/devices/${device.id}/uploads`)

      unsubs.push(onValue(evRef, snap => {
        rawEvents[device.id] = snap.exists() ? snap.val() : {}
        setDeviceEventsMap(prev => ({ ...prev, [device.id]: Object.values(rawEvents[device.id]) }))
      }))
      unsubs.push(onValue(coRef, snap => {
        rawCounts[device.id] = snap.exists() ? snap.val() : {}
        setDeviceCountsMap(prev => ({ ...prev, [device.id]: rawCounts[device.id] }))
      }))
      unsubs.push(onValue(upRef, snap => {
        rawUploads[device.id] = snap.exists() ? snap.val() : {}
        setDeviceUploadsMap(prev => ({ ...prev, [device.id]: rawUploads[device.id] }))
      }))
    })
    return () => unsubs.forEach(fn => fn())
  }, [companyId, devices.map(d => d.id).join(',')])

  const allEvents = useMemo(() => Object.values(deviceEventsMap).flat(), [deviceEventsMap])

  const allUploads = useMemo(() => {
    const out: Record<string, DBUpload> = {}
    Object.values(deviceUploadsMap).forEach(uploads => {
      Object.entries(uploads).forEach(([id, upload]) => { out[id] = upload })
    })
    return out
  }, [deviceUploadsMap])

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

  const groupedEvents = useMemo(() => {
    const groups: Record<string, DBVehicleEvent[]> = {}
    for (const ev of filteredEvents) {
      const key = ev.uploadId ?? '__unknown__'
      if (!groups[key]) groups[key] = []
      groups[key].push(ev)
    }
    return groups
  }, [filteredEvents])

  const sortedGroupKeys = useMemo(() => {
    return Object.keys(groupedEvents).sort((a, b) => {
      const aTime = allUploads[a]?.processedAt ?? Math.max(...(groupedEvents[a] ?? []).map(e => e.timestamp), 0)
      const bTime = allUploads[b]?.processedAt ?? Math.max(...(groupedEvents[b] ?? []).map(e => e.timestamp), 0)
      return bTime - aTime
    })
  }, [groupedEvents, allUploads])

  const byVehicleType = useMemo(() => {
    const counts: Record<string, number> = { car: 0, truck: 0, van: 0, suv: 0 }
    for (const ev of filteredEvents) counts[ev.vehicleType] = (counts[ev.vehicleType] ?? 0) + 1
    return counts
  }, [filteredEvents])

  const complianceStats = useMemo(() => {
    const total      = filteredEvents.length
    const compliant  = filteredEvents.filter(isCompliant).length
    const distracted = filteredEvents.filter(ev => ev.driverDistracted).length
    return { total, compliant, distracted }
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
    const ampm = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}${ampm}`
  }

  const complianceRate = complianceStats.total > 0
    ? Math.round((complianceStats.compliant / complianceStats.total) * 100)
    : null
  const distractedRate = complianceStats.total > 0
    ? Math.round((complianceStats.distracted / complianceStats.total) * 100)
    : null

  function exportCSV() {
    const rows = filteredEvents.map(ev => [
      new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      VEHICLE_LABELS[ev.vehicleType] ?? ev.vehicleType,
      String(ev.occupants),
      seatbeltLabel(ev),
      ev.driverDistracted ? 'Yes' : 'No',
      ev.uploadId ? (allUploads[ev.uploadId]?.filename ?? ev.uploadId) : '',
    ])
    downloadCSV(`traffic-log-${selectedDate}.csv`, rows, ['Time', 'Vehicle', 'Occupants', 'Seatbelts', 'Distracted', 'Upload'])
  }

  return (
    <div className="analytics-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-subtitle">Traffic log · all cameras</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={exportCSV}
            disabled={filteredEvents.length === 0}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(29,110,244,0.3)', background: 'rgba(29,110,244,0.08)', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)', cursor: filteredEvents.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredEvents.length === 0 ? 0.5 : 1 }}
          >
            ↓ Export CSV
          </button>
          <input type="date" value={selectedDate} max={todayStr}
            onChange={e => { setSelectedDate(e.target.value); setSelectedHour(null) }}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, padding: '6px 12px', cursor: 'pointer' }} />
        </div>
      </div>

      <div className="glass-card chart-card">
        <div className="chart-title">Last 7 Days — Vehicles Logged</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: WEEK_BAR_HEIGHT + 28, paddingBottom: 22, position: 'relative' }}>
          {weekData.map((day, i) => (
            <div key={day.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: 'pointer' }}
              onClick={() => { setSelectedDate(day.key); setSelectedHour(null) }}
              onMouseEnter={() => setHoveredDay(i)} onMouseLeave={() => setHoveredDay(null)}>
              {hoveredDay === i && day.total > 0 && (
                <div style={{ position: 'absolute', bottom: `calc(${(day.total / maxWeekly) * WEEK_BAR_HEIGHT}px + 6px)`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,20,30,0.92)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>{day.total}</div>
              )}
              <div style={{ width: '100%', height: `${(day.total / maxWeekly) * WEEK_BAR_HEIGHT}px`, minHeight: day.total > 0 ? 3 : 0, background: day.key === selectedDate ? '#1d6ef4' : day.key === todayStr ? 'rgba(29,110,244,0.7)' : hoveredDay === i ? 'rgba(29,110,244,0.55)' : 'rgba(29,110,244,0.25)', borderRadius: '3px 3px 0 0', transition: 'height 0.2s, background 0.15s' }} />
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', pointerEvents: 'none' }}>
            {weekData.map(day => <div key={day.key} style={{ flex: 1, textAlign: 'center' }}><span className="bar-label">{day.label}</span></div>)}
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {selectedDate}{selectedHour !== null && ` · ${fmtHour(selectedHour)}`}
            </div>
            <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              {complianceStats.total.toLocaleString()}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>vehicles logged</div>
            <div style={{ display: 'flex', gap: 20, marginTop: 14, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>
                  {complianceRate !== null ? `${complianceRate}%` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>seatbelt compliant</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>
                  {distractedRate !== null ? `${distractedRate}%` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>driver distracted</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>Filter hour:</span>
              <select value={selectedHour ?? ''} onChange={e => setSelectedHour(e.target.value === '' ? null : Number(e.target.value))}
                style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '5px 10px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font)', cursor: 'pointer' }}>
                <option value="">All Day</option>
                {hourlyData.map((v, h) => v > 0 && <option key={h} value={h}>{fmtHour(h)} ({v})</option>)}
              </select>
              {selectedHour !== null && <button onClick={() => setSelectedHour(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-blue)', fontFamily: 'var(--font)', padding: 0 }}>Clear</button>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative' }}>
              <DonutChart slices={vehicleSlices} total={pieTotal} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{pieTotal}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>vehicles</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(VEHICLE_LABELS).map(([type, label]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: VEHICLE_COLORS[type], flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{(byVehicleType[type] ?? 0).toLocaleString()} logged</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card chart-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="chart-title" style={{ marginBottom: 0 }}>Vehicles by Hour of Day</div>
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
              <div style={{ width: '100%', height: `${(v / maxHourly) * BAR_HEIGHT}px`, minHeight: v > 0 ? 3 : 0, background: i === selectedHour ? '#1d6ef4' : i === new Date().getHours() && selectedDate === todayStr ? 'rgba(29,110,244,0.7)' : hoveredHour === i ? 'rgba(29,110,244,0.65)' : 'rgba(29,110,244,0.35)', borderRadius: '3px 3px 0 0', transition: 'height 0.2s, background 0.15s' }} />
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
            {[0, 6, 12, 18, 24].map(h => <span key={h} className="bar-label">{h}h</span>)}
          </div>
        </div>
      </div>

      <div className="glass-card analytics-table-card">
        <div className="table-title">
          Vehicle Log — {filteredEvents.length} vehicle{filteredEvents.length !== 1 ? 's' : ''}
          {sortedGroupKeys.length > 1 ? ` · ${sortedGroupKeys.length} uploads` : ''}
        </div>
        {filteredEvents.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '16px 0' }}>
            No vehicles logged for {selectedDate}.
          </div>
        ) : sortedGroupKeys.map((uploadId, gi) => {
          const events = groupedEvents[uploadId]
          const upload = allUploads[uploadId]
          const uploadTime = upload
            ? new Date(upload.processedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : null
          return (
            <div key={uploadId} style={{ marginBottom: gi < sortedGroupKeys.length - 1 ? 20 : 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '10px 0 8px 0',
                borderTop: gi > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none',
                marginTop: gi > 0 ? 8 : 0,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {upload?.filename ?? 'Upload'}
                </span>
                {uploadTime && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>· {uploadTime}</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.06)', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                  {events.length} vehicle{events.length !== 1 ? 's' : ''}
                </span>
              </div>
              <table className="events-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Vehicle</th>
                    <th>Occ</th>
                    <th>Seatbelts</th>
                    <th>Distracted</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: VEHICLE_COLORS[ev.vehicleType] ?? '#888', display: 'inline-block', flexShrink: 0 }} />
                          {VEHICLE_LABELS[ev.vehicleType] ?? ev.vehicleType}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{ev.occupants}</td>
                      <td style={{ fontWeight: 500, color: isCompliant(ev) ? '#22c55e' : '#ef4444' }}>
                        {seatbeltLabel(ev)}
                      </td>
                      <td style={{ color: ev.driverDistracted ? '#ef4444' : 'var(--text-tertiary)' }}>
                        {ev.driverDistracted ? '📱 Yes' : 'No'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Analytics() {
  const { companyMode } = useAuth()
  if (companyMode === 'seatbelt') return <SeatbeltAnalytics />
  if (companyMode === 'car_counter') return <CarCounterAnalytics />
  return <PeopleCounterAnalytics />
}
