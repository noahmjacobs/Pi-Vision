import { useState, useEffect } from 'react'
import StatCard from '../components/StatCard'
import CameraFeed from '../components/CameraFeed'
import ClaudePanel from '../components/ClaudePanel'
import RecentEvents from '../components/RecentEvents'
import StatusBar from '../components/StatusBar'
import { useFirebaseValue } from '../hooks/useFirebaseData'
import { MOCK_STATS, MOCK_STATUS, MOCK_EVENTS, MOCK_CLAUDE } from '../mockData'
import { Stats, SystemStatus, CameraEvent, ClaudeAnalysis } from '../types'

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

// Icon components (inline SVG, no extra dep needed beyond lucide)
function ArrowUpRight({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  )
}

function Target({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function Clock({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function Zap({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

export default function Dashboard() {
  const stats = useFirebaseValue<Stats>('stats', MOCK_STATS)
  const status = useFirebaseValue<SystemStatus>('status', MOCK_STATUS)
  const eventsRaw = useFirebaseValue<Record<string, CameraEvent>>('events', {} as Record<string, CameraEvent>)
  const claude = useFirebaseValue<ClaudeAnalysis>('claude', MOCK_CLAUDE)

  const [localStats, setLocalStats] = useState<Stats>(MOCK_STATS)
  const [uptimeSeconds, setUptimeSeconds] = useState(MOCK_STATS.uptimeSeconds)

  useEffect(() => {
    if (stats && stats.motionEvents) setLocalStats(stats)
  }, [stats])

  // Tick uptime every minute
  useEffect(() => {
    const id = setInterval(() => setUptimeSeconds(s => s + 60), 60000)
    return () => clearInterval(id)
  }, [])

  const events: CameraEvent[] = Object.values(eventsRaw).length > 0
    ? Object.values(eventsRaw).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5)
    : MOCK_EVENTS

  return (
    <div className="dashboard">
      {/* Stat cards */}
      <div className="stat-cards-row">
        <StatCard
          label="Motion Events"
          value={localStats.motionEvents.toLocaleString()}
          sub="today"
          icon={<ArrowUpRight color="#1d6ef4" />}
          iconBg="rgba(29,110,244,0.12)"
        />
        <StatCard
          label="Objects Found"
          value={localStats.objectsFound.toLocaleString()}
          sub="total"
          icon={<Target color="#22c55e" />}
          iconBg="rgba(34,197,94,0.12)"
        />
        <StatCard
          label="Uptime"
          value={formatUptime(uptimeSeconds)}
          sub="running"
          icon={<Clock color="#f59e0b" />}
          iconBg="rgba(245,158,11,0.12)"
        />
        <StatCard
          label="Last Event"
          value={`${localStats.lastEventMinutesAgo}m ago`}
          sub={localStats.lastEventLabel}
          icon={<Zap color="#f97316" />}
          iconBg="rgba(249,115,22,0.12)"
          showReset
          onReset={() => setLocalStats(s => ({ ...s, lastEventMinutesAgo: 0 }))}
        />
      </div>

      {/* Camera + right panel */}
      <div className="middle-row">
        <CameraFeed />
        <div className="right-panel">
          <ClaudePanel analysis={claude} />
          <RecentEvents events={events} />
        </div>
      </div>

      {/* Status bar */}
      <StatusBar status={status} />
    </div>
  )
}
