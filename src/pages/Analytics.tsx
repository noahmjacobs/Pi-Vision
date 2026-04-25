const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MOTION_DATA = [34, 52, 41, 67, 89, 113, 247]
const MAX_MOTION = Math.max(...MOTION_DATA)

const OBJECT_BREAKDOWN = [
  { label: 'Person', value: 58, color: '#1d6ef4' },
  { label: 'Package', value: 21, color: '#f59e0b' },
  { label: 'Vehicle', value: 13, color: '#22c55e' },
  { label: 'Animal', value: 8, color: '#a855f7' },
]

const HOURLY_DATA = [2, 0, 0, 1, 4, 8, 23, 31, 19, 14, 22, 28, 35, 30, 18, 21, 38, 44, 29, 17, 12, 8, 5, 3]

function buildDonutPath(cx: number, cy: number, r: number, pct: number, start: number) {
  const startAngle = start * 2 * Math.PI - Math.PI / 2
  const endAngle = (start + pct) * 2 * Math.PI - Math.PI / 2
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy + r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const large = pct > 0.5 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

const TABLE_EVENTS = [
  { type: 'Person', location: 'Doorway', count: 89, confidence: '97%', severity: 'info' },
  { type: 'Package', location: 'Entrance', count: 34, confidence: '94%', severity: 'success' },
  { type: 'Motion', location: 'Left panel', count: 247, confidence: '99%', severity: 'info' },
  { type: 'Vehicle', location: 'Driveway', count: 21, confidence: '91%', severity: 'warning' },
  { type: 'Animal', location: 'Yard', count: 13, confidence: '88%', severity: 'warning' },
]

const SEVERITY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  info: { bg: 'rgba(29,110,244,0.12)', color: '#1d6ef4', label: 'Normal' },
  success: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Flagged' },
  warning: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Review' },
}

export default function Analytics() {
  let donutStart = 0
  const total = OBJECT_BREAKDOWN.reduce((s, d) => s + d.value, 0)

  const maxHourly = Math.max(...HOURLY_DATA)
  const svgW = 340
  const svgH = 100
  const pts = HOURLY_DATA.map((v, i) => {
    const x = (i / (HOURLY_DATA.length - 1)) * svgW
    const y = svgH - (v / maxHourly) * (svgH - 10) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="analytics-page">
      <div>
        <div className="page-title">Analytics</div>
        <div className="page-subtitle">Motion and object detection trends over time</div>
      </div>

      <div className="analytics-grid">
        {/* Bar chart — motion events per day */}
        <div className="glass-card chart-card">
          <div className="chart-title">Motion Events — Last 7 Days</div>
          <div className="bar-chart">
            {MOTION_DATA.map((v, i) => (
              <div key={i} className="bar-col">
                <div
                  className="bar"
                  style={{
                    height: `${(v / MAX_MOTION) * 80}px`,
                    background: i === 6 ? '#1d6ef4' : 'rgba(29,110,244,0.25)',
                  }}
                  title={`${DAYS[i]}: ${v}`}
                />
                <span className="bar-label">{DAYS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Donut chart — object breakdown */}
        <div className="glass-card chart-card">
          <div className="chart-title">Object Breakdown</div>
          <div className="donut-wrap">
            <svg width="110" height="110" className="donut-svg">
              {OBJECT_BREAKDOWN.map((seg, i) => {
                const pct = seg.value / total
                const path = buildDonutPath(55, 55, 40, pct, donutStart)
                donutStart += pct
                return (
                  <path
                    key={i}
                    d={path}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="18"
                    strokeLinecap="butt"
                  />
                )
              })}
              <text x="55" y="58" textAnchor="middle" fontSize="14" fontWeight="700" fill="#1a1a2e">
                {total}
              </text>
            </svg>
            <div className="donut-legend">
              {OBJECT_BREAKDOWN.map(seg => (
                <div key={seg.label} className="legend-item">
                  <div className="legend-dot" style={{ background: seg.color }} />
                  {seg.label} — {seg.value}%
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Line chart — hourly activity */}
        <div className="glass-card chart-card">
          <div className="chart-title">Hourly Activity Today</div>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="line-chart-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1d6ef4" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#1d6ef4" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon
              points={`0,${svgH} ${pts} ${svgW},${svgH}`}
              fill="url(#lineGrad)"
            />
            <polyline
              points={pts}
              fill="none"
              stroke="#1d6ef4"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span className="bar-label">12 AM</span>
            <span className="bar-label">6 AM</span>
            <span className="bar-label">12 PM</span>
            <span className="bar-label">6 PM</span>
            <span className="bar-label">12 AM</span>
          </div>
        </div>
      </div>

      {/* Event log table */}
      <div className="glass-card analytics-table-card">
        <div className="table-title">Detection Log</div>
        <table className="events-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Location</th>
              <th>Count</th>
              <th>Confidence</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {TABLE_EVENTS.map((ev, i) => {
              const s = SEVERITY_COLORS[ev.severity]
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{ev.type}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{ev.location}</td>
                  <td>{ev.count}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{ev.confidence}</td>
                  <td>
                    <span className="table-badge" style={{ background: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
