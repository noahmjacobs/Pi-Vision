import { DBStats, DBEvent, DBCamera, DBClaude } from './types'

export const MOCK_STATS: DBStats = {
  motionEvents: 247,
  peopleCount: 84,
  uptime: '14h 32m',
  lastEvent: 'Person · 18:42',
}

export const MOCK_CAMERA: DBCamera = {
  status: 'Connected',
  fps: 30,
  resolution: '1080p',
  piConnected: true,
}

export const MOCK_EVENTS: DBEvent[] = [
  { id: 'evt1', timestamp: Date.now() - 2 * 60000,  type: 'person', label: 'Person counted',  sublabel: 'Crossed line · 18:42' },
  { id: 'evt2', timestamp: Date.now() - 7 * 60000,  type: 'person', label: 'Person counted',  sublabel: 'Crossed line · 18:37' },
  { id: 'evt3', timestamp: Date.now() - 14 * 60000, type: 'person', label: 'Person counted',  sublabel: 'Crossed line · 18:30' },
  { id: 'evt4', timestamp: Date.now() - 27 * 60000, type: 'person', label: 'Person counted',  sublabel: 'Crossed line · 18:17' },
  { id: 'evt5', timestamp: Date.now() - 44 * 60000, type: 'person', label: 'Person counted',  sublabel: 'Crossed line · 18:00' },
]

export const MOCK_CLAUDE: DBClaude = {
  lastAnalysis: 'Room appears clear. No motion detected in the last 2 minutes. Previous activity was near the left doorframe — a person was identified at 07:40.',
  lastUpdated: Date.now(),
}
