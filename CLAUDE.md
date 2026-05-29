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
- Only bump the last number (patch) for each release: 1.0.12 → 1.0.13 → 1.0.14 etc.

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

## ⚠️ VERSION BUMP — ONE FILE, ONE LINE

When releasing a new version, there is **exactly one place** to change:

**`processor/app.py`** — find this line near the top and increment the patch number:
```python
APP_VERSION   = '1.0.14'  # ← change this
```
That's it. Nothing else needs to change.

---

## Changelog
See `CHANGELOG.md` at the root for a full history of what was built each session.

---

## Current Version
`APP_VERSION = '1.0.18'` in `processor/app.py`
Latest release on GitHub: v1.0.18

---

## Testing the Processor Without Building a .dmg

**During development, never build a .dmg just to test a code change.**
Run the app directly from Python instead — it opens the full GUI with your latest code:

```bash
python3 /Users/noahjacobs/Desktop/Pi-Vision/processor/app.py
```

Only build a new .dmg when you're ready to ship to real users (see Release Process below).

**Mac SSL cert fix (one-time, if YOLO model download fails):**
```bash
open /Applications/Python\ 3.14/Install\ Certificates.command
```

---

## Repo is currently PUBLIC
Everything (code, Firebase config, processor) is in a public repo for now.
Before launch as a real product, move to private — see deferred_tasks.md in memory.
Plan: create a separate `pi-vision-releases` public repo for download assets, then make the main repo private.

---

## What Has Been Built

### Web Dashboard (React/Firebase)
- Analytics page with donut chart, upload-grouped event table, video date vs upload date display, date filtering by video date, CSV export
- Settings page: camera management, per-camera config, PiVision Processor downloads
- Auth with company isolation, admin panel for creating companies (name + mode + login only — no camera fields)
- Admin "Enter →" navigates to Analytics (not Dashboard)
- **Dashboard tab is hidden from nav** — code is intact in Dashboard.tsx but shelved while desktop processor is the primary product. Re-enable by restoring it in BottomNav.tsx, Header.tsx, and App.tsx.
- Company-level `mode` field: `'people_counter'` | `'car_counter'` | `'seatbelt'`

### PiVision Processor Desktop App (processor/app.py)
A standalone desktop GUI app for processing recorded video files offline. This is the main SaaS product.

**Features:**
- Sign in with PiVision account (one-time, session persists inside .app bundle)
- Video file picker with frame preview (shows middle frame of video)
- Mode-aware UI:
  - **People counter mode** (blue): counting line + direction + lane sliders
  - **Car counter mode** (green): counting line + direction + lane sliders
  - **Seatbelt mode** (amber): no counting line — just pick video, pick location, process
- Lane boundary sliders: "Lane left/right" (for Down/Up) or "Lane top/bottom" (for Left/Right) — restrict the counting line to a specific lane, ignoring other lanes
- Location name field with autocomplete from Firebase
- Duplicate detection by file hash — checks across all locations company-wide
- Processes video with YOLOv8 Medium (bundled inside the app — no separate download needed)
- Mode badge in header: blue = People Counter, green = Car Counter, amber = Seatbelt Compliance
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
- Selects direction (Down/Up/Left/Right) and optional lane boundaries
- YOLOv8 Medium detects persons (COCO class 0)
- **ByteTrack** (built into ultralytics) tracks persons across frames with stable IDs — handles occlusions
- Counts line crossings: only counts if centroid moves in the selected direction, and if lane boundary is set, only if centroid is within the lane bounds
- Uploads events + daily counts + stats + upload record to Firebase

### Car Counter Pipeline (processor/app.py → run_processing, mode='car_counter')
- Same pipeline as people counter — shared `run_processing()` function
- Detects COCO classes 2/5/7 (car/bus/truck) instead of class 0
- **ByteTrack** tracking with `iou=0.3` — lower IOU threshold keeps side-by-side cars as separate detections instead of merging them
- Direction counting works correctly — Down counts approaching cars, Up counts departing cars, Left/Right for horizontal traffic. Cars going the wrong direction are NOT counted.
- Lane sliders let you target one lane and ignore an adjacent lane in the same frame

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
- Vehicle log grouped by upload session (uploadId stamped on every event)

**Seatbelt model status:**
- Trained on Roboflow — "seatbelt 1" model, ID: seatbelt-axfll-80vfq/1
- Roboflow workspace: noah-michael-jacobs
- Architecture: Roboflow 3.0 Fast, trained from vehicle-detection checkpoint
- Metrics: mAP@50 58.8%, Precision 71.2%, Recall 46.3%
- 2,083 images (mixed interior/exterior footage)
- Class 0 = "Seat-Belt Detection" (seatbelt present) — detect_seatbelts() in process_seatbelt.py handles this

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

---

## Release Process (IMPORTANT — read before releasing)

### How releases work
1. Make all changes on `dev` branch
2. **Bump `APP_VERSION` in `processor/app.py`** — that's the only file (see VERSION BUMP section above)
3. Push to dev: `git push origin dev`
4. Merge to main (only when user says so): `git checkout main && git merge dev && git push origin main && git checkout dev`
5. Create a new GitHub Release at github.com/noahmjacobs/pi-vision/releases/new
   - Tag: `v1.0.15` (must match APP_VERSION with a `v` prefix)
   - Title: `PiVision Processor v1.0.15`
   - **Do NOT attach any files** — GitHub Actions builds them automatically
6. GitHub Actions spins up Mac + Windows cloud machines, builds both binaries, attaches them (~15-20 min)
7. Existing users see "Update Available" popup next time they open the app
8. They click "Update Now" — downloads, installs, relaunches automatically

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
- `'people_counter'` — counts persons crossing a line, blue UI
- `'car_counter'` — counts vehicles crossing a line, green UI
- `'seatbelt'` — seatbelt compliance analysis, amber UI

The processor app reads this on sign-in and shows the appropriate badge + labels.
The web dashboard reads this and shows the appropriate analytics view.
Mode is set in the Admin panel when creating a company.

---

## What Still Needs To Be Done

### Before Next Release (v1.0.15)
- [ ] Bump APP_VERSION to 1.0.15 in processor/app.py
- [ ] Push dev → main → create GitHub release

### Seatbelt Model
- [ ] Test seatbelt detection on real footage through the full desktop app
- [ ] Record roadside video, run `python3 test_detection.py video.mp4` to validate vehicle detection
- [ ] Eventually retrain on actual roadside footage for better accuracy

### App Signing
- [ ] **Apple code signing** — get cert from CTO, wire into build process
- [ ] **Windows code signing** — purchase cert, wire into build process
- [ ] **Test Windows build** — no one has actually run the .exe yet

### Infrastructure / Security
- [ ] Make repo private (see deferred_tasks.md in memory for full plan)
- [ ] Move Firebase config to env vars / backend proxy before private launch
- [ ] Rotate API keys when going private

### Nice To Have
- [ ] App version shown in the processor UI somewhere visible
- [ ] Retrain seatbelt model on real roadside footage
