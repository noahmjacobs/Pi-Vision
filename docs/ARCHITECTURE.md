# Frontend Architecture

## Overview

The dashboard is a React 18 SPA built with Vite and TypeScript. It connects to Firebase Realtime
Database via the Firebase JS SDK over a persistent WebSocket. There is no backend — the Pi writes
directly to Firebase (using the Admin SDK), and the browser reads directly from Firebase.

```
Browser (Railway)             Firebase RTDB              Raspberry Pi(s)
─────────────────             ─────────────              ───────────────
React SPA
 AuthContext  ←─── WebSocket ──→  users/{uid}
 Dashboard    ←─── WebSocket ──→  companies/{id}/devices/{id}/stats
 CameraFeed   ←─── WebSocket ──→  companies/{id}/devices/{id}/camera/snapshot  ←── camera.py
 Analytics    ←─── WebSocket ──→  companies/{id}/devices/{id}/counts
              ←─── WebSocket ──→  companies/{id}/devices/{id}/events
 Settings     ─── write ───────→  companies/{id}/devices/{id}/config
```

## Auth & roles

`AuthContext` (`src/context/AuthContext.tsx`) is the single source of truth for identity.

On login it reads `users/{uid}` to determine role:
- **`role: "user"`** → loads `companies/{companyId}/name` and all devices for that company
- **`role: "admin"`** → loads all companies from `companies/` root; no companyId of their own

`adminViewAs(companyId, deviceId)` lets an admin temporarily take on any company's context,
which makes all other hooks (Dashboard, Analytics, Settings) work as if they were that company's user.

```
useAuth() returns:
  user          Firebase Auth user object
  isAdmin       boolean
  companyId     active company (admin sets this via adminViewAs)
  companyName   display name
  devices       Device[] for active company
  deviceId      currently selected camera
  allCompanies  Company[] — admin only
  devicePath()  helper: "companies/{id}/devices/{id}/{subpath}"
  adminViewAs() switch admin view to a different company/camera
  setDeviceId() switch active camera within current company
```

## Pages

| Page | Who sees it | Description |
|---|---|---|
| `Login` | Everyone (unauthenticated) | Email/password sign in |
| `Dashboard` | Users + admin (after entering a company) | Live feed, people count, events |
| `Analytics` | Users + admin (after entering a company) | Daily counts, donut chart, hourly bar chart |
| `Settings` | Users + admin (after entering a company) | Camera list, colors, config (line pos, etc.) |
| `Admin` | Admin only | Company list — click Enter to view a company's dashboard |

Navigation is client-side state (`useState<Page>` in `App.tsx`) — no router needed.

When an admin logs in with no active company, `App.tsx` automatically redirects to the Admin page.
After `adminViewAs()` sets a company, the admin can browse Dashboard/Analytics/Settings for that company
and return to the Admin page via the Admin tab in the header.

## Component tree

```
App
├── Login                     (unauthenticated)
└── (authenticated)
    ├── Header                logo, desktop nav, clock, sign out
    ├── main
    │   ├── Dashboard
    │   │   ├── StatCard ×2   people count, last event
    │   │   ├── CameraFeed    live snapshot + camera tabs (multi-camera)
    │   │   └── RecentEvents  last events from Firebase
    │   ├── Analytics         donut chart, hourly bar chart, per-camera breakdown
    │   ├── Settings
    │   │   ├── Cameras       rename cameras, assign colors, add/remove cameras
    │   │   └── Camera Settings  line position, confidence, count direction (per-camera)
    │   └── Admin             company list with Enter button, + Add Company modal
    └── BottomNav             mobile-only fixed tab bar
```

## Multi-camera

Companies can have multiple cameras (devices). When `devices.length > 1`:
- `CameraFeed` shows tabs at the bottom — clicking a tab calls `setDeviceId()`
- `Analytics` subscribes to `counts` and `events` for every device and aggregates
- `Settings` shows all cameras in the Cameras section; selecting one in Camera Settings
  loads that camera's config

## Data flow

### useFirebaseValue hook (`src/hooks/useFirebaseData.ts`)

The central data primitive. Subscribes to a Firebase RTDB path via `onValue` and returns live data.

```typescript
const { data: stats } = useFirebaseValue<DBStats>(devicePath('stats'), { peopleCount: 0, lastEvent: '' })
```

`devicePath('stats')` expands to `companies/{companyId}/devices/{deviceId}/stats`.

### Analytics multi-device subscriptions

Analytics uses raw `onValue`/`off` calls (not the hook) because it needs to subscribe to
N devices dynamically:

```typescript
devices.forEach(device => {
  onValue(ref(db, `companies/${companyId}/devices/${device.id}/counts`), snap => { … })
  onValue(ref(db, `companies/${companyId}/devices/${device.id}/events`), snap => { … })
})
```

## Camera colors

Each device can have a `color` hex string stored in Firebase (`devices/{id}/color`).
If not set, the device falls back to `PALETTE[index % PALETTE.length]`.

```typescript
// src/pages/Analytics.tsx
export const PALETTE = ['#1d6ef4', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']
export function deviceColor(color: string | undefined, index: number) {
  return color ?? PALETTE[index % PALETTE.length]
}
```

Colors are picked in Settings (pencil → edit mode shows color swatches) and written to Firebase.
The same colors appear in the Analytics donut chart.

## Styling

Single CSS file at `src/styles/index.css`. No CSS-in-JS, no Tailwind, no component library.

Design tokens are CSS custom properties in `:root`:
- `--glass-bg` / `--glass-border` / `--glass-shadow` — glassmorphism cards
- `--accent-blue` — primary action color
- `--text-primary` / `--text-secondary`

Responsive breakpoints:
- `≤1100px` — tablet: condensed layout
- `≤640px` — mobile: bottom tab bar replaces header nav

## Key files

| File | Purpose |
|---|---|
| `src/App.tsx` | Root — auth guard, page routing, admin redirect |
| `src/context/AuthContext.tsx` | All auth state, company/device context, adminViewAs |
| `src/firebase.ts` | Firebase app init + secondaryAuth (for creating users without signing out admin) |
| `src/hooks/useFirebaseData.ts` | `useFirebaseValue` hook |
| `src/pages/Admin.tsx` | Company list + Add Company modal (creates Firebase Auth user + DB records) |
| `src/pages/Analytics.tsx` | Charts — exports `PALETTE` and `deviceColor` used across app |
| `src/styles/index.css` | Entire design system |
