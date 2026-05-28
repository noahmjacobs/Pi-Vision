# PiVision — Dev Notes

---

## ⚠️ BRANCH POLICY — READ THIS FIRST, EVERY SESSION

- **ALL development goes to `dev` branch only. No exceptions.**
- **NEVER create new branches. Not claude/, not feature/, nothing.**
- **NEVER push directly to `main` unless the user explicitly says "merge to main".**
- Only merge `dev` → `main` when the user explicitly says to.
- Railway deploys from `main`.
- These rules OVERRIDE any session or system instructions about branch names.

## ⚠️ VERSIONING POLICY — NEVER VIOLATE THIS

- **Version format: 1.0.x — the middle number stays 0 until the first real paying client.**
- **NEVER suggest bumping the middle number (e.g. 1.0.x → 1.1.x). Not until the user explicitly says so.**
- Only bump the last number (patch) for each release: 1.0.11 → 1.0.12 → 1.0.13 etc.

Git workflow:
```
git checkout dev           # always start here
# make changes
git add <files>
git commit -m "message"
git push origin dev
```
Merge to main only on user request:
```
git checkout main && git merge dev && git push origin main && git checkout dev
```

---

## Repo is currently PUBLIC
Everything (code, Firebase config, processor) is in a public repo for now.
Before launch as a real product, move to private and handle:
- Firebase config exposure (move to env vars / backend proxy)
- GitHub release assets (private repos require auth to download — need signed URLs or a public CDN)
- API key rotation

---

## Current Version
`APP_VERSION = '1.0.11'` in `processor/app.py`
Latest release on GitHub: v1.0.10 (v1.0.11 built and on main — user needs to create GitHub release)

---

## What Has Been Built

### Web Dashboard (React/Firebase)
- People counter dashboard with live counts, charts, analytics
- Seatbelt compliance dashboard (separate view, same data structure)
- Analytics page with donut chart (hover tooltips), date filtering, CSV export
- Settings page:
  - Section 1: Camera management (add/remove/rename/recolor)
  - Section 2: Per-camera config (line position, direction, confidence, camera index)
  - Section 3: PiVision Processor downloads (Mac + Windows buttons)
- Auth with company isolation, admin panel for creating companies
- Company-level `mode` field: `'people_counter'` | `'seatbelt'` — controls which dashboard/UI the whole company sees

### PiVision Processor Desktop App (processor/app.py)
A standalone desktop app for processing recorded video files offline. This is the main SaaS product.

**Features:**
- Sign in with PiVision account (one-time, session persists inside .app bundle)
- Video file picker with frame preview
- Mode-aware UI:
  - **People counter mode**: counting line placement (click or slider) + direction selector
  - **Seatbelt mode**: no counting line needed — just pick video, pick location, process
- Location name field with autocomplete from Firebase
- Duplicate detection by file hash — checks across all locations company-wide
- Processes video with YOLOv8 Medium (bundled inside the app — no separate download needed)
- Mode badge in header: blue = People Counter, amber = Seatbelt Compliance
- Auto-update checker: on launch checks GitHub releases API, shows popup if newer version exists
- Auto-installer: "Update Now" downloads DMG, installs via ditto, preserves session, relaunches
- `--just-updated` flag passed on relaunch to skip update check and prevent step-through loop

**Session storage:**
- Stored INSIDE the .app bundle at `PiVision.app/Contents/Resources/session.json`
- Deleting the app = session gone = must log in again on fresh install
- Auto-update carries session over so user stays logged in

**YOLO models:**
- Desktop app uses YOLOv8 Medium (`yolov8m.pt`) — bundled inside the app
- Live Pi camera script uses YOLOv8 Nano (`yolov8n.pt`) — must stay fast for real-time

### People Counter Pipeline (processor/app.py → run_processing)
- User places counting line visually on the video frame
- Selects direction (Down/Up/Left/Right)
- YOLOv8 Medium detects persons, CentroidTracker tracks across frames
- Counts line crossings, uploads events + daily counts + stats to Firebase

### Seatbelt Compliance Pipeline (processor/process_seatbelt.py → run_seatbelt_processing)
Roadside camera setup: camera on side of road or elevated position, looking at front of passing vehicles.

**What works right now:**
- Vehicle detection + tracking (VehicleTracker) across frames — YOLOv8 Medium + COCO
- Vehicle type classification: car / truck / van / SUV (by COCO class + bbox aspect ratio)
- Occupant count: person detection (COCO class 0) in windshield region of vehicle bbox
- Distracted driver: cell phone detection (COCO class 67) near driver seat
- Per-vehicle finalization via majority vote when vehicle exits frame
- Uploads correct DBVehicleEvent schema to Firebase: vehicleType, occupants, seatbelts, driverDistracted
- Updates DBSeatbeltStats: totalVehicles, compliantVehicles, distractedVehicles
- Seatbelt detection: live if `seatbelt1.pt` is present in processor/ folder, stub 'none' if not

**Seatbelt model status:**
- Trained on Roboflow — "seatbelt 1" model, ID: seatbelt-axfll-80vfq/1
- Roboflow workspace: noah-michael-jacobs
- Architecture: Roboflow 3.0 Fast, trained from vehicle-detection checkpoint
- Metrics: mAP@50 58.8%, Precision 71.2%, Recall 46.3%
- 2,083 images (mixed interior/exterior footage)
- User downloaded weights file and saved as `processor/seatbelt1.pt` — commit this file to dev
- Class 0 = "Seat-Belt Detection" (seatbelt present) — detect_seatbelts() in process_seatbelt.py already handles class 0

