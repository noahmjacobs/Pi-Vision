import { useState } from 'react'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Alerts from './pages/Alerts'
import Settings from './pages/Settings'

export type Page = 'Dashboard' | 'Analytics' | 'Alerts' | 'Settings'

export default function App() {
  const [page, setPage] = useState<Page>('Dashboard')

  return (
    <div className="app-root">
      <Header currentPage={page} onNavigate={setPage} />
      <main className="main-content">
        {page === 'Dashboard' && <Dashboard />}
        {page === 'Analytics' && <Analytics />}
        {page === 'Alerts' && <Alerts />}
        {page === 'Settings' && <Settings />}
      </main>
    </div>
  )
}
