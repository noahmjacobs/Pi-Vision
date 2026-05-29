# PiVision

Privacy-preserving video analytics — upload recorded footage, get clean count reports. No cloud video. No live streaming required.

Currently in active development. Three modes: people counting, vehicle counting, and seatbelt compliance analysis.

---

## What it is

PiVision is a desktop app + web dashboard combo. Users download the processor app, sign in with their company account, drop a video on it, and get results written live to their dashboard.

Video never leaves the user's machine. Only counts and events are sent to Firebase.

---

## Products

### PiVision Processor (desktop app)
Standalone GUI app for Mac and Windows. Processes recorded video files offline.

- Sign in with PiVision account (session persists inside the app bundle)
- Pick a video — preview the middle frame, set a counting line by clicking or slider
- Set video start date/time (auto-filled from file mtime, editable if wrong)
- Enter a location name — smart autocomplete from previous entries so names stay consistent
- Duplicate detection — won't recount a video you've already processed
- Processes with YOLOv8 Medium + ByteTrack (bundled — no separate download)
- Results appear live in the web dashboard

**Modes:**
| Mode | Badge | What it counts |
|---|---|---|
| People Counter | Blue | Persons crossing a line |
| Car Counter | Green | Vehicles (car/bus/truck) crossing a line |
| Seatbelt Compliance | Amber | Vehicle passes, occupant count, seatbelt status, distracted driver |

**Lane controls:** left/right (or top/bottom) boundary sliders restrict the counting line to one lane, ignoring adjacent lanes in the same frame.

---

### Web Dashboard (React/Firebase)
Multi-company analytics dashboard. Railway-hosted, auto-deployed from `main`.

- **Analytics page:** KPI cards, 7-day bar chart, hourly bar chart, per-location donut chart, collapsible upload log with crossing timestamps, CSV export
- **Settings page:** camera/location management, processor download buttons
- **Admin panel:** create companies (name, mode, login credentials)
- Company isolation — each company sees only their own data
- Role-based access: `user` (company data only) vs `admin` (all companies + creation)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Custom glassmorphism CSS (no UI library) |
| Auth & DB | Firebase Auth + Realtime Database |
| Processor | Python 3, CustomTkinter, OpenCV, YOLOv8 (ultralytics), ByteTrack |
| Hosting | Railway (Docker + nginx) |
| Builds | GitHub Actions — Mac .dmg + Windows .exe on release |

---

## Repo Structure

```
├── src/
│   ├── components/       # Header, BottomNav, StatCard, …
│   ├── context/          # AuthContext — auth, role, company, devices, mode
│   ├── pages/            # Analytics, Settings, Admin, Login, Dashboard (shelved)
│   └── styles/           # index.css — full design system
├── processor/
│   ├── app.py            # Desktop GUI app — main product
│   ├── process_seatbelt.py  # Seatbelt compliance pipeline
│   ├── bytetrack.yaml    # ByteTrack config (bundled into app)
│   ├── PiVision.spec     # PyInstaller build spec
│   ├── build_mac.sh      # Manual Mac build script
│   └── build_windows.bat # Manual Windows build script
├── Dockerfile            # Multi-stage build for Railway
└── nginx.conf            # SPA routing + gzip
```

---

## Branches & Deployment

| Branch | Purpose |
|---|---|
| `main` | Production — Railway auto-deploys web dashboard from here |
| `dev` | All active development — never push features directly to main |

Processor releases: create a GitHub Release tagged `v1.0.x` → GitHub Actions builds Mac + Windows binaries automatically (~15 min). Existing users see an update prompt next time they open the app.

---

## Current Version

`v1.0.18` — [Releases](https://github.com/noahmjacobs/pi-vision/releases)

**Download:**
- Mac: `https://github.com/noahmjacobs/pi-vision/releases/latest/download/PiVision-mac.dmg`
- Windows: `https://github.com/noahjacobs/pi-vision/releases/latest/download/PiVision-windows.exe`

---

## Roles

| Role | Access |
|---|---|
| `user` | Their company's Analytics + Settings |
| `admin` | Admin panel — enter any company's view, create companies |

Set admin by writing `role: "admin"` to `users/{uid}` in Firebase (no companyId needed).

---

## What's Next

- Seatbelt model retraining on real roadside/overpass footage
- Interval exports (15/30/60-min bins) for traffic studies
- Print/PDF report view
- App code signing (Apple + Windows)
- Repo → private before commercial launch
