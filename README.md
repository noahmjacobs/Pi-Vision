# PiVision

A multi-company people-counting camera dashboard — Raspberry Pi + YOLOv8 + React + Firebase.

## What it does

- **Live camera feed** — snapshots upload from the Pi every second and display on the dashboard
- **People counting** — YOLOv8-nano detects persons crossing a configurable line, increments a daily total
- **Per-company isolation** — each company gets their own Firebase namespace, login, and dashboard
- **Multi-camera support** — companies can have multiple Pi cameras; each shows as a tab on the feed
- **Admin panel** — admin account can view any company's dashboard and create new companies
- **Analytics** — per-camera daily counts, donut chart breakdown, hourly bar chart with hour filter

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Custom glassmorphism CSS (no UI library) |
| Auth & DB | Firebase Auth + Realtime Database |
| Pi script | Python 3, OpenCV, YOLOv8 (ultralytics), firebase-admin |
| Hosting | Railway (Docker + nginx) |

## Repo structure

```
├── src/
│   ├── components/       # Header, BottomNav, CameraFeed, StatCard, …
│   ├── context/          # AuthContext — auth, role, company, devices
│   ├── pages/            # Dashboard, Analytics, Settings, Admin, Login
│   ├── hooks/            # useFirebaseValue
│   └── styles/           # index.css — full design system
├── pi/
│   ├── camera.py         # Main Pi script — YOLOv8 people counter
│   ├── install.sh        # One-shot Pi installer (venv, systemd, cloudflared)
│   └── README.md         # Pi setup guide
├── docs/
│   ├── ARCHITECTURE.md   # Frontend component tree + data flow
│   ├── FIREBASE.md       # DB schema + security rules
│   └── DEPLOYMENT.md     # Railway + Pi deployment
├── Dockerfile            # Multi-stage build for Railway
└── nginx.conf            # SPA routing + gzip
```

## Docs

- [Pi setup & camera script](pi/README.md)
- [Frontend architecture](docs/ARCHITECTURE.md)
- [Firebase schema & rules](docs/FIREBASE.md)
- [Deployment guide](docs/DEPLOYMENT.md)

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production — Railway auto-deploys from this |
| `dev` | Active development |

## Roles

| Role | Access |
|---|---|
| `user` | Their company's Dashboard, Analytics, Settings |
| `admin` | Admin panel — can enter any company's view, create companies |

Admin account is set by writing `role: "admin"` to `users/{uid}` in Firebase (no companyId needed).

## Default / test environment

Running `camera.py` with no environment variables uses:
- **Company ID:** `default`
- **Device ID:** `cam1`

This writes to `companies/default/devices/cam1/…` — a scratch namespace for local testing.
For real deployments always set `COMPANY_ID` and `DEVICE_ID` explicitly (see `pi/README.md`).
