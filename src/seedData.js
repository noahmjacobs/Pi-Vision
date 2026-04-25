/**
 * One-shot seed script (optional — the app auto-seeds in development).
 * Run manually if you want to reset Firebase from the terminal:
 *   node src/seedData.js
 */

import { initializeApp } from 'firebase/app'
import { getDatabase, ref, set } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyAv8s0vErAwc3KZaRF55isbKTzhgjuwGNE",
  authDomain: "pivision-28ddb.firebaseapp.com",
  projectId: "pivision-28ddb",
  storageBucket: "pivision-28ddb.firebasestorage.app",
  messagingSenderId: "478542567053",
  appId: "1:478542567053:web:d62859128fd4c83dbbb4c4",
  measurementId: "G-BPHNESEJMP",
  databaseURL: "https://pivision-28ddb-default-rtdb.firebaseio.com",
}

const app = initializeApp(firebaseConfig)
const db = getDatabase(app)

const now = Date.now()

const data = {
  // /stats
  stats: {
    motionEvents: 247,
    objectsDetected: 1832,
    uptime: '14h 32m',
    lastEvent: 'Motion · Doorway · 2m ago',
  },

  // /camera
  camera: {
    status: 'Connected',
    fps: 30,
    resolution: '1080p',
    piConnected: true,
  },

  // /claude
  claude: {
    lastAnalysis: 'Room appears clear. No motion detected in the last 2 minutes. Previous activity was near the left doorframe — a person was identified at 07:40.',
    lastUpdated: now,
  },

  // /events — 20 realistic events across the last 3 hours
  events: {
    evt01: { id: 'evt01', timestamp: now - 2   * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Doorway · left frame' },
    evt02: { id: 'evt02', timestamp: now - 7   * 60000, type: 'object', label: 'Person identified', sublabel: 'Object detection' },
    evt03: { id: 'evt03', timestamp: now - 14  * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Left side panel' },
    evt04: { id: 'evt04', timestamp: now - 27  * 60000, type: 'object', label: 'Package detected',  sublabel: 'Object detection' },
    evt05: { id: 'evt05', timestamp: now - 44  * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Center frame' },
    evt06: { id: 'evt06', timestamp: now - 52  * 60000, type: 'object', label: 'Person identified', sublabel: 'Object detection' },
    evt07: { id: 'evt07', timestamp: now - 61  * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Doorway · right frame' },
    evt08: { id: 'evt08', timestamp: now - 73  * 60000, type: 'object', label: 'Vehicle detected',  sublabel: 'Object detection' },
    evt09: { id: 'evt09', timestamp: now - 82  * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Yard — south' },
    evt10: { id: 'evt10', timestamp: now - 94  * 60000, type: 'object', label: 'Person identified', sublabel: 'Object detection' },
    evt11: { id: 'evt11', timestamp: now - 101 * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Left side panel' },
    evt12: { id: 'evt12', timestamp: now - 110 * 60000, type: 'object', label: 'Animal detected',   sublabel: 'Object detection' },
    evt13: { id: 'evt13', timestamp: now - 118 * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Center frame' },
    evt14: { id: 'evt14', timestamp: now - 126 * 60000, type: 'object', label: 'Package detected',  sublabel: 'Object detection' },
    evt15: { id: 'evt15', timestamp: now - 134 * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Doorway · left frame' },
    evt16: { id: 'evt16', timestamp: now - 143 * 60000, type: 'object', label: 'Person identified', sublabel: 'Object detection' },
    evt17: { id: 'evt17', timestamp: now - 152 * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Right side panel' },
    evt18: { id: 'evt18', timestamp: now - 163 * 60000, type: 'object', label: 'Vehicle detected',  sublabel: 'Object detection' },
    evt19: { id: 'evt19', timestamp: now - 175 * 60000, type: 'motion', label: 'Motion detected',   sublabel: 'Doorway · right frame' },
    evt20: { id: 'evt20', timestamp: now - 187 * 60000, type: 'object', label: 'Person identified', sublabel: 'Object detection' },
  },
}

async function seed() {
  try {
    await set(ref(db, '/'), data)
    console.log('✅ Firebase seeded successfully!')
    process.exit(0)
  } catch (err) {
    console.error('❌ Seed failed:', err)
    process.exit(1)
  }
}

seed()
