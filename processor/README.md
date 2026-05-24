# PiVision — Offline Video Processor

Process a recorded video file through YOLOv8 people counting. Results write directly
to Firebase and appear in the PiVision Analytics dashboard automatically.

## Setup (one time)

```bash
cd processor
pip install -r requirements.txt
```

Make sure `pi/serviceAccount.json` exists (same one used by camera.py).

## Usage

```bash
python3 process.py --video /path/to/video.mp4 --company your-company-id --device cam1
```

Or with environment variables:
```bash
COMPANY_ID=kahuku-apps-llc DEVICE_ID=cam1 python3 process.py --video recording.mp4
```

## Options

| Flag | Description |
|---|---|
| `--video` | Path to video file (MP4, MOV, MKV, etc.) — required |
| `--company` | Company ID (must match what's in Admin panel) |
| `--device` | Device/camera ID |
| `--force` | Re-process even if this file has been processed before |

## What it does

1. Checks if this video has already been processed (by filename + file size)
2. Runs YOLOv8-nano on every other frame to detect people crossing the counting line
3. Logs progress every 5% with an ETA
4. Writes all events, daily counts, and stats to Firebase
5. Results appear live in PiVision Analytics as soon as writing is complete

## Tuning

Same environment variables as camera.py:

| Variable | Default | Description |
|---|---|---|
| `YOLO_SKIP` | `2` | Process every Nth frame (2 = every other frame, faster) |
| `YOLO_CONFIDENCE` | `0.45` | Detection confidence threshold |
| `COUNT_LINE_POS` | `0.5` | Counting line position (0=top, 1=bottom) |
| `COUNT_DIRECTION` | `down` | `down`, `up`, `left`, `right`, or `both` |

## Duplicate detection

If you run the same video file twice, the processor warns you and asks before overwriting:

```
⚠️  "GoPro_0042.MP4" has already been processed (May 23, 2026 at 14:30).
   Previous run found 187 crossings.
   Process again and overwrite? (y/n):
```

Use `--force` to skip the prompt and always overwrite.

## Speed estimates

| Hardware | 1 hour of 1080p |
|---|---|
| MacBook M1/M2 | ~10-20 minutes |
| MacBook Intel | ~20-40 minutes |
| Raspberry Pi 4 | ~2-4 hours |
