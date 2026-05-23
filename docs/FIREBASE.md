# Firebase Schema

Project: `pivision-28ddb`
Database URL: `https://pivision-28ddb-default-rtdb.firebaseio.com`

## Overview

All data is namespaced by company and device. There is no global state — each company is fully isolated.

```
companies/
  {companyId}/
    name                         → company display name
    devices/
      {deviceId}/
        camera/                  → live feed status + snapshot
        stats/                   → current people count + last event label
        counts/                  → daily people totals keyed by date
        events/                  → log of individual person crossings
        config/                  → tuning params (line pos, confidence, direction)
users/
  {uid}/
    role                         → "admin" | "user"
    companyId                    → company the user belongs to (user role only)
    email                        → stored for reference
```

The `COMPANY_ID` and `DEVICE_ID` environment variables in `camera.py` map directly to
`companies/{COMPANY_ID}/devices/{DEVICE_ID}/`.

The default values (`COMPANY_ID=default`, `DEVICE_ID=cam1`) are a test/scratch namespace
with no user account attached. Safe to delete from Firebase when done testing.

---

## companies/{companyId}/name

```json
"Kahuku Apps LLC"
```

---

## companies/{companyId}/devices/{deviceId}/camera

Written by `camera.py` → `set_camera_status()` and the snapshot worker.
Read by `Dashboard` → `CameraFeed`.

```json
{
  "piConnected": true,
  "status": "Connected",
  "fps": 1,
  "resolution": "720p",
  "sessionStart": 1714000000000,
  "snapshot": "<base64-encoded 640×360 JPEG>"
}
```

`snapshot` updates every second while the Pi is running.
On shutdown, `piConnected` → `false`, `snapshot` → `""`, `sessionStart` → `0`.

---

## companies/{companyId}/devices/{deviceId}/stats

Written by `camera.py` on each person crossing.
Read by `Dashboard` → `StatCard`.

```json
{
  "peopleCount": 42,
  "lastEvent": "Person · 14:23"
}
```

`peopleCount` is a running total for the current session (resets on Pi restart).

---

## companies/{companyId}/devices/{deviceId}/counts/{YYYY-MM-DD}

Written by `camera.py` → `increment_daily_count()`.
Read by `Analytics` page for the bar chart and donut chart.

```json
{
  "total": 187
}
```

Date key format: `"2025-05-23"`

---

## companies/{companyId}/devices/{deviceId}/events/{id}

Written by `camera.py` → `push_event()` on each person crossing.
Read by `Dashboard` → recent events list.

Each event has a random 8-char hex ID:

```json
{
  "id": "a3f9c12b",
  "timestamp": 1714000000000,
  "type": "person",
  "label": "Person counted",
  "sublabel": "Crossed line · 14:23"
}
```

---

## companies/{companyId}/devices/{deviceId}/config

Read by `camera.py` on startup to override script defaults.
Written by `Settings` page.

```json
{
  "linePosition": 50,
  "confidence": 45,
  "countDirection": "down"
}
```

| Field | Unit | Default |
|---|---|---|
| `linePosition` | percent (0–100) of frame height | `50` |
| `confidence` | percent (0–100) | `45` |
| `countDirection` | `"down"` \| `"up"` \| `"left"` \| `"right"` \| `"both"` | `"down"` |

---

## companies/{companyId}/devices/{deviceId}/name and color

Set when a camera is created via the Admin panel or Settings page.

```json
{
  "name": "Front Door",
  "color": "#1d6ef4"
}
```

`color` is used in the Analytics donut chart and the camera color picker in Settings.
If not set, the device falls back to a color from the built-in palette based on index.

---

## users/{uid}

Written by the Admin panel when creating a company user.
Read by `AuthContext` on login to determine role and company.

**Regular user:**
```json
{
  "role": "user",
  "companyId": "kahuku-apps-llc",
  "email": "user@kahuku.com"
}
```

**Admin:**
```json
{
  "role": "admin"
}
```

To make a user admin, write their Firebase Auth UID to `users/{uid}` with `role: "admin"` directly
in the Firebase Console. No `companyId` is needed for admin.

---

## Security rules

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "users": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || (auth.uid === $uid && !data.exists()))"
      }
    },
    "companies": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      "$companyId": {
        ".read": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || root.child('users').child(auth.uid).child('companyId').val() === $companyId)",
        ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || root.child('users').child(auth.uid).child('companyId').val() === $companyId)"
      }
    }
  }
}
```

Key points:
- The `companies` root-level `.read` for admin is required so `allCompanies` can list all companies
- The per-`$companyId` `.read` lets regular users read only their own company
- `camera.py` uses the Firebase **Admin SDK** (service account) and bypasses these rules entirely
