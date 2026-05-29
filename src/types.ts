// Firebase Realtime Database schema types

export interface DBStats {
  peopleCount: number
  lastEvent: string
}

export interface DBSeatbeltStats {
  totalVehicles: number
  compliantVehicles: number
  distractedVehicles: number
  lastEvent: string
}

export interface DBEvent {
  id: string
  timestamp: number
  type: 'motion' | 'object' | 'person' | 'vehicle'
  label: string
  sublabel: string
  uploadId?: string
}

// One record per vehicle pass — the core data unit for seatbelt mode
export interface DBVehicleEvent {
  id: string
  timestamp: number
  type: 'vehicle'
  vehicleType: 'car' | 'truck' | 'van' | 'suv'
  occupants: 1 | 2
  // who is wearing a seatbelt (not who is violating)
  seatbelts: 'both' | 'driver' | 'passenger' | 'none'
  driverDistracted: boolean
  uploadId?: string
}

// One record per video processing run — groups events in the dashboard
export interface DBUpload {
  filename: string
  processedAt: number
  vehicleCount: number
  videoDate?: number   // when the video was actually recorded (manual override or file mtime)
  direction?: string
  location?: string    // location name as entered in the desktop app (device_id)
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
