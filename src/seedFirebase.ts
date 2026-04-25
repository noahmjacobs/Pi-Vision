/**
 * Auto-seeds Firebase Realtime Database with realistic mock data when
 * the app loads in development and the database is empty.
 *
 * Imported once from main.tsx — does nothing in production builds.
 */

import { ref, get, set } from 'firebase/database'
import { db } from './firebase'

// Build a map of 20 realistic events spread across the last 2 hours
function buildSeedEvents(): Record<string, object> {
  const now = Date.now()
  const raw = [
    { offset: 2,   type: 'motion', label: 'Motion detected',   sublabel: 'Doorway · left frame' },
    { offset: 7,   type: 'object', label: 'Person identified', sublabel: 'Object detection' },
    { offset: 14,  type: 'motion', label: 'Motion detected',   sublabel: 'Left side panel' },
    { offset: 27,  type: 'object', label: 'Package detected',  sublabel: 'Object detection' },
    { offset: 44,  type: 'motion', label: 'Motion detected',   sublabel: 'Center frame' },
    { offset: 52,  type: 'object', label: 'Person identified', sublabel: 'Object detection' },
    { offset: 61,  type: 'motion', label: 'Motion detected',   sublabel: 'Doorway · right frame' },
    { offset: 73,  type: 'object', label: 'Vehicle detected',  sublabel: 'Object detection' },
    { offset: 82,  type: 'motion', label: 'Motion detected',   sublabel: 'Yard — south' },
    { offset: 94,  type: 'object', label: 'Person identified', sublabel: 'Object detection' },
    { offset: 101, type: 'motion', label: 'Motion detected',   sublabel: 'Left side panel' },
    { offset: 110, type: 'object', label: 'Animal detected',   sublabel: 'Object detection' },
    { offset: 118, type: 'motion', label: 'Motion detected',   sublabel: 'Center frame' },
    { offset: 126, type: 'object', label: 'Package detected',  sublabel: 'Object detection' },
    { offset: 134, type: 'motion', label: 'Motion detected',   sublabel: 'Doorway · left frame' },
    { offset: 143, type: 'object', label: 'Person identified', sublabel: 'Object detection' },
    { offset: 152, type: 'motion', label: 'Motion detected',   sublabel: 'Right side panel' },
    { offset: 163, type: 'object', label: 'Vehicle detected',  sublabel: 'Object detection' },
    { offset: 175, type: 'motion', label: 'Motion detected',   sublabel: 'Doorway · right frame' },
    { offset: 187, type: 'object', label: 'Person identified', sublabel: 'Object detection' },
  ] as const

  const entries: Record<string, object> = {}
  raw.forEach((ev, i) => {
    const id = `evt${String(i + 1).padStart(2, '0')}`
    entries[id] = {
      id,
      timestamp: now - ev.offset * 60000,
      type: ev.type,
      label: ev.label,
      sublabel: ev.sublabel,
    }
  })
  return entries
}

async function seedIfEmpty() {
  try {
    const statsSnap = await get(ref(db, 'stats'))
    if (statsSnap.exists()) {
      console.log('[PiVision] Firebase already seeded — skipping.')
      return
    }

    console.log('[PiVision] Database is empty — seeding mock data…')

    const now = Date.now()

    await set(ref(db, 'stats'), {
      motionEvents: 247,
      objectsDetected: 1832,
      uptime: '14h 32m',
      lastEvent: 'Motion · Doorway · 2m ago',
    })

    await set(ref(db, 'camera'), {
      status: 'Connected',
      fps: 30,
      resolution: '1080p',
      piConnected: true,
    })

    await set(ref(db, 'claude'), {
      lastAnalysis: 'Room appears clear. No motion detected in the last 2 minutes. Previous activity was near the left doorframe — a person was identified at 07:40.',
      lastUpdated: now,
    })

    await set(ref(db, 'events'), buildSeedEvents())

    console.log('[PiVision] Firebase seeded successfully ✓')
  } catch (err) {
    // Non-fatal — app falls back to local mock data
    console.warn('[PiVision] Firebase seed failed (DB rules or offline?):', err)
  }
}

// Only seed in development; tree-shaken away in production builds
if (import.meta.env.DEV) {
  seedIfEmpty()
}
