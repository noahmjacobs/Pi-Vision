import { useState } from 'react'
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

function AppInner() {
  const { user, authLoading, isAdmin, devices, deviceId } = useAuth()
  const [page, setPage] = useState<Page>('Dashboard')

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="logo-dot" />
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
      <Header currentPage={page} onNavigate={setPage} />
      <main className="main-content">
        {page === 'Dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'Analytics' && <Analytics />}
        {page === 'Settings'  && <Settings />}
        {page === 'Admin' && isAdmin && <Admin onNavigate={setPage} />}
      </main>
      <BottomNav currentPage={page} onNavigate={setPage} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
