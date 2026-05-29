import { useMemo, useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { DBEvent, DBVehicleEvent, DBUpload } from '../types'

// ─── Utilities ────────────────────────────────────────────────────────────────

const localDate = (ts: number) => new Date(ts).toLocaleDateString('en-CA')

function fmtHour(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}${ampm}`
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  URL.revokeObjectURL(url)
}

// Refined palette — distinct but not garish, works in light and dark mode
export const PALETTE = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#a78bfa', // lavender
  '#fb923c', // orange
]
export function deviceColor(color: string | undefined, index: number) {
  return color ?? PALETTE[index % PALETTE.length]
}

// ─── Chevron icon ──────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s', flexShrink: 0 }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent: string
}) {
  return (
    <div className="glass-card kpi-card">
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.8px' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 5, lineHeight: 1.4 }}>
          {sub}
        </div>
      )}
      <div style={{ height: 3, borderRadius: 2, background: accent, marginTop: 14, opacity: 0.35 }} />
    </div>
  )
}

// ─── Fixed donut chart ────────────────────────────────────────────────────────
// Correct offset formula (no SVG rotation): strokeDashoffset = circ * (0.25 - start)
// This makes segment 0 start at 12 o'clock (top), clockwise.

function DonutChart({ slices, total }: {
  slices: { label: string; value: number; color: string }[]
  total: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const size = 164
  const sw   = 22
  const r    = (size - sw) / 2
  const circ = 2 * Math.PI * r

  let cursor = 0
  const built = slices.map((sl, i) => {
    const frac = total > 0 ? sl.value / total : 0
    const dash = frac * circ
    const off  = cursor
    cursor += frac
    return { sl, i, frac, dash, off }
  })

  return (
    <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <svg width={size} height={size}>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="rgba(0,0,0,0.07)" strokeWidth={sw} />
        ) : built.map(({ sl, i, dash, off }) => (
          <circle
            key={i}
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={sl.color}
            strokeWidth={hovered === i ? sw + 5 : sw}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={circ * (0.25 - off)}
            style={{ cursor: 'pointer', transition: 'stroke-width 0.15s', transformOrigin: `${size / 2}px ${size / 2}px` }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
      {/* Center label */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        {hovered !== null ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: built[hovered].sl.color, lineHeight: 1 }}>
              {built[hovered].sl.value.toLocaleString()}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 3, maxWidth: 72, textAlign: 'center', lineHeight: 1.3, padding: '0 4px' }}>
              {built[hovered].sl.label}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
              {total > 0 ? Math.round(built[hovered].sl.value / total * 100) : 0}%
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              {total.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>total</div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Counter config (people vs car) ───────────────────────────────────────────

interface CounterConfig {
  eventType: 'person' | 'vehicle'
  csvPrefix:  string
  accent:     string
  barSel:     string
  barToday:   string
  barHover:   string
  barNorm:    string
  barOutline: string
}

const PEOPLE_CFG: CounterConfig = {
  eventType: 'person',
  csvPrefix:  'people-counter',
  accent:     '#1d6ef4',
  barSel:     '#1d6ef4',
  barToday:   'rgba(29,110,244,0.7)',
  barHover:   'rgba(29,110,244,0.55)',
  barNorm:    'rgba(29,110,244,0.25)',
  barOutline: 'rgba(29,110,244,0.4)',
}

const CAR_CFG: CounterConfig = {
  eventType: 'vehicle',
  csvPrefix:  'vehicle-counter',
  accent:     '#10b981',
  barSel:     '#10b981',
  barToday:   'rgba(16,185,129,0.7)',
  barHover:   'rgba(16,185,129,0.55)',
  barNorm:    'rgba(16,185,129,0.25)',
  barOutline: 'rgba(16,185,129,0.4)',
}

// ─── Shared counter analytics (people + car) ─────────────────────────────────

function CounterAnalytics({ cfg }: { cfg: CounterConfig }) {
  const { companyId, devices } = useAuth()
  const todayStr = new Date().toLocaleDateString('en-CA')

  const [selectedDate,     setSelectedDate]     = useState('')
  const [selectedHour,     setSelectedHour]     = useState<number | null>(null)
  const [selectedLocation, setSelectedLocation] = useState('')
  const [expandedGroups,   setExpandedGroups]   = useState<Set<string>>(new Set())
  const [hoveredDay,       setHoveredDay]       = useState<number | null>(null)
  const [hoveredHour,      setHoveredHour]      = useState<number | null>(null)

  const [deviceEventsMap,  setDeviceEventsMap]  = useState<Record<string, DBEvent[]>>({})
  const [deviceCountsMap,  setDeviceCountsMap]  = useState<Record<string, Record<string, { total?: number }>>>({})
  const [deviceUploadsMap, setDeviceUploadsMap] = useState<Record<string, Record<string, DBUpload>>>({})

  // ── Firebase subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId || !devices.length) return
    const rawE: Record<string, Record<string, DBEvent>>            = {}
    const rawC: Record<string, Record<string, { total?: number }>> = {}
    const rawU: Record<string, Record<string, DBUpload>>           = {}
    const unsubs: (() => void)[] = []

    devices.forEach(device => {
      unsubs.push(onValue(ref(db, `companies/${companyId}/devices/${device.id}/events`), snap => {
        rawE[device.id] = snap.exists() ? snap.val() : {}
        setDeviceEventsMap(prev => ({ ...prev, [device.id]: Object.values(rawE[device.id]) }))
      }))
      unsubs.push(onValue(ref(db, `companies/${companyId}/devices/${device.id}/counts`), snap => {
        rawC[device.id] = snap.exists() ? snap.val() : {}
        setDeviceCountsMap(prev => ({ ...prev, [device.id]: rawC[device.id] }))
      }))
      unsubs.push(onValue(ref(db, `companies/${companyId}/devices/${device.id}/uploads`), snap => {
        rawU[device.id] = snap.exists() ? snap.val() : {}
        setDeviceUploadsMap(prev => ({ ...prev, [device.id]: rawU[device.id] }))
      }))
    })

    return () => unsubs.forEach(fn => fn())
  }, [companyId, devices.map(d => d.id).join(',')])

  // ── Derived data ───────────────────────────────────────────────────────────

  const allEvents = useMemo(() => Object.values(deviceEventsMap).flat(), [deviceEventsMap])

  const allUploads = useMemo(() => {
    const out: Record<string, DBUpload> = {}
    Object.values(deviceUploadsMap).forEach(ups =>
      Object.entries(ups).forEach(([id, u]) => { out[id] = u })
    )
    return out
  }, [deviceUploadsMap])

  // uploadId → device id (i.e. location name) — fallback for uploads without .location field
  const uploadLocationMap = useMemo(() => {
    const out: Record<string, string> = {}
    Object.entries(deviceUploadsMap).forEach(([deviceId, ups]) =>
      Object.keys(ups).forEach(uid => { out[uid] = deviceId })
    )
    return out
  }, [deviceUploadsMap])

  const combinedCounts = useMemo(() => {
    const out: Record<string, number> = {}
    Object.values(deviceCountsMap).forEach(counts =>
      Object.entries(counts).forEach(([date, val]) => {
        out[date] = (out[date] ?? 0) + (val.total ?? 0)
      })
    )
    return out
  }, [deviceCountsMap])

  const filteredEvents = useMemo(() =>
    allEvents.filter(ev => {
      if (ev.type !== cfg.eventType) return false
      if (selectedDate && localDate(ev.timestamp) !== selectedDate) return false
      if (selectedHour !== null && new Date(ev.timestamp).getHours() !== selectedHour) return false
      if (selectedLocation) {
        const evLoc = allUploads[ev.uploadId ?? '']?.location ?? uploadLocationMap[ev.uploadId ?? '']
        if (evLoc !== selectedLocation) return false
      }
      return true
    }).sort((a, b) => b.timestamp - a.timestamp),
    [allEvents, selectedDate, selectedHour, selectedLocation, allUploads, uploadLocationMap, cfg.eventType]
  )

  // Per-location counts for donut (ignores hour filter, uses date + location filters)
  const perLocation = useMemo(() =>
    devices.map((device, i) => {
      const events = (deviceEventsMap[device.id] ?? []).filter(ev =>
        ev.type === cfg.eventType &&
        (!selectedDate || localDate(ev.timestamp) === selectedDate)
      )
      return { device, count: events.length, color: deviceColor(device.color, i) }
    }),
    [devices, deviceEventsMap, selectedDate, cfg.eventType]
  )

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
    for (const ev of filteredEvents) counts[new Date(ev.timestamp).getHours()]++
    return counts
  }, [filteredEvents])

  const maxHourly = Math.max(...hourlyData, 1)

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
      const aT = allUploads[a]?.processedAt ?? Math.max(...(groupedEvents[a] ?? []).map(e => e.timestamp), 0)
      const bT = allUploads[b]?.processedAt ?? Math.max(...(groupedEvents[b] ?? []).map(e => e.timestamp), 0)
      return bT - aT
    }),
    [groupedEvents, allUploads]
  )

  // ── KPI values ─────────────────────────────────────────────────────────────

  const totalToday = useMemo(() =>
    allEvents.filter(ev => {
      if (ev.type !== cfg.eventType) return false
      if (localDate(ev.timestamp) !== todayStr) return false
      if (selectedLocation) {
        const loc = allUploads[ev.uploadId ?? '']?.location ?? uploadLocationMap[ev.uploadId ?? '']
        if (loc !== selectedLocation) return false
      }
      return true
    }).length,
    [allEvents, todayStr, selectedLocation, allUploads, uploadLocationMap, cfg.eventType]
  )

  const dateRange = useMemo(() => {
    const tsList = sortedGroupKeys.flatMap(id => {
      const u = allUploads[id]
      return u?.videoDate ? [u.videoDate] : (groupedEvents[id] ?? []).map(e => e.timestamp)
    })
    if (tsList.length === 0) return null
    const min = Math.min(...tsList), max = Math.max(...tsList)
    const a = fmtDate(min), b = fmtDate(max)
    return a === b ? a : `${a} – ${b}`
  }, [sortedGroupKeys, allUploads, groupedEvents])

  // ── Actions ────────────────────────────────────────────────────────────────

  const hasFilters = !!(selectedDate || selectedHour !== null || selectedLocation)

  function clearFilters() {
    setSelectedDate(''); setSelectedHour(null); setSelectedLocation('')
  }

  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setExpandedGroups(prev =>
      prev.size === sortedGroupKeys.length ? new Set() : new Set(sortedGroupKeys)
    )
  }

  function exportCSV() {
    const rows = filteredEvents.map(ev => {
      const loc = allUploads[ev.uploadId ?? '']?.location ?? uploadLocationMap[ev.uploadId ?? ''] ?? ''
      return [
        new Date(ev.timestamp).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        ev.label, ev.sublabel, loc,
        ev.uploadId ? (allUploads[ev.uploadId]?.filename ?? ev.uploadId) : '',
      ]
    })
    downloadCSV(`${cfg.csvPrefix}-${selectedDate || 'all'}.csv`, rows, ['Time', 'Label', 'Details', 'Location', 'Video File'])
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const BAR_H  = 80
  const WEEK_H = 60
  const pieTotalCount = perLocation.reduce((s, c) => s + c.count, 0)
  const allExpanded = expandedGroups.size === sortedGroupKeys.length && sortedGroupKeys.length > 0

  return (
    <div className="analytics-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-subtitle">
            {cfg.eventType === 'person' ? 'People crossings' : 'Vehicle crossings'}
            {devices.length > 0 && ` · ${devices.length} location${devices.length !== 1 ? 's' : ''}`}
            {selectedDate && ` · ${selectedDate}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Location filter (only if > 1 location) */}
          {devices.length > 1 && (
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              style={{ background: 'var(--glass-bg)', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font)', cursor: 'pointer' }}
            >
              <option value="">All locations</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name ?? d.id}</option>)}
            </select>
          )}
          {/* Date filter */}
          <input
            type="date" value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); setSelectedHour(null) }}
            style={{ background: 'var(--glass-bg)', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, padding: '6px 12px', cursor: 'pointer' }}
          />
          {hasFilters && (
            <button onClick={clearFilters}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: cfg.accent, fontFamily: 'var(--font)', padding: '0 2px' }}>
              Clear filters
            </button>
          )}
          {/* Export */}
          <button
            onClick={exportCSV}
            disabled={filteredEvents.length === 0}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.10)',
              background: filteredEvents.length > 0 ? 'var(--glass-bg)' : 'transparent',
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)',
              cursor: filteredEvents.length === 0 ? 'not-allowed' : 'pointer',
              opacity: filteredEvents.length === 0 ? 0.4 : 1,
            }}
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="analytics-kpi-row">
        <KpiCard
          label={selectedDate ? `Crossings · ${selectedDate}${selectedHour !== null ? ` · ${fmtHour(selectedHour)}` : ''}` : 'Total crossings'}
          value={filteredEvents.length.toLocaleString()}
          sub={dateRange ?? undefined}
          accent={cfg.accent}
        />
        <KpiCard
          label="Today"
          value={totalToday.toLocaleString()}
          sub={todayStr}
          accent="#f59e0b"
        />
        <KpiCard
          label="Videos processed"
          value={String(sortedGroupKeys.length)}
          sub={sortedGroupKeys.length === 1 ? '1 upload' : `${sortedGroupKeys.length} uploads`}
          accent="#a855f7"
        />
        <KpiCard
          label="Locations"
          value={String(devices.length)}
          sub={devices.length === 1 ? (devices[0]?.name ?? devices[0]?.id) : `${devices.length} active`}
          accent="#22c55e"
        />
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="analytics-charts-row">
        {/* 7-day bar */}
        <div className="glass-card chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="chart-title" style={{ marginBottom: 0 }}>Last 7 Days</div>
            {selectedDate && (
              <button onClick={() => { setSelectedDate(''); setSelectedHour(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: cfg.accent, fontFamily: 'var(--font)' }}>
                Clear
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: WEEK_H + 28, paddingBottom: 22, position: 'relative' }}>
            {weekData.map((day, i) => (
              <div key={day.key}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: 'pointer' }}
                onClick={() => { setSelectedDate(day.key); setSelectedHour(null) }}
                onMouseEnter={() => setHoveredDay(i)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {hoveredDay === i && day.total > 0 && (
                  <div style={{ position: 'absolute', bottom: `calc(${(day.total / maxWeekly) * WEEK_H}px + 6px)`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,20,30,0.9)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>
                    {day.total.toLocaleString()}
                  </div>
                )}
                <div style={{
                  width: '100%',
                  height: `${(day.total / maxWeekly) * WEEK_H}px`,
                  minHeight: day.total > 0 ? 3 : 0,
                  background: day.key === selectedDate ? cfg.barSel
                    : day.key === todayStr ? cfg.barToday
                    : hoveredDay === i ? cfg.barHover : cfg.barNorm,
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.2s, background 0.15s',
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

        {/* 24-hour bar */}
        <div className="glass-card chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="chart-title" style={{ marginBottom: 0 }}>
              By Hour{selectedDate ? ` · ${selectedDate}` : ' · All dates'}
            </div>
            {selectedHour !== null && (
              <button onClick={() => setSelectedHour(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: cfg.accent, fontFamily: 'var(--font)' }}>
                Clear
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: BAR_H + 24, paddingBottom: 20, position: 'relative' }}>
            {hourlyData.map((v, i) => (
              <div key={i}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: v > 0 ? 'pointer' : 'default' }}
                onClick={() => v > 0 && setSelectedHour(i === selectedHour ? null : i)}
                onMouseEnter={() => setHoveredHour(i)}
                onMouseLeave={() => setHoveredHour(null)}
              >
                {hoveredHour === i && v > 0 && (
                  <div style={{ position: 'absolute', bottom: `calc(${(v / maxHourly) * BAR_H}px + 6px)`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,20,30,0.9)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>{v}</div>
                )}
                <div style={{
                  width: '100%',
                  height: `${(v / maxHourly) * BAR_H}px`,
                  minHeight: v > 0 ? 3 : 0,
                  background: i === selectedHour ? cfg.barSel
                    : i === new Date().getHours() && selectedDate === todayStr ? cfg.barToday
                    : hoveredHour === i ? cfg.barHover : cfg.barNorm,
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 0.2s, background 0.15s',
                  outline: i === selectedHour ? `2px solid ${cfg.barOutline}` : 'none',
                }} />
              </div>
            ))}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
              {[0, 6, 12, 18, 24].map(h => <span key={h} className="bar-label">{h}h</span>)}
            </div>
          </div>
          {selectedHour !== null && (
            <div style={{ fontSize: 12, color: cfg.accent, marginTop: 4 }}>
              Filtered to {fmtHour(selectedHour)} — click bar again or Clear to reset
            </div>
          )}
        </div>
      </div>

      {/* ── Location breakdown (only if > 1 location) ──────────────────────── */}
      {devices.length > 1 && pieTotalCount > 0 && (
        <div className="glass-card" style={{ padding: '22px 26px' }}>
          <div className="chart-title">By Location</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 36, flexWrap: 'wrap' }}>
            {/* Only pass slices with actual data — zero-value slices break the SVG geometry */}
            <DonutChart
              slices={perLocation.filter(c => c.count > 0).map(c => ({ label: c.device.name ?? c.device.id, value: c.count, color: c.color }))}
              total={pieTotalCount}
            />
            {/* Location rows — only show locations that have crossings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 240 }}>
              {perLocation.filter(c => c.count > 0).sort((a, b) => b.count - a.count).map(c => {
                const pct = Math.round(c.count / pieTotalCount * 100)
                const isSelected = selectedLocation === c.device.id
                return (
                  <button
                    key={c.device.id}
                    onClick={() => setSelectedLocation(isSelected ? '' : c.device.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: isSelected ? 'rgba(0,0,0,0.04)' : 'none',
                      border: isSelected ? `1px solid ${c.color}40` : '1px solid transparent',
                      borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
                      fontFamily: 'var(--font)', textAlign: 'left', transition: 'background 0.15s',
                      width: '100%',
                    }}
                  >
                    <div style={{ width: 11, height: 11, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.device.name ?? c.device.id}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: c.color, flexShrink: 0, marginLeft: 8 }}>
                          {c.count.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>{pct}%</span>
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: c.color, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Log ─────────────────────────────────────────────────────── */}
      <div className="glass-card analytics-table-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Upload Log</span>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)', marginLeft: 10 }}>
              {filteredEvents.length.toLocaleString()} crossing{filteredEvents.length !== 1 ? 's' : ''}
              {sortedGroupKeys.length > 0 && ` · ${sortedGroupKeys.length} upload${sortedGroupKeys.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          {sortedGroupKeys.length > 1 && (
            <button
              onClick={toggleAll}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: cfg.accent, fontFamily: 'var(--font)' }}
            >
              {allExpanded ? '↑ Collapse all' : '↓ Expand all'}
            </button>
          )}
        </div>

        {filteredEvents.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '16px 0' }}>
            No crossings recorded{selectedDate ? ` for ${selectedDate}` : ''}.
          </div>
        ) : (
          <>
            {sortedGroupKeys.map((uploadId, gi) => {
              const events    = groupedEvents[uploadId]
              const upload    = allUploads[uploadId]
              const locId     = upload?.location ?? uploadLocationMap[uploadId]
              const locLabel  = locId ? (devices.find(d => d.id === locId)?.name ?? locId) : null
              const videoDate = upload?.videoDate
                ? fmtDate(upload.videoDate)
                : events?.length > 0 ? fmtDate(Math.min(...events.map(e => e.timestamp))) : null
              const processedAt = upload
                ? new Date(upload.processedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : null
              const dirIcon = upload?.direction
                ? { down: '↓', up: '↑', left: '←', right: '→' }[upload.direction] ?? ''
                : ''
              const isOpen = expandedGroups.has(uploadId)

              return (
                <div key={uploadId}
                  style={{ borderTop: gi > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}
                >
                  {/* Group header row */}
                  <button
                    onClick={() => toggleGroup(uploadId)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 0', background: 'none', border: 'none',
                      cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
                    }}
                  >
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      <ChevronIcon open={isOpen} />
                    </span>
                    {/* Filename */}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0' }}>
                      {upload?.filename ?? 'Upload'}
                    </span>
                    {/* Location badge */}
                    {locLabel && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.05)', borderRadius: 5, padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {locLabel}
                      </span>
                    )}
                    {/* Video date */}
                    {videoDate && (
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {videoDate}
                      </span>
                    )}
                    {/* Direction */}
                    {dirIcon && (
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                        {dirIcon} {upload?.direction}
                      </span>
                    )}
                    {/* Count badge */}
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {events?.length ?? 0} crossing{(events?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Expanded content */}
                  {isOpen && (
                    <div style={{ paddingBottom: 14 }}>
                      {processedAt && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10, paddingLeft: 23 }}>
                          Uploaded {processedAt}
                        </div>
                      )}
                      <table className="events-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Label</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events?.map(ev => (
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
                  )}
                </div>
              )
            })}

            {/* Summary footer */}
            <div style={{
              borderTop: '1px solid rgba(0,0,0,0.08)',
              marginTop: 8, paddingTop: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Total: {filteredEvents.length.toLocaleString()} crossing{filteredEvents.length !== 1 ? 's' : ''}
              </span>
              {dateRange && (
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{dateRange}</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Seatbelt analytics (on hold — kept intact, minor cleanup) ──────────────

const VEHICLE_COLORS: Record<string, string> = {
  car: '#1d6ef4', truck: '#f59e0b', van: '#a855f7', suv: '#22c55e',
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const [deviceEventsMap,  setDeviceEventsMap]  = useState<Record<string, DBVehicleEvent[]>>({})
  const [deviceCountsMap,  setDeviceCountsMap]  = useState<Record<string, Record<string, { total?: number }>>>({})
  const [deviceUploadsMap, setDeviceUploadsMap] = useState<Record<string, Record<string, DBUpload>>>({})

  useEffect(() => {
    if (!companyId || !devices.length) return
    const rawE: Record<string, Record<string, DBVehicleEvent>> = {}
    const rawC: Record<string, Record<string, { total?: number }>> = {}
    const rawU: Record<string, Record<string, DBUpload>> = {}
    const unsubs: (() => void)[] = []

    devices.forEach(device => {
      unsubs.push(onValue(ref(db, `companies/${companyId}/devices/${device.id}/events`), snap => {
        rawE[device.id] = snap.exists() ? snap.val() : {}
        setDeviceEventsMap(prev => ({ ...prev, [device.id]: Object.values(rawE[device.id]) }))
      }))
      unsubs.push(onValue(ref(db, `companies/${companyId}/devices/${device.id}/counts`), snap => {
        rawC[device.id] = snap.exists() ? snap.val() : {}
        setDeviceCountsMap(prev => ({ ...prev, [device.id]: rawC[device.id] }))
      }))
      unsubs.push(onValue(ref(db, `companies/${companyId}/devices/${device.id}/uploads`), snap => {
        rawU[device.id] = snap.exists() ? snap.val() : {}
        setDeviceUploadsMap(prev => ({ ...prev, [device.id]: rawU[device.id] }))
      }))
    })
    return () => unsubs.forEach(fn => fn())
  }, [companyId, devices.map(d => d.id).join(',')])

  const allEvents  = useMemo(() => Object.values(deviceEventsMap).flat(), [deviceEventsMap])
  const allUploads = useMemo(() => {
    const out: Record<string, DBUpload> = {}
    Object.values(deviceUploadsMap).forEach(ups => Object.entries(ups).forEach(([id, u]) => { out[id] = u }))
    return out
  }, [deviceUploadsMap])

  const uploadLocationMap = useMemo(() => {
    const out: Record<string, string> = {}
    Object.entries(deviceUploadsMap).forEach(([deviceId, ups]) =>
      Object.keys(ups).forEach(uid => { out[uid] = deviceId })
    )
    return out
  }, [deviceUploadsMap])

  const combinedCounts = useMemo(() => {
    const out: Record<string, number> = {}
    Object.values(deviceCountsMap).forEach(counts =>
      Object.entries(counts).forEach(([date, val]) => { out[date] = (out[date] ?? 0) + (val.total ?? 0) })
    )
    return out
  }, [deviceCountsMap])

  const filteredEvents = useMemo(() =>
    allEvents.filter(ev =>
      localDate(ev.timestamp) === selectedDate &&
      (selectedHour === null || new Date(ev.timestamp).getHours() === selectedHour)
    ).sort((a, b) => b.timestamp - a.timestamp),
    [allEvents, selectedDate, selectedHour]
  )

  const groupedEvents = useMemo(() => {
    const groups: Record<string, DBVehicleEvent[]> = {}
    for (const ev of filteredEvents) {
      const key = ev.uploadId ?? '__unknown__'
      if (!groups[key]) groups[key] = []
      groups[key].push(ev)
    }
    return groups
  }, [filteredEvents])

  const sortedGroupKeys = useMemo(() =>
    Object.keys(groupedEvents).sort((a, b) => {
      const aT = allUploads[a]?.processedAt ?? Math.max(...(groupedEvents[a] ?? []).map(e => e.timestamp), 0)
      const bT = allUploads[b]?.processedAt ?? Math.max(...(groupedEvents[b] ?? []).map(e => e.timestamp), 0)
      return bT - aT
    }),
    [groupedEvents, allUploads]
  )

  const byVehicleType = useMemo(() => {
    const counts: Record<string, number> = { car: 0, truck: 0, van: 0, suv: 0 }
    for (const ev of filteredEvents) counts[ev.vehicleType] = (counts[ev.vehicleType] ?? 0) + 1
    return counts
  }, [filteredEvents])

  const complianceStats = useMemo(() => ({
    total:      filteredEvents.length,
    compliant:  filteredEvents.filter(isCompliant).length,
    distracted: filteredEvents.filter(ev => ev.driverDistracted).length,
  }), [filteredEvents])

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
  const maxHourly    = Math.max(...hourlyData, 1)
  const BAR_HEIGHT   = 80
  const WEEK_HEIGHT  = 60
  const compRate     = complianceStats.total > 0 ? Math.round(complianceStats.compliant  / complianceStats.total * 100) : null
  const distractRate = complianceStats.total > 0 ? Math.round(complianceStats.distracted / complianceStats.total * 100) : null

  function toggleGroup(id: string) {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function exportCSV() {
    const rows = filteredEvents.map(ev => [
      new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      VEHICLE_LABELS[ev.vehicleType] ?? ev.vehicleType,
      String(ev.occupants), seatbeltLabel(ev),
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
          <div className="page-subtitle">Traffic log · all locations</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={exportCSV} disabled={filteredEvents.length === 0}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', background: 'var(--glass-bg)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)', cursor: filteredEvents.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredEvents.length === 0 ? 0.4 : 1 }}>
            ↓ Export CSV
          </button>
          <input type="date" value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); setSelectedHour(null) }}
            style={{ background: 'var(--glass-bg)', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, padding: '6px 12px', cursor: 'pointer' }} />
        </div>
      </div>

      <div className="analytics-charts-row">
        <div className="glass-card chart-card">
          <div className="chart-title">Last 7 Days — Vehicles Logged</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: WEEK_HEIGHT + 28, paddingBottom: 22, position: 'relative' }}>
            {weekData.map((day, i) => (
              <div key={day.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: 'pointer' }}
                onClick={() => { setSelectedDate(day.key); setSelectedHour(null) }}
                onMouseEnter={() => setHoveredDay(i)} onMouseLeave={() => setHoveredDay(null)}>
                {hoveredDay === i && day.total > 0 && (
                  <div style={{ position: 'absolute', bottom: `calc(${(day.total / maxWeekly) * WEEK_HEIGHT}px + 6px)`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,20,30,0.9)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>{day.total}</div>
                )}
                <div style={{ width: '100%', height: `${(day.total / maxWeekly) * WEEK_HEIGHT}px`, minHeight: day.total > 0 ? 3 : 0, background: day.key === selectedDate ? '#1d6ef4' : day.key === todayStr ? 'rgba(29,110,244,0.7)' : hoveredDay === i ? 'rgba(29,110,244,0.55)' : 'rgba(29,110,244,0.25)', borderRadius: '4px 4px 0 0', transition: 'height 0.2s, background 0.15s' }} />
              </div>
            ))}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', pointerEvents: 'none' }}>
              {weekData.map(day => <div key={day.key} style={{ flex: 1, textAlign: 'center' }}><span className="bar-label">{day.label}</span></div>)}
            </div>
          </div>
        </div>

        <div className="glass-card chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="chart-title" style={{ marginBottom: 0 }}>By Hour · {selectedDate}</div>
            {selectedHour !== null && <button onClick={() => setSelectedHour(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#1d6ef4', fontFamily: 'var(--font)' }}>Clear</button>}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: BAR_HEIGHT + 24, paddingBottom: 20, position: 'relative' }}>
            {hourlyData.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: v > 0 ? 'pointer' : 'default' }}
                onClick={() => v > 0 && setSelectedHour(i === selectedHour ? null : i)}
                onMouseEnter={() => setHoveredHour(i)} onMouseLeave={() => setHoveredHour(null)}>
                {hoveredHour === i && v > 0 && (
                  <div style={{ position: 'absolute', bottom: `calc(${(v / maxHourly) * BAR_HEIGHT}px + 6px)`, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,20,30,0.9)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>{v}</div>
                )}
                <div style={{ width: '100%', height: `${(v / maxHourly) * BAR_HEIGHT}px`, minHeight: v > 0 ? 3 : 0, background: i === selectedHour ? '#1d6ef4' : hoveredHour === i ? 'rgba(29,110,244,0.65)' : 'rgba(29,110,244,0.35)', borderRadius: '3px 3px 0 0', transition: 'height 0.2s, background 0.15s' }} />
              </div>
            ))}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
              {[0, 6, 12, 18, 24].map(h => <span key={h} className="bar-label">{h}h</span>)}
            </div>
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
                <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{compRate !== null ? `${compRate}%` : '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>seatbelt compliant</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{distractRate !== null ? `${distractRate}%` : '—'}</div>
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
              {selectedHour !== null && <button onClick={() => setSelectedHour(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#1d6ef4', fontFamily: 'var(--font)', padding: 0 }}>Clear</button>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <DonutChart slices={vehicleSlices} total={pieTotal} />
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

      <div className="glass-card analytics-table-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Vehicle Log</span>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)', marginLeft: 10 }}>
              {filteredEvents.length.toLocaleString()} vehicle{filteredEvents.length !== 1 ? 's' : ''}
              {sortedGroupKeys.length > 1 && ` · ${sortedGroupKeys.length} uploads`}
            </span>
          </div>
          {sortedGroupKeys.length > 1 && (
            <button onClick={() => setExpandedGroups(prev => prev.size === sortedGroupKeys.length ? new Set() : new Set(sortedGroupKeys))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#1d6ef4', fontFamily: 'var(--font)' }}>
              {expandedGroups.size === sortedGroupKeys.length ? '↑ Collapse all' : '↓ Expand all'}
            </button>
          )}
        </div>
        {filteredEvents.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '16px 0' }}>
            No vehicles logged for {selectedDate}.
          </div>
        ) : sortedGroupKeys.map((uploadId, gi) => {
          const events    = groupedEvents[uploadId]
          const upload    = allUploads[uploadId]
          const locId     = upload?.location ?? uploadLocationMap[uploadId]
          const locLabel  = locId ? (devices.find(d => d.id === locId)?.name ?? locId) : null
          const processedAt = upload
            ? new Date(upload.processedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : null
          const isOpen = expandedGroups.has(uploadId)
          return (
            <div key={uploadId} style={{ borderTop: gi > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
              <button onClick={() => toggleGroup(uploadId)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' }}>
                <span style={{ color: 'var(--text-tertiary)' }}><ChevronIcon open={isOpen} /></span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {upload?.filename ?? 'Upload'}
                </span>
                {locLabel && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.05)', borderRadius: 5, padding: '2px 8px', flexShrink: 0 }}>{locLabel}</span>}
                {processedAt && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>{processedAt}</span>}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
                  {events?.length ?? 0} vehicle{(events?.length ?? 0) !== 1 ? 's' : ''}
                </span>
              </button>
              {isOpen && (
                <div style={{ paddingBottom: 14 }}>
                  <table className="events-table">
                    <thead><tr><th>Time</th><th>Vehicle</th><th>Occ</th><th>Seatbelts</th><th>Distracted</th></tr></thead>
                    <tbody>
                      {events?.map(ev => (
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
                          <td style={{ fontWeight: 500, color: isCompliant(ev) ? '#22c55e' : '#ef4444' }}>{seatbeltLabel(ev)}</td>
                          <td style={{ color: ev.driverDistracted ? '#ef4444' : 'var(--text-tertiary)' }}>
                            {ev.driverDistracted ? '📱 Yes' : 'No'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function Analytics() {
  const { companyMode } = useAuth()
  if (companyMode === 'seatbelt')     return <SeatbeltAnalytics />
  if (companyMode === 'car_counter')  return <CounterAnalytics cfg={CAR_CFG} />
  return <CounterAnalytics cfg={PEOPLE_CFG} />
}
