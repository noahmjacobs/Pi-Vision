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

## PiVision Processor Downloads
Settings page download buttons point to:
  https://github.com/noahmjacobs/pi-vision/releases/latest/download/PiVision-mac.dmg
  https://github.com/noahmjacobs/pi-vision/releases/latest/download/PiVision-windows.exe

When releasing a new version:
1. Run processor/build_mac.sh on a Mac → produces PiVision-mac.dmg
2. Run processor/build_windows.bat on Windows → produces PiVision-windows.exe
3. Create a new GitHub Release (any tag, e.g. v1.0.1) and attach both files
4. The /latest/ URL automatically serves the new version — no code changes needed
