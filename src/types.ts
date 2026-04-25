export interface CameraEvent {
  id: string
  name: string
  sub: string
  color: string
  time: string
  timestamp: number
}

export interface Stats {
  motionEvents: number
  objectsFound: number
  uptimeSeconds: number
  lastEventLabel: string
  lastEventMinutesAgo: number
}

export interface SystemStatus {
  piStatus: 'Connected' | 'Disconnected' | 'Reconnecting'
  frameRate: number
  resolution: string
  storage: string
  model: string
}

export interface ClaudeAnalysis {
  text: string
  updatedAt: number
}
