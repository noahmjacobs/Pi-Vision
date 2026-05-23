import { useEffect, useState } from 'react'
import { Page } from '../App'
import { useAuth } from '../context/AuthContext'

const BASE_NAV: Page[] = ['Dashboard', 'Analytics', 'Settings']

interface HeaderProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

function formatTime(d: Date) {
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`
}

export default function Header({ currentPage, onNavigate }: HeaderProps) {
  const { companyName, devices, deviceId, setDeviceId, signOut, isAdmin } = useAuth()
  const navItems: Page[] = isAdmin ? [...BASE_NAV, 'Admin'] : BASE_NAV
  const [time, setTime] = useState(formatTime(new Date()))

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 15000)
    return () => clearInterval(id)
  }, [])

  const currentDevice = devices.find(d => d.id === deviceId)

  return (
    <header className="header">
      <div className="header-logo">
        <div className="logo-dot" />
        <span className="logo-text">PiVision</span>
        {companyName && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 4 }}>
            · {companyName}
          </span>
        )}
        <div className="live-badge">
          <div className="live-dot" />
          <span className="live-text">Live</span>
        </div>
      </div>

      <nav className="header-nav" aria-label="Desktop navigation">
        {navItems.map(item => (
          <button
            key={item}
            className={`nav-btn${currentPage === item ? ' active' : ''}`}
            onClick={() => onNavigate(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Camera switcher — only shown when multiple devices */}
        {devices.length > 1 && (
          <select
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.05)',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 13,
              fontFamily: 'var(--font)',
              fontWeight: 500,
              padding: '5px 10px',
              cursor: 'pointer',
            }}
          >
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}

        {/* Single device — just show its name */}
        {devices.length === 1 && currentDevice && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {currentDevice.name}
          </span>
        )}

        <div className="header-time">{time}</div>

        <button
          onClick={signOut}
          style={{
            background: 'none',
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: 8,
            padding: '5px 12px',
            fontSize: 13,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
