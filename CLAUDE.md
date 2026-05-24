# PiVision — Dev Notes

## Repo is currently PUBLIC
Everything (code, Firebase config, processor) is in a public repo for now.
Before launch as a real product, move to private and handle:
- Firebase config exposure (move to env vars / backend proxy)
- GitHub release assets (private repos require auth to download — need signed URLs or a public CDN)
- API key rotation

## Branch Policy
- All development goes to `dev` only
- Only merge `dev` → `main` when the user explicitly says to
- Railway deploys from `main`

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

**What is stubbed (returns 'none'):**
- Seatbelt detection — needs a specialized model (see TODO below)

**Seatbelt model TODO:**
1. Find a pre-trained model at universe.roboflow.com (search "seatbelt detection")
   - Filter by YOLOv8 format
   - Look for models trained on EXTERIOR roadside footage, not interior dashcam
   - Download as .pt file
2. Drop the file into processor/ as `seatbelt.pt`
3. The code in process_seatbelt.py already detects `seatbelt.pt` and runs it automatically
4. Check what class IDs your model uses and verify the `detect_seatbelts()` function maps them correctly
5. Test on real footage, tune windshield crop if needed

**Future: train custom model**
- Collect labeled frames from actual roadside camera footage
- Train YOLOv8 on that data for accuracy tuned to specific setup
- Replace seatbelt.pt with custom-trained model

### Live Camera Script (processor/camera.py)
- Runs on Raspberry Pi connected to a live USB/CSI camera
- Uses YOLOv8 Nano (must stay real-time on Pi hardware)
- Currently people counter only — no live seatbelt version
- Shelved as main focus for now — desktop app is the primary product
- Still functional, kept for potential future use

### CLI Scripts
- `process.py` — headless CLI people counter, dev tool
- `process_seatbelt.py` — imported by app.py, also usable standalone

---

## Release Process (IMPORTANT — read before releasing)

### How releases work
1. Make all changes on `dev` branch
2. Bump `APP_VERSION` in `processor/app.py` (e.g., `'1.1.2'` → `'1.1.3'`)
3. Push to dev: `git push origin dev`
4. Merge to main (only when user says so): `git checkout main && git merge dev && git push origin main && git checkout dev`
5. Create a new GitHub Release at github.com/noahmjacobs/pi-vision/releases/new
   - Tag: `v1.1.3` (must match APP_VERSION with a `v` prefix)
   - Title: `PiVision Processor v1.1.3`
   - **Do NOT attach any files** — GitHub Actions builds them automatically
6. GitHub Actions spins up Mac + Windows cloud machines, builds both binaries, attaches them to the release (~15-20 min)
7. Existing users see "Update Available" popup next time they open the app
8. They click "Update Now" — app downloads, installs, relaunches automatically

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

## What Still Needs To Be Built

### Seatbelt Detection (highest priority)
- [ ] Find pre-trained seatbelt model on universe.roboflow.com, drop in as processor/seatbelt.pt
- [ ] Verify class IDs in detect_seatbelts() match the downloaded model
- [ ] Test on real roadside footage, tune windshield crop logic if needed
- [ ] Eventually: train custom model on actual footage for best accuracy

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
- [ ] Train custom seatbelt model on real footage
