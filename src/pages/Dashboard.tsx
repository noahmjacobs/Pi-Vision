import { useState, useEffect } from 'react'
import StatCard from '../components/StatCard'
import CameraFeed from '../components/CameraFeed'
import ClaudePanel from '../components/ClaudePanel'
import RecentEvents from '../components/RecentEvents'
import StatusBar from '../components/StatusBar'
import { useFirebaseValue } from '../hooks/useFirebaseData'
import { MOCK_STATS, MOCK_CAMERA, MOCK_EVENTS, MOCK_CLAUDE } from '../mockData'
import { DBStats, DBCamera, DBEvent, DBClaude } from '../types'

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
  const { data: stats, loading: statsLoading }      = useFirebaseValue<DBStats>('stats', MOCK_STATS)
  const { data: camera }                            = useFirebaseValue<DBCamera>('camera', MOCK_CAMERA)
  const { data: eventsRaw, loading: eventsLoading } = useFirebaseValue<Record<string, DBEvent>>('events', {} as Record<string, DBEvent>)
  const { data: claude, loading: claudeLoading }    = useFirebaseValue<DBClaude>('claude', MOCK_CLAUDE)

  const [localStats, setLocalStats] = useState<DBStats>(MOCK_STATS)

  useEffect(() => {
    if (stats?.motionEvents) setLocalStats(stats)
  }, [stats])

  const events: DBEvent[] = Object.values(eventsRaw).length > 0
    ? Object.values(eventsRaw).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5)
    : MOCK_EVENTS

  return (
    <div className="dashboard">
      <div className="stat-cards-row">
        <StatCard
          label="Motion Events"
          value={localStats.motionEvents.toLocaleString()}
          sub="today"
          icon={<ArrowUpRight color="#1d6ef4" />}
          iconBg="rgba(29,110,244,0.12)"
          loading={statsLoading}
          tooltip="Total motion detections recorded today"
        />
        <StatCard
          label="Objects Found"
          value={localStats.objectsDetected.toLocaleString()}
          sub="total"
          icon={<Target color="#22c55e" />}
          iconBg="rgba(34,197,94,0.12)"
          loading={statsLoading}
          tooltip="Cumulative objects identified by AI vision"
        />
        <StatCard
          label="Uptime"
          value={localStats.uptime}
          sub="running"
          icon={<Clock color="#f59e0b" />}
          iconBg="rgba(245,158,11,0.12)"
          loading={statsLoading}
          tooltip="How long the Pi camera script has been running"
        />
        <StatCard
          label="Last Event"
          value={localStats.lastEvent}
          sub=""
          icon={<Zap color="#f97316" />}
          iconBg="rgba(249,115,22,0.12)"
          loading={statsLoading}
          tooltip="Most recent detection event"
          showReset
          onReset={() => setLocalStats(s => ({ ...s, lastEvent: 'Just now' }))}
        />
      </div>

      <div className="middle-row">
        <CameraFeed />
        <div className="right-panel">
          <ClaudePanel claude={claude} loading={claudeLoading} />
          <RecentEvents events={events} loading={eventsLoading} />
        </div>
      </div>

      <StatusBar camera={camera} />
    </div>
  )
}
