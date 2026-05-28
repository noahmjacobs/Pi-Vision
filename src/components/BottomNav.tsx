import { Page } from '../App'
import { useAuth } from '../context/AuthContext'

// Dashboard tab is temporarily hidden from nav — the live-camera dashboard view is shelved
// while we focus on the desktop processor (people counter + car counter) as the core product.
// To re-enable: add the Dashboard item back to BASE_NAV below and restore 'Dashboard' as the
// default page in App.tsx. All Dashboard component code in src/pages/Dashboard.tsx is intact.

const BASE_NAV: { page: Page; icon: JSX.Element; label: string }[] = [
  {
    page: 'Analytics',
    label: 'Analytics',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    page: 'Settings',
    label: 'Settings',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

const ADMIN_NAV_ITEM: { page: Page; icon: JSX.Element; label: string } = {
  page: 'Admin',
  label: 'Admin',
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
}

interface BottomNavProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

export default function BottomNav({ currentPage, onNavigate }: BottomNavProps) {
  const { isAdmin } = useAuth()
  const navItems = isAdmin ? [...BASE_NAV, ADMIN_NAV_ITEM] : BASE_NAV

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      {navItems.map(({ page, icon, label }) => (
        <button
          key={page}
          className={`bottom-nav-item${currentPage === page ? ' active' : ''}`}
          onClick={() => onNavigate(page)}
          aria-current={currentPage === page ? 'page' : undefined}
        >
          <span className="bottom-nav-icon">{icon}</span>
          <span className="bottom-nav-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
