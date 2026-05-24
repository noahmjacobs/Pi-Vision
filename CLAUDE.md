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
A standalone desktop app for processing recorded video files offline.

**Features:**
- Sign in with PiVision account (one-time, session persists inside .app bundle)
- Video file picker with frame preview
- Visual counting line placement (click on preview OR use slider)
- Direction selector (Down / Up / Left / Right)
- Location name field with autocomplete from Firebase
- Duplicate detection by file hash — checks across all locations company-wide
- Processes video with YOLOv8 Nano, uploads results to Firebase
- Mode-aware: shows "People Counter" (blue) or "Seatbelt Compliance" (amber) badge based on company mode
- Auto-update checker: on launch checks GitHub releases API, shows popup if newer version exists
- Auto-installer: "Update Now" downloads DMG, installs via ditto, preserves session, relaunches

**Session storage:**
- Stored INSIDE the .app bundle at `PiVision.app/Contents/Resources/session.json`
- Deleting the app = session gone = must log in again on fresh install
- Auto-update carries session over so user stays logged in

**CLI processor (processor/process.py):**
- `python process.py <video> --line 50 --direction down` for headless processing
- Used internally by the GUI app

---

## Release Process (IMPORTANT — read before releasing)

### How releases work
1. Make all changes on `dev` branch
2. Bump `APP_VERSION` in `processor/app.py` (e.g., `'1.0.9'` → `'1.0.10'`)
3. Push to dev: `git push origin dev`
4. Merge to main: `git checkout main && git merge dev && git push origin main && git checkout dev`
5. Create a new GitHub Release at github.com/noahmjacobs/pi-vision/releases/new
   - Tag: `v1.0.10` (must match APP_VERSION with a `v` prefix)
   - Title: `PiVision Processor v1.0.10`
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
- `'seatbelt'` — seatbelt compliance cameras, same data structure but different labels

The processor app reads this on sign-in and shows the appropriate badge + labels.
The web dashboard reads this and shows the appropriate view.
Mode is set in the Admin panel when creating a company.

---

## What Still Needs To Be Built

### High Priority
- [ ] **Apple code signing** — get cert from CTO, wire into build process
- [ ] **Windows code signing** — purchase cert, wire into build process
- [ ] **Test Windows build** — no one has actually run the .exe yet

### Seatbelt Compliance Pipeline
- [ ] `process_seatbelt.py` — vehicle detection + seatbelt/distraction checking
- [ ] Different YOLO model or custom trained model for vehicle interior detection
- [ ] Seatbelt-specific analytics (compliance rate, violation events, etc.)
- [ ] Processor app UI adjustments for seatbelt mode (different labels throughout)

### Infrastructure / Security
- [ ] Move Firebase config to env vars / backend proxy before private launch
- [ ] Move repo to private, handle release asset downloads (signed URLs or CDN)
- [ ] Rotate API keys when going private

### Nice To Have
- [ ] Arrow graphic in DMG pointing to Applications folder (cosmetic)
- [ ] Windows auto-update (current auto-update only handles Mac .dmg flow)
- [ ] App version shown in the processor UI somewhere visible