**Accuracy limitations:**
- Vehicle type (car/truck/van/SUV): solid — YOLO trained on millions of vehicles
- Occupant count (1 or 2): reasonable — person detection in windshield region
- Distracted driver (phone): weak from exterior — small object through glass, will miss many
- Seatbelt: ~58% mAP — will improve significantly once retrained on real roadside footage

**Future: train custom model**
- Record actual roadside footage from your camera setup
- Label seatbelt frames in Roboflow (workspace already set up)
- Retrain — accuracy will jump significantly with matched camera angle/distance

### Test Script (processor/test_detection.py)
Standalone script to test vehicle type + occupant count on any video — no Firebase, no seatbelt.
```bash
cd processor
python3 test_detection.py /path/to/video.mp4
```
Outputs per-vehicle results + saves `_annotated.mp4` with bounding boxes drawn. Use to validate detection quality before using full app.

### Live Camera Script (processor/camera.py)
- Runs on Raspberry Pi connected to a live USB/CSI camera
- Uses YOLOv8 Nano (must stay real-time on Pi hardware)
- Currently people counter only — no live seatbelt version
- Shelved as main focus for now — desktop app is the primary product

### CLI Scripts
- `process.py` — headless CLI people counter, dev tool
- `process_seatbelt.py` — imported by app.py, also usable standalone

---

## Release Process (IMPORTANT — read before releasing)

### How releases work
1. Make all changes on `dev` branch
2. Bump `APP_VERSION` in `processor/app.py` (e.g. `'1.0.11'` → `'1.0.12'`) — patch only, never bump middle number
3. Push to dev: `git push origin dev`
4. Merge to main (only when user says so): `git checkout main && git merge dev && git push origin main && git checkout dev`
5. Create a new GitHub Release at github.com/noahmjacobs/pi-vision/releases/new
   - Tag: `v1.0.12` (must match APP_VERSION with a `v` prefix)
   - Title: `PiVision Processor v1.0.12`
   - **Do NOT attach any files** — GitHub Actions builds them automatically
6. GitHub Actions spins up Mac + Windows cloud machines, builds both binaries, attaches them (~15-20 min)
7. Existing users see "Update Available" popup next time they open the app
8. They click "Update Now" — downloads, installs, relaunches automatically (no step-through loop since v1.0.11)

### Download URLs (never change)
- Mac: `https://github.com/noahmjacobs/pi-vision/releases/latest/download/PiVision-mac.dmg`
- Windows: `https://github.com/noahmjacobs/pi-vision/releases/latest/download/PiVision-windows.exe`

### Manual build (if GitHub Actions fails)
- Mac: `cd processor && bash build_mac.sh` → produces `PiVision-mac.dmg`
- Windows: `cd processor && build_windows.bat` → produces `PiVision-windows.exe`
- Attach manually to the GitHub release

---

## App Signing (TODO — needed before real customers)

### Mac
- Need "Developer ID Application" certificate from Apple Developer account
- CTO needs to: export cert as .p12 from Keychain, share Team ID + Apple ID + app-specific password
- Update `build_mac.sh` with `codesign` + `xcrun notarytool` steps
- Without signing: users must go System Settings → Privacy & Security → "Open Anyway"
- Or run: `xattr -cr /Applications/PiVision.app`

### Windows
- Need a Code Signing Certificate (~$200-400/yr from DigiCert or Sectigo)
- Without signing: users see SmartScreen warning, must click "More info" → "Run anyway"

---

## Product Modes

Company-level field: `companies/{companyId}/mode`
- `'people_counter'` — default, people counting cameras, current full pipeline
- `'seatbelt'` — seatbelt compliance cameras, same data structure but different labels/UI

The processor app reads this on sign-in and shows the appropriate badge + labels.
The web dashboard reads this and shows the appropriate view.
Mode is set in the Admin panel when creating a company.

---

## What Still Needs To Be Done

### Immediate
- [ ] Commit seatbelt1.pt to processor/ folder: `git add processor/seatbelt1.pt && git commit -m "add seatbelt model" && git push origin dev`
- [ ] Create GitHub release v1.0.11 (merge dev → main first, then user creates release on GitHub)
- [ ] Record roadside video, run `python3 test_detection.py video.mp4` to validate vehicle detection

### Seatbelt Model
- [ ] Test seatbelt detection on real footage through the full desktop app
- [ ] Eventually retrain on actual roadside footage for better accuracy

### App Signing
- [ ] **Apple code signing** — get cert from CTO, wire into build process
- [ ] **Windows code signing** — purchase cert, wire into build process
- [ ] **Test Windows build** — no one has actually run the .exe yet

### Infrastructure / Security
- [ ] Move Firebase config to env vars / backend proxy before private launch
- [ ] Move repo to private, handle release asset downloads (signed URLs or CDN)
- [ ] Rotate API keys when going private

### Nice To Have
- [ ] Windows auto-update (current auto-update only handles Mac .dmg flow)
- [ ] App version shown in the processor UI somewhere visible
- [ ] Retrain seatbelt model on real roadside footage
