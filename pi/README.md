# PiVision — Raspberry Pi Setup

Everything you need to get `camera.py` running on a Raspberry Pi 4.

## Requirements

- Raspberry Pi 4 (tested on Raspberry Pi OS Bookworm 64-bit)
- USB webcam
- Firebase service account JSON (`serviceAccount.json`)
- OpenAI API key

## Quick install

```bash
cd ~/Pi-Vision
chmod +x pi/install.sh
./pi/install.sh
```

The installer:
1. Installs system packages (OpenCV, v4l-utils, etc.)
2. Creates a Python virtual environment at `~/pivision-env`
3. Installs Python packages (opencv-python-headless, firebase-admin, openai)
4. Generates a `run.sh` launcher
5. Optionally installs a systemd service for auto-start on boot

## Firebase service account

Generate at: `console.firebase.google.com → Project Settings → Service Accounts → Generate new private key`

Save the downloaded file as `pi/serviceAccount.json`. This file is gitignored and should never be committed.

## Running

```bash
export OPENAI_API_KEY="sk-..."
source ~/pivision-env/bin/activate
python3 pi/camera.py
```

Or use the generated launcher:

```bash
./pi/run.sh
```

## What camera.py does

| Feature | Details |
|---|---|
| **Snapshots** | Captures a 640×360 JPEG every second, encodes as base64, writes to Firebase `/camera/snapshot` |
| **Motion detection** | OpenCV `BackgroundSubtractorMOG2` — fires when contour area exceeds `MOTION_THRESHOLD` px² |
| **AI analysis** | Sends a frame to GPT-4o every `ANALYSIS_INTERVAL` seconds, writes result to `/claude/lastAnalysis` |
| **LAN stream** | MJPEG server on port 8080 — accessible at `http://<local-ip>:8080/stream` on the same network |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *(required)* | OpenAI API key for GPT-4o vision |
| `CAMERA_INDEX` | `0` | USB camera device index |
| `STREAM_PORT` | `8080` | MJPEG LAN stream port |
| `MOTION_THRESHOLD` | `3000` | Min contour area in px² to count as motion |
| `ANALYSIS_INTERVAL` | `60` | Seconds between GPT-4o calls |
| `MOTION_COOLDOWN` | `2` | Min seconds between consecutive motion events |

## Systemd auto-start

After running `install.sh`, a service file is placed at `/etc/systemd/system/pivision.service`.

```bash
# Edit the service to add your OpenAI key
sudo nano /etc/systemd/system/pivision.service

# Enable and start
sudo systemctl enable pivision
sudo systemctl start pivision

# View logs
sudo journalctl -u pivision -f
```

## Updating

```bash
cd ~/Pi-Vision
git pull origin main
# Restart camera.py or the systemd service
```

## Troubleshooting

**No camera detected**
```bash
v4l2-ctl --list-devices
# Try a different index: CAMERA_INDEX=1 python3 pi/camera.py
```

**ModuleNotFoundError: firebase_admin**
```bash
source ~/pivision-env/bin/activate
python3 pi/camera.py
```

**Snapshot not appearing on dashboard**
Check that `serviceAccount.json` is present and Firebase connection succeeds in the logs.
