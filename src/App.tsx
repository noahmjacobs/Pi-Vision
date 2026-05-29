import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Login from './pages/Login'
import DevicePicker from './pages/DevicePicker'

export type Page = 'Dashboard' | 'Analytics' | 'Settings' | 'Admin'

function AppInner({ isDark, onToggleDark }: { isDark: boolean; onToggleDark: () => void }) {
  const { user, authLoading, isAdmin, companyId, devices, deviceId } = useAuth()
  // Default to Analytics — Dashboard is shelved (see BottomNav.tsx for re-enable instructions)
  const [page, setPage] = useState<Page>('Analytics')

  // Admin with no company selected → stay on Admin page
  useEffect(() => {
    if (isAdmin && !companyId) setPage('Admin')
  }, [isAdmin, companyId])

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="PiVision" style={{ width: 28, height: 28, borderRadius: 8 }} />
          <span className="logo-text">PiVision</span>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  // Show picker if multiple devices and none selected (skip for admin — they use adminViewAs)
  if (!isAdmin && devices.length > 1 && !deviceId) return <DevicePicker />

  return (
    <div className="app-root">
      <Header currentPage={page} onNavigate={setPage} isDark={isDark} onToggleDark={onToggleDark} />
      <main className="main-content">
        {page === 'Dashboard' && companyId && <Dashboard onNavigate={setPage} />}
        {page === 'Analytics' && companyId && <Analytics />}
        {page === 'Settings'  && companyId && <Settings />}
        {page === 'Admin' && isAdmin && <Admin onNavigate={setPage} />}
      </main>
      <BottomNav currentPage={page} onNavigate={setPage} />
    </div>
  )
}

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('pv_theme') === 'dark' } catch { return false }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    try { localStorage.setItem('pv_theme', isDark ? 'dark' : 'light') } catch {}
  }, [isDark])

  return (
    <AuthProvider>
      <AppInner isDark={isDark} onToggleDark={() => setIsDark(d => !d)} />
    </AuthProvider>
  )
}
