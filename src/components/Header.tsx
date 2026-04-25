import { useEffect, useState } from 'react'
import { Page } from '../App'

const NAV_ITEMS: Page[] = ['Dashboard', 'Analytics', 'Alerts', 'Settings']

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
  const [time, setTime] = useState(formatTime(new Date()))

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 15000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="header">
      <div className="header-logo">
        <div className="logo-dot" />
        <span className="logo-text">PiVision</span>
        <div className="live-badge">
          <div className="live-dot" />
          <span className="live-text">Live</span>
        </div>
      </div>

      {/* Hidden on mobile — replaced by BottomNav */}
      <nav className="header-nav" aria-label="Desktop navigation">
        {NAV_ITEMS.map(item => (
          <button
            key={item}
            className={`nav-btn${currentPage === item ? ' active' : ''}`}
            onClick={() => onNavigate(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {/* Hidden on mobile */}
      <div className="header-time">{time}</div>
    </header>
  )
}
