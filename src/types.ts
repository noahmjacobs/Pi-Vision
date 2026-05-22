// Firebase Realtime Database schema types

export interface DBStats {
  motionEvents: number
  peopleCount: number
  uptime: string
  lastEvent: string
}

export interface DBEvent {
  id: string
  timestamp: number
  type: 'motion' | 'object' | 'person'
  label: string
  sublabel: string
}

export interface DBCamera {
  status: string
  fps: number
  resolution: string
  piConnected: boolean
}

export interface DBClaude {
  lastAnalysis: string
  lastUpdated: number
}
