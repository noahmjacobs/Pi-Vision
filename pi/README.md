# PiVision — Raspberry Pi Setup

Everything you need to get `camera.py` running on a Raspberry Pi.

## Requirements

- Raspberry Pi 4 (tested on Raspberry Pi OS Bookworm 64-bit)
- USB webcam
- Firebase service account JSON (`pi/serviceAccount.json`)

## Quick install

```bash
cd ~/Pi-Vision/pi
chmod +x install.sh
./install.sh
```

The installer:
1. Installs system packages (Python, OpenCV, v4l-utils, etc.)
2. Creates a Python virtual environment at `~/pivision-env`
3. Installs Python packages (opencv-python-headless, firebase-admin, ultralytics/YOLOv8)
4. Installs cloudflared for HTTPS stream tunneling
5. Generates a `run.sh` launcher
6. Installs a systemd service for auto-start on boot

## Firebase service account

Generate at: Firebase Console → Project Settings → Service Accounts → Generate new private key

Save the downloaded file as `pi/serviceAccount.json`. This file is gitignored — never commit it.

## Running a camera

Every Pi needs to know which company and which camera it is. Set this with two environment variables:

```bash
COMPANY_ID=your-company-id DEVICE_ID=cam1 python3 camera.py
```

These map to the Firebase path: `companies/{COMPANY_ID}/devices/{DEVICE_ID}/…`

### Default / test environment

If you run `camera.py` with no env vars, it defaults to:
- `COMPANY_ID=default`
- `DEVICE_ID=cam1`

This writes to `companies/default/devices/cam1/…` — a scratch namespace safe to use for
testing on your laptop or while developing. It has no login account attached to it.
Delete `companies/default` from Firebase when you're done testing.

### Real company deployment

1. In the Admin panel, add a company and note its ID (e.g. `kahuku-apps-llc`)
2. Add a camera with a device ID (e.g. `cam1`)
3. On each Pi, hard-code those IDs — either by:

   **Option A — environment variables every time:**
   ```bash
   COMPANY_ID=kahuku-apps-llc DEVICE_ID=cam1 python3 camera.py
   ```

   **Option B — edit the systemd service file (recommended for production):**
   ```bash
   sudo nano /etc/systemd/system/pivision.service
   ```
   Set the `Environment=` lines:
   ```
   Environment=COMPANY_ID=kahuku-apps-llc
   Environment=DEVICE_ID=cam1
   ```
   Then reload:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart pivision
   ```

## Running multiple cameras on the same machine

Each camera.py process needs a unique `STREAM_PORT` (default is 8080). If two cameras run on the
same machine, give each a different port:

```bash
# Terminal 1 — first camera
COMPANY_ID=kahuku-apps-llc DEVICE_ID=cam1 STREAM_PORT=8080 python3 camera.py

# Terminal 2 — second camera (different port to avoid "Address already in use")
COMPANY_ID=kahuku-apps-llc DEVICE_ID=cam2 STREAM_PORT=8081 python3 camera.py
```

## All environment variables

| Variable | Default | Description |
|---|---|---|
| `COMPANY_ID` | `default` | Company ID in Firebase — matches the company created in Admin panel |
| `DEVICE_ID` | `cam1` | Camera/device ID in Firebase — matches the camera created in Admin panel |
| `CAMERA_INDEX` | `0` | USB camera device index (0 = first USB camera) |
| `STREAM_PORT` | `8080` | LAN MJPEG stream port — change if running multiple cameras on same machine |
| `YOLO_MODEL` | `yolov8n.pt` | YOLO model weights (downloads automatically on first run) |
| `YOLO_CONFIDENCE` | `0.45` | Detection confidence threshold (0–1) |
| `YOLO_SKIP` | `2` | Run YOLO every Nth frame — increase on slower hardware |
| `COUNT_LINE_POS` | `0.5` | Counting line position as fraction of frame height (0=top, 1=bottom) |
| `COUNT_DIRECTION` | `down` | Direction to count: `down`, `up`, `left`, `right`, `both` |

## Systemd auto-start

After running `install.sh`, a service is placed at `/etc/systemd/system/pivision.service`.

```bash
# Edit to set your company and camera IDs
sudo nano /etc/systemd/system/pivision.service

# Enable (start on boot) and start now
sudo systemctl enable pivision
sudo systemctl start pivision

# View live logs
sudo journalctl -u pivision -f
```

The service file looks like this — the `Environment=` lines are what you need to customize:

```ini
[Unit]
Description=PiVision Camera
After=network-online.target

[Service]
Type=simple
User=pi
ExecStart=/home/pi/Pi-Vision/pi/run.sh
Restart=on-failure
RestartSec=5
Environment=CAMERA_INDEX=0
Environment=COMPANY_ID=your-company-id
Environment=DEVICE_ID=cam1

[Install]
WantedBy=multi-user.target
```

## What camera.py does

| Feature | Details |
|---|---|
| **Snapshots** | 640×360 JPEG every second, base64-encoded → `camera/snapshot` in Firebase |
| **People counting** | YOLOv8-nano detects persons, centroid tracker counts line crossings |
| **Daily totals** | Crossing count written to `counts/{YYYY-MM-DD}/total` |
| **Events** | Each crossing logged to `events/{id}` with timestamp |
| **LAN stream** | MJPEG server on `STREAM_PORT` — `http://<local-ip>:8080/stream` |
| **Firebase config** | Reads `config/` node on startup to override line position, confidence, direction |

## Updating

```bash
cd ~/Pi-Vision
git pull origin main
sudo systemctl restart pivision   # or restart manually
```

## Troubleshooting

**No camera detected**
```bash
v4l2-ctl --list-devices
# Try: CAMERA_INDEX=1 python3 camera.py
```

**"Address already in use" on startup**
```bash
# Another camera.py is running, or you forgot to set STREAM_PORT for a second camera
# Check:
lsof -i :8080
# Kill or set STREAM_PORT=8081 for the second instance
```

**ModuleNotFoundError: firebase_admin**
```bash
source ~/pivision-env/bin/activate
python3 camera.py
```

**Snapshot not appearing on dashboard**
Check that `serviceAccount.json` is present and Firebase init succeeds in the logs.

**People count not incrementing**
- Check the counting line position (yellow line visible on the snapshot in the dashboard)
- Lower `YOLO_CONFIDENCE` if detections are being missed
- Check `COUNT_DIRECTION` matches how people move through frame
