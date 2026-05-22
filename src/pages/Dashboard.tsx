import { useState, useEffect } from 'react'
import StatCard from '../components/StatCard'
import CameraFeed from '../components/CameraFeed'
import RecentEvents from '../components/RecentEvents'
import StatusBar from '../components/StatusBar'
import { useFirebaseValue } from '../hooks/useFirebaseData'
import { MOCK_STATS, MOCK_CAMERA, MOCK_EVENTS } from '../mockData'
import { DBStats, DBCamera, DBEvent } from '../types'

function PeopleIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function formatUptime(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function Dashboard() {
  const { data: stats, loading: statsLoading } = useFirebaseValue<DBStats>('stats', MOCK_STATS)
  const { data: camera }                       = useFirebaseValue<DBCamera>('camera', MOCK_CAMERA)
  const { data: eventsRaw, loading: eventsLoading } = useFirebaseValue<Record<string, DBEvent>>('events', {} as Record<string, DBEvent>)

  const [uptime, setUptime] = useState('—')

  useEffect(() => {
    if (!camera?.sessionStart) {
      setUptime('—')
      return
    }
    const start = camera.sessionStart
    const update = () => setUptime(formatUptime(Date.now() - start))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [camera?.sessionStart])

  const events: DBEvent[] = Object.values(eventsRaw).length > 0
    ? Object.values(eventsRaw).sort((a, b) => b.timestamp - a.timestamp).slice(0, 8)
    : MOCK_EVENTS

  return (
    <div className="dashboard">
      <div className="middle-row">
        <CameraFeed />
        <div className="right-panel">
          <StatCard
            label="People Today"
            value={(stats?.peopleCount ?? 0).toLocaleString()}
            sub="this session"
            icon={<PeopleIcon color="#1d6ef4" />}
            iconBg="rgba(29,110,244,0.12)"
            loading={statsLoading}
            tooltip="People who crossed the counting line this session"
          />
          <StatCard
            label="Uptime"
            value={uptime}
            sub="session running"
            icon={<Clock color="#f59e0b" />}
            iconBg="rgba(245,158,11,0.12)"
            loading={false}
            tooltip="How long the camera has been running this session"
          />
          <RecentEvents events={events} loading={eventsLoading} />
        </div>
      </div>

      <StatusBar camera={camera} />
    </div>
  )
}
