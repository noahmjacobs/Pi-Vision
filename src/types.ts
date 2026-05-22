// Firebase Realtime Database schema types

export interface DBStats {
  peopleCount: number
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
  sessionStart?: number
}

export interface DBClaude {
  lastAnalysis: string
  lastUpdated: number
}
