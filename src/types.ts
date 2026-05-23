// Firebase Realtime Database schema types

export interface DBStats {
  peopleCount: number
  lastEvent: string
}

export interface DBSeatbeltStats {
  violationCount: number
  totalVehicles: number
  lastEvent: string
}

export interface DBEvent {
  id: string
  timestamp: number
  type: 'motion' | 'object' | 'person'
  label: string
  sublabel: string
}

export interface DBViolationEvent {
  id: string
  timestamp: number
  type: 'violation'
  vehicleType: 'car' | 'truck' | 'van' | 'motorcycle'
  unbelted: number
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
