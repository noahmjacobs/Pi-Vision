# PiVision — Changelog

A running log of what was built each session. Most recent at the top.

---

## v1.0.18 — 2026-05-28

### Fix: ByteTrack not working in bundled .app (root cause found)

**Root cause:** `ultralytics/trackers/utils/matching.py` has a bare `import scipy` at
the top of the file — not inside a try/except. The PyInstaller spec had `scipy` in the
`excludes` list to keep bundle size down. So when ByteTrack tried to load its matching
module, scipy import failed immediately, the whole tracker crashed silently, and the app
showed "0% · 0 vehicles" without ever moving.

**Fixes in `PiVision.spec`:**
- Removed `scipy` from `excludes` — ByteTrack needs it at import time even though `lap` does the actual computation
- Added `collect_submodules('ultralytics')` to hidden imports — ensures ByteTrack tracker submodules are bundled (they're dynamically loaded and PyInstaller can't detect them via static analysis)
- Added `lap` to hidden imports — the linear assignment solver used by ByteTrack
- Added `scipy`, `scipy.spatial`, `scipy.spatial.distance`, `scipy.optimize` to hidden imports — explicit bundling as a safety net

**Fix in `app.py`:**
- Exception handler now writes full Python traceback to `~/Desktop/PiVision_error.log` — makes future bundled-app failures diagnosable without a terminal

---

## v1.0.15 — 2026-05-28

### Car Counter Improvements
- **ByteTrack** replaces CentroidTracker for both people and car counter — handles overlapping/occluded objects by maintaining stable IDs across frames using Kalman filter motion prediction
- **Lane boundary sliders** — "Lane left/right" (Down/Up direction) or "Lane top/bottom" (Left/Right direction) let you restrict the counting line to one lane and ignore adjacent lanes
- **IOU=0.3** — lower threshold prevents YOLO from merging two side-by-side cars into one bounding box; both cars get their own detection and are counted correctly
- Direction counting is exclusive — cars going the wrong direction are ignored (e.g. Down only counts cars moving downward on screen)

### Web Dashboard
- **Analytics page** now groups events by upload session — each processed video shows as a group with filename, "Video: [date recorded]", "Uploaded: [date processed]", and crossing count
- **Date filter** is now by video date (when the video was actually recorded), not upload date
- **Default view** shows all uploads instead of just today
- **Dashboard tab hidden** from navigation — live camera dashboard shelved while desktop processor is the primary product. Code intact in Dashboard.tsx, re-enable via BottomNav.tsx + Header.tsx + App.tsx
- **Add Company form** simplified — removed "First Camera Name" and "Camera ID" fields. Companies are created with just name, mode, and login credentials
- **Admin Enter → button** now navigates to Analytics instead of Dashboard

### Code Quality
- Processor app docstring updated to reflect ByteTrack, lane sliders, and dev testing workflow
- CentroidTracker kept in code for reference but marked as replaced by ByteTrack
- `run_processing()` docstring updated with all parameters
- CLAUDE.md fully rewritten to reflect current state of the product
- Deleted stale `AGENTS.md` (old duplicate of CLAUDE.md from a previous session)
- `.gitignore` updated to exclude `*.pt` model files, `processor/build/`, and built `.dmg`/`.exe`
- Archived one-time setup scripts and replaced CLI tool to `_archive/`

### Dev Workflow
- Established: run `python3 /path/to/processor/app.py` for local testing — no need to build a .dmg for every code change
- Mac SSL cert fix documented: `open /Applications/Python 3.14/Install Certificates.command`

---

## v1.0.14 — 2026-05 (previous session)

### Car Counter Mode
- Added `car_counter` as a third product mode (alongside `people_counter` and `seatbelt`)
- Green UI badge for car counter mode
- Detects COCO classes 2/5/7 (car/bus/truck)
- Admin panel mode selector includes car counter option
- CarCounterDashboard and CarCounterAnalytics components added to web dashboard

### Processor App
- `run_processing()` pipeline shared between people_counter and car_counter
- Upload ID (`uploadId`) stamped on every event for grouping in analytics
- Upload record written to Firebase after each processing run: filename, processedAt, videoDate, count, direction
- `videoDate` = file modification time (when the video was actually recorded)

### Windows Auto-Update
- Auto-update flow (previously Mac only) now works on Windows too

---

## v1.0.13 — earlier

### Seatbelt Mode
- `seatbelt` product mode added
- `process_seatbelt.py` pipeline: vehicle detection + tracking, occupant count, distracted driver (phone), seatbelt detection
- Seatbelt model (`seatbelt1.pt`) trained on Roboflow — 58.8% mAP, will improve with real roadside footage
- Amber UI badge for seatbelt mode
- SeatbeltAnalytics and SeatbeltDashboard components

### Processor App
- Location autocomplete from Firebase
- Duplicate video detection by file hash (checks company-wide across all locations)
- Frame preview in the UI — shows middle frame of selected video
- Click or slider to set counting line position
- `--just-updated` flag prevents auto-update loop on relaunch after update

---

## v1.0.10–1.0.12 — earlier

### Foundation
- Firebase Realtime Database schema and auth (company isolation, admin role)
- People counter pipeline: YOLOv8 Medium, line crossing detection, daily counts
- Web dashboard: Analytics page with donut chart, bar chart, date filtering, CSV export
- Settings page: camera management, per-camera config, processor download buttons
- Admin panel: create companies with mode selection
- Auto-update checker and Mac auto-installer (download DMG, install via ditto, relaunch)
- GitHub Actions: builds Mac .dmg and Windows .exe on release creation
- Railway deployment from main branch
- Pi camera script (shelved): live YOLOv8 Nano people counter on Raspberry Pi
