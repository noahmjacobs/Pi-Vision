import { useEffect, useState } from 'react'
import { Page } from '../App'
import { useAuth } from '../context/AuthContext'

// Dashboard removed from nav — shelved while desktop processor is the primary product.
const BASE_NAV: Page[] = ['Analytics', 'Settings']

interface HeaderProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  isDark: boolean
  onToggleDark: () => void
}

function formatTime(d: Date) {
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export default function Header({ currentPage, onNavigate, isDark, onToggleDark }: HeaderProps) {
  const { companyName, signOut, isAdmin } = useAuth()
  const navItems: Page[] = isAdmin ? [...BASE_NAV, 'Admin'] : BASE_NAV
  const [time, setTime] = useState(formatTime(new Date()))

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 15000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="header">
      <div className="header-logo">
        <img src="/logo.png" alt="PiVision" style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, marginRight: -4 }} />
        <span className="logo-text">PiVision</span>
        {companyName && (
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 4 }}>
            · {companyName}
          </span>
        )}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' }}>
        <div className="header-time">{time}</div>

        {/* Dark mode toggle */}
        <button
          onClick={onToggleDark}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.06)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 8, cursor: 'pointer',
            color: 'var(--text-secondary)',
            transition: 'background 0.15s, color 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.10)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

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
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
