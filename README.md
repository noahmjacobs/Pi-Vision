# PiVision

A Raspberry Pi security camera dashboard with real-time motion detection, AI scene analysis, and a live camera feed — built with React, Firebase, and OpenCV.

## What it does

- **Live camera feed** — Snapshots from the Pi upload to Firebase every second and display on the dashboard
- **Motion detection** — OpenCV background subtraction detects movement and logs events to Firebase in real time
- **AI scene analysis** — GPT-4o analyzes camera frames every 60 seconds and writes a description to the dashboard
- **Glassmorphism dashboard** — React SPA hosted on Railway, reads all data from Firebase Realtime Database

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Custom glassmorphism CSS (no UI library) |
| Database | Firebase Realtime Database |
| Pi script | Python 3, OpenCV, firebase-admin, OpenAI |
| Hosting | Railway (Docker + nginx) |

## Repo structure

```
├── src/                  # React dashboard
│   ├── components/       # UI components
│   ├── pages/            # Dashboard, Analytics, Alerts, Settings
│   ├── hooks/            # useFirebaseValue (with localStorage cache)
│   └── styles/           # index.css — full design system
├── pi/                   # Raspberry Pi scripts
│   ├── camera.py         # Main camera script
│   └── install.sh        # One-shot installer
├── docs/                 # Architecture and setup docs
├── Dockerfile            # Multi-stage build for Railway
└── nginx.conf            # SPA routing + gzip
```

## Docs

- [Pi setup & camera script](pi/README.md)
- [Frontend architecture](docs/ARCHITECTURE.md)
- [Firebase schema](docs/FIREBASE.md)
- [Deployment guide](docs/DEPLOYMENT.md)

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production — Railway deploys from this |
| `dev` | Work in progress |
