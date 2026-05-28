import { useState, useEffect } from 'react'
import { ref, set } from 'firebase/database'
import { db } from '../firebase'
import StatCard from '../components/StatCard'
import CameraFeed from '../components/CameraFeed'
import RecentEvents from '../components/RecentEvents'
import RecentViolations from '../components/RecentViolations'
import StatusBar from '../components/StatusBar'
import { useFirebaseValue } from '../hooks/useFirebaseData'
import { DBStats, DBSeatbeltStats, DBCamera, DBEvent, DBVehicleEvent } from '../types'
import { type Page } from '../App'
import { useAuth } from '../context/AuthContext'

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

function CarIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-4h10l2 4h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  )
}

function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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

function PeopleCounterDashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { devicePath } = useAuth()
  const { data: stats, loading: statsLoading } = useFirebaseValue<DBStats>(devicePath('stats'), { peopleCount: 0, lastEvent: '' })
  const { data: camera }                       = useFirebaseValue<DBCamera>(devicePath('camera'), { piConnected: false, status: 'Offline', fps: 0, resolution: '' })
  const { data: eventsRaw, loading: eventsLoading } = useFirebaseValue<Record<string, DBEvent>>(devicePath('events'), {} as Record<string, DBEvent>)

  const [uptime, setUptime] = useState('—')

  useEffect(() => {
    if (!camera?.sessionStart) { setUptime('—'); return }
    const start = camera.sessionStart
    const update = () => setUptime(formatUptime(Date.now() - start))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [camera?.sessionStart])

  const events: DBEvent[] = Object.values(eventsRaw).sort((a, b) => b.timestamp - a.timestamp).slice(0, 6)

  return (
    <div className="dashboard">
      <div className="middle-row">
        <CameraFeed />
        <div className="right-panel">
          <StatCard
            label="People Counted"
            value={(camera?.piConnected ? (stats?.peopleCount ?? 0) : 0).toLocaleString()}
            sub="this session"
            icon={<PeopleIcon color="#1d6ef4" />}
            iconBg="rgba(29,110,244,0.12)"
            loading={statsLoading}
            showReset={camera?.piConnected}
            onReset={() => set(ref(db, devicePath('stats/peopleCount')), 0)}
          />
          <StatCard
            label="Uptime"
            value={uptime}
            sub="session running"
            icon={<Clock color="#f59e0b" />}
            iconBg="rgba(245,158,11,0.12)"
            loading={false}
          />
          <RecentEvents events={events} loading={eventsLoading} onSeeAll={() => onNavigate('Analytics')} />
        </div>
      </div>
      <StatusBar camera={camera} />
    </div>
  )
}

function CarCounterDashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { devicePath } = useAuth()
  const { data: stats, loading: statsLoading } = useFirebaseValue<DBStats>(devicePath('stats'), { peopleCount: 0, lastEvent: '' })
  const { data: camera }                       = useFirebaseValue<DBCamera>(devicePath('camera'), { piConnected: false, status: 'Offline', fps: 0, resolution: '' })
  const { data: eventsRaw, loading: eventsLoading } = useFirebaseValue<Record<string, DBEvent>>(devicePath('events'), {} as Record<string, DBEvent>)

  const [uptime, setUptime] = useState('—')

  useEffect(() => {
    if (!camera?.sessionStart) { setUptime('—'); return }
    const start = camera.sessionStart
    const update = () => setUptime(formatUptime(Date.now() - start))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [camera?.sessionStart])

  const events: DBEvent[] = Object.values(eventsRaw).sort((a, b) => b.timestamp - a.timestamp).slice(0, 6)

  return (
    <div className="dashboard">
      <div className="middle-row">
        <CameraFeed />
        <div className="right-panel">
          <StatCard
            label="Vehicles Counted"
            value={(camera?.piConnected ? (stats?.peopleCount ?? 0) : 0).toLocaleString()}
            sub="this session"
            icon={<CarIcon color="#10b981" />}
            iconBg="rgba(16,185,129,0.12)"
            loading={statsLoading}
            showReset={camera?.piConnected}
            onReset={() => set(ref(db, devicePath('stats/peopleCount')), 0)}
          />
          <StatCard
            label="Uptime"
            value={uptime}
            sub="session running"
            icon={<Clock color="#f59e0b" />}
            iconBg="rgba(245,158,11,0.12)"
            loading={false}
          />
          <RecentEvents events={events} loading={eventsLoading} onSeeAll={() => onNavigate('Analytics')} />
        </div>
      </div>
      <StatusBar camera={camera} />
    </div>
  )
}

function SeatbeltDashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { devicePath } = useAuth()
  const { data: stats, loading: statsLoading } = useFirebaseValue<DBSeatbeltStats>(
    devicePath('stats'),
    { totalVehicles: 0, compliantVehicles: 0, distractedVehicles: 0, lastEvent: '' }
  )
  const { data: camera }     = useFirebaseValue<DBCamera>(devicePath('camera'), { piConnected: false, status: 'Offline', fps: 0, resolution: '' })
  const { data: eventsRaw, loading: eventsLoading } = useFirebaseValue<Record<string, DBVehicleEvent>>(devicePath('events'), {} as Record<string, DBVehicleEvent>)

  const totalVehicles     = stats?.totalVehicles ?? 0
  const compliantVehicles = stats?.compliantVehicles ?? 0
  const complianceRate    = totalVehicles > 0 ? Math.round((compliantVehicles / totalVehicles) * 100) : null

  const recentVehicles: DBVehicleEvent[] = Object.values(eventsRaw)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 6)

  return (
    <div className="dashboard">
      <div className="middle-row">
        <CameraFeed />
        <div className="right-panel">
          <StatCard
            label="Vehicles Logged"
            value={totalVehicles.toLocaleString()}
            sub="total passes recorded"
            icon={<CarIcon color="#1d6ef4" />}
            iconBg="rgba(29,110,244,0.12)"
            loading={statsLoading}
          />
          <StatCard
            label="Seatbelt Compliance"
            value={complianceRate !== null ? `${complianceRate}%` : '—'}
            sub={totalVehicles > 0 ? `${compliantVehicles} of ${totalVehicles} fully belted` : 'no vehicles yet'}
            icon={<ShieldIcon color="#22c55e" />}
            iconBg="rgba(34,197,94,0.12)"
            loading={statsLoading}
          />
          <RecentViolations events={recentVehicles} loading={eventsLoading} onSeeAll={() => onNavigate('Analytics')} />
        </div>
      </div>
      <StatusBar camera={camera} />
    </div>
  )
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { companyMode } = useAuth()
  if (companyMode === 'seatbelt') return <SeatbeltDashboard onNavigate={onNavigate} />
  if (companyMode === 'car_counter') return <CarCounterDashboard onNavigate={onNavigate} />
  return <PeopleCounterDashboard onNavigate={onNavigate} />
}
