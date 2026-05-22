# Firebase Schema

Project: `pivision-28ddb`
Database URL: `https://pivision-28ddb-default-rtdb.firebaseio.com`

## Database paths

### `/stats`
Written by: `camera.py` (motion events, last event label)
Read by: `Dashboard` → `StatCard`

```json
{
  "motionEvents": 613,
  "objectsDetected": 1832,
  "uptime": "14h 32m",
  "lastEvent": "Motion · 16:15"
}
```

`objectsDetected` and `uptime` are currently placeholder values — not yet updated by the Pi script.

---

### `/events/{id}`
Written by: `camera.py` → `push_event()`
Read by: `Dashboard` → `RecentEvents`

Each event is a random 8-char hex ID:

```json
{
  "id": "a3f9c12b",
  "timestamp": 1714000000000,
  "type": "motion",
  "label": "Motion detected",
  "sublabel": "USB webcam · Pi"
}
```

`type` is `"motion"` or `"object"`. The dashboard derives dot color from `type` and `label`.

---

### `/camera`
Written by: `camera.py` → `set_camera_status()` and `snapshot_worker`
Read by: `Dashboard` → `CameraFeed`, `StatusBar`

```json
{
  "piConnected": true,
  "status": "Connected",
  "fps": 1,
  "resolution": "720p",
  "snapshot": "<base64-encoded JPEG string>"
}
```

`snapshot` is a 640×360 JPEG encoded as base64. It updates every second while the Pi is running. The dashboard reads it and renders it as `<img src="data:image/jpeg;base64,..." />`.

When the Pi shuts down, `set_camera_status(False)` sets `piConnected: false` and clears `snapshot`.

---

### `/claude`
Written by: `camera.py` → `update_claude()`
Read by: `Dashboard` → `ClaudePanel`

```json
{
  "lastAnalysis": "A person is seated in a chair indoors...",
  "lastUpdated": 1714000000000
}
```

Updated every `ANALYSIS_INTERVAL` seconds (default: 60s) by the GPT-4o vision worker.

---

## TypeScript types

Defined in `src/types.ts`:

```typescript
interface DBStats {
  motionEvents: number
  objectsDetected: number
  uptime: string
  lastEvent: string
}

interface DBEvent {
  id: string
  timestamp: number       // Unix ms
  type: 'motion' | 'object'
  label: string
  sublabel: string
}

interface DBCamera {
  status: string
  fps: number
  resolution: string
  piConnected: boolean
}

interface DBClaude {
  lastAnalysis: string
  lastUpdated: number     // Unix ms
}
```

## Security rules

The database is currently open for read/write (default). Before sharing the dashboard publicly, add rules:

```json
{
  "rules": {
    ".read": true,
    ".write": false,
    "camera": {
      "snapshot": {
        ".write": true
      }
    },
    "stats": { ".write": true },
    "events": { ".write": true },
    "claude": { ".write": true }
  }
}
```

This allows the Pi (unauthenticated) to write while preventing browser clients from modifying data.
