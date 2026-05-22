import { useState } from 'react'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'

export type Page = 'Dashboard' | 'Analytics' | 'Settings'

export default function App() {
  const [page, setPage] = useState<Page>('Dashboard')

  return (
    <div className="app-root">
      <Header currentPage={page} onNavigate={setPage} />
      <main className="main-content">
        {page === 'Dashboard' && <Dashboard />}
        {page === 'Analytics' && <Analytics />}
        {page === 'Settings' && <Settings />}
      </main>
      <BottomNav currentPage={page} onNavigate={setPage} />
    </div>
  )
}
