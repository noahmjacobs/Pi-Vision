import { CameraEvent, Stats, SystemStatus, ClaudeAnalysis } from './types'

export const MOCK_STATS: Stats = {
  motionEvents: 247,
  objectsFound: 1832,
  uptimeSeconds: 52320,
  lastEventLabel: 'doorway',
  lastEventMinutesAgo: 2,
}

export const MOCK_STATUS: SystemStatus = {
  piStatus: 'Connected',
  frameRate: 30,
  resolution: '1080p',
  storage: 'Firebase · Synced',
  model: 'Claude 3.5',
}

export const MOCK_EVENTS: CameraEvent[] = [
  { id: '1', name: 'Motion detected', sub: 'Doorway · left frame', color: '#1d6ef4', time: '07:40', timestamp: 1 },
  { id: '2', name: 'Person identified', sub: 'Object detection', color: '#22c55e', time: '07:35', timestamp: 2 },
  { id: '3', name: 'Motion detected', sub: 'Left side panel', color: '#1d6ef4', time: '07:28', timestamp: 3 },
  { id: '4', name: 'Package detected', sub: 'Object detection', color: '#f59e0b', time: '07:15', timestamp: 4 },
  { id: '5', name: 'Motion detected', sub: 'Center frame', color: '#1d6ef4', time: '06:58', timestamp: 5 },
]

export const MOCK_CLAUDE: ClaudeAnalysis = {
  text: 'Room appears clear. No motion detected in the last 2 minutes. Previous activity was near the left doorframe — a person was identified at 07:40.',
  updatedAt: Date.now(),
}
