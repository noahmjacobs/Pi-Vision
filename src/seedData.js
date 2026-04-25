/**
 * Run once to seed Firebase Realtime Database with mock data:
 *   node src/seedData.js
 *
 * Requires: npm install firebase (already in package.json)
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

const data = {
  stats: {
    motionEvents: 247,
    objectsFound: 1832,
    uptimeSeconds: 52320,
    lastEventLabel: 'doorway',
    lastEventMinutesAgo: 2,
  },
  status: {
    piStatus: 'Connected',
    frameRate: 30,
    resolution: '1080p',
    storage: 'Firebase · Synced',
    model: 'Claude 3.5',
  },
  claude: {
    text: 'Room appears clear. No motion detected in the last 2 minutes. Previous activity was near the left doorframe — a person was identified at 07:40.',
    updatedAt: Date.now(),
  },
  events: {
    evt1: { id: 'evt1', name: 'Motion detected', sub: 'Doorway · left frame', color: '#1d6ef4', time: '07:40', timestamp: 740 },
    evt2: { id: 'evt2', name: 'Person identified', sub: 'Object detection', color: '#22c55e', time: '07:35', timestamp: 735 },
    evt3: { id: 'evt3', name: 'Motion detected', sub: 'Left side panel', color: '#1d6ef4', time: '07:28', timestamp: 728 },
    evt4: { id: 'evt4', name: 'Package detected', sub: 'Object detection', color: '#f59e0b', time: '07:15', timestamp: 715 },
    evt5: { id: 'evt5', name: 'Motion detected', sub: 'Center frame', color: '#1d6ef4', time: '06:58', timestamp: 658 },
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
