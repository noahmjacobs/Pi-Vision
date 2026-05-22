# Frontend Architecture

## Overview

The dashboard is a React 18 SPA built with Vite and TypeScript. It connects to Firebase Realtime Database via the Firebase JS SDK and reads live data over a WebSocket connection. There is no backend — the Pi writes directly to Firebase, and the browser reads directly from Firebase.

```
Browser (Railway)          Firebase RTDB           Raspberry Pi
──────────────────         ─────────────           ────────────
React SPA
  └── useFirebaseValue  ←── WebSocket ──→  /stats
  └── useFirebaseValue  ←── WebSocket ──→  /events
  └── useFirebaseValue  ←── WebSocket ──→  /camera/snapshot  ←── camera.py
  └── useFirebaseValue  ←── WebSocket ──→  /claude
```

## Pages

| Page | Route (state) | Description |
|---|---|---|
| `Dashboard` | default | Live feed, stats, events, AI analysis |
| `Analytics` | `'Analytics'` | Charts — motion trends, object breakdown, hourly activity |
| `Alerts` | `'Alerts'` | Alert log with severity badges |
| `Settings` | `'Settings'` | Camera config toggles and selects |

Navigation is client-side state (`useState<Page>` in `App.tsx`) — no router needed.

## Component tree

```
App
├── Header           — logo, desktop nav, clock
├── main
│   ├── Dashboard
│   │   ├── StatCard ×4       — motion count, objects, uptime, last event
│   │   ├── CameraFeed        — live snapshot from Firebase, refreshes every 1s
│   │   ├── ClaudePanel       — GPT-4o analysis text + Q&A input
│   │   ├── RecentEvents      — last 5 events from /events
│   │   └── StatusBar         — Pi connection, fps, resolution, storage, model
│   ├── Analytics    — static charts (placeholder data)
│   ├── Alerts       — static alert list (placeholder data)
│   └── Settings     — local state toggles (not yet wired to Pi)
└── BottomNav        — mobile-only fixed tab bar
```

## Data flow

### useFirebaseValue hook (`src/hooks/useFirebaseData.ts`)

The central data primitive. Subscribes to a Firebase RTDB path via `onValue` and returns `{ data, loading }`.

**localStorage caching:** On mount, the hook checks `localStorage` for a previously cached value. If found, it returns that immediately (`loading: false`) and then updates when Firebase responds. This makes repeat visits feel instant.

**Cache disabled** for `camera/snapshot` (updates every second, ~8 KB — not worth caching).

```typescript
const { data: stats, loading } = useFirebaseValue<DBStats>('stats', MOCK_STATS)
```

### Loading states and skeletons

On first visit (no cache), `loading: true` until Firebase responds. Components render `<Skeleton>` placeholders instead of data. On subsequent visits, cache provides instant data and skeletons never appear.

## Styling

Single CSS file at `src/styles/index.css`. No CSS-in-JS, no Tailwind, no component library.

Design tokens are CSS custom properties in `:root`:
- `--glass-bg` / `--glass-border` / `--glass-shadow` — glassmorphism base
- `--accent-*` — color palette
- `--radius-*` — border radius scale

Responsive breakpoints:
- `≤1100px` — tablet: 2-column stat grid, single-column middle row
- `≤640px` — mobile: 2×2 stat grid, bottom tab bar replaces header nav

## Key files

| File | Purpose |
|---|---|
| `src/firebase.ts` | Firebase app init |
| `src/types.ts` | DB schema TypeScript types |
| `src/mockData.ts` | Fallback values when Firebase is empty |
| `src/seedFirebase.ts` | Auto-seeds DB on first load if `/stats` is absent |
| `src/vite-env.d.ts` | Vite client types for `import.meta.env` |
