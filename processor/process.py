#!/usr/bin/env python3
"""
PiVision — Offline Video Processor
------------------------------------
Processes a recorded video file through YOLOv8 people counting and writes
results to Firebase Realtime Database in the same format as the live camera
script. Results appear immediately in the PiVision Analytics dashboard.

Usage:
    python3 process.py --video /path/to/video.mp4 --company kahuku-apps-llc --device cam1

    Or with environment variables:
    COMPANY_ID=kahuku-apps-llc DEVICE_ID=cam1 python3 process.py --video video.mp4

Requirements:
    pip install -r requirements.txt
    Place pi/serviceAccount.json in the same directory or set SERVICE_ACCOUNT env var.

How it works:
    1. Checks Firebase if this video file has been processed before (by filename + size)
    2. Runs YOLOv8-nano on every Nth frame to detect and count people crossing a line
    3. Writes events, daily counts, and stats to Firebase — same paths as live camera
    4. Marks the video as processed so duplicate runs are caught

Firebase paths written:
    companies/{companyId}/devices/{deviceId}/events/{id}
    companies/{companyId}/devices/{deviceId}/counts/{YYYY-MM-DD}/total
    companies/{companyId}/devices/{deviceId}/stats/peopleCount
    companies/{companyId}/devices/{deviceId}/stats/lastEvent
    companies/{companyId}/devices/{deviceId}/processed/{fileHash}
"""

from __future__ import annotations

import os
import sys
import time
import uuid
import argparse
import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path

import cv2
import firebase_admin
from firebase_admin import credentials, db as rtdb
from ultralytics import YOLO

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('PiVision-Processor')

# ── Config ─────────────────────────────────────────────────────────────────────
FIREBASE_DB_URL  = 'https://pivision-28ddb-default-rtdb.firebaseio.com'
FIREBASE_PROJECT = 'pivision-28ddb'
SERVICE_ACCOUNT  = os.environ.get(
    'SERVICE_ACCOUNT',
    os.path.join(os.path.dirname(__file__), '..', 'pi', 'serviceAccount.json'),
)

COMPANY_ID   = os.environ.get('COMPANY_ID', '')
DEVICE_ID    = os.environ.get('DEVICE_ID',  '')
YOLO_MODEL   = os.environ.get('YOLO_MODEL', 'yolov8n.pt')
YOLO_CONF    = float(os.environ.get('YOLO_CONFIDENCE', '0.45'))
YOLO_SKIP    = int(os.environ.get('YOLO_SKIP', '2'))           # process every Nth frame
COUNT_LINE   = float(os.environ.get('COUNT_LINE_POS', '0.5'))  # 0.0–1.0 fraction of height
COUNT_DIR    = os.environ.get('COUNT_DIRECTION', 'down')        # down|up|left|right|both


# ── Firebase helpers ───────────────────────────────────────────────────────────
def db_path(subpath: str) -> str:
    return f'companies/{COMPANY_ID}/devices/{DEVICE_ID}/{subpath}'


def init_firebase() -> None:
    sa = SERVICE_ACCOUNT
    if not os.path.exists(sa):
        log.error(
            'serviceAccount.json not found at %s\n'
            'Generate at: Firebase Console → Project Settings → Service Accounts',
            sa,
        )
        sys.exit(1)
    cred = credentials.Certificate(sa)
    firebase_admin.initialize_app(cred, {'databaseURL': FIREBASE_DB_URL})
    log.info('Firebase connected ✓')


def file_hash(path: str, size: int) -> str:
    """Stable identifier for a video file — filename + size (fast, no full read)."""
    name = Path(path).name
    return hashlib.md5(f'{name}:{size}'.encode()).hexdigest()[:16]


def check_already_processed(fhash: str) -> dict | None:
    """Returns the previous run record if this file has been processed before."""
    try:
        result = rtdb.reference(db_path(f'processed/{fhash}')).get()
        return result if isinstance(result, dict) else None
    except Exception:
        return None


def mark_processed(fhash: str, filename: str, size: int, vehicle_count: int) -> None:
    rtdb.reference(db_path(f'processed/{fhash}')).set({
        'filename':      filename,
        'size':          size,
        'processedAt':   int(time.time() * 1000),
        'vehicleCount':  vehicle_count,
    })


def push_event(event_id: str, timestamp_ms: int, label: str, sublabel: str) -> None:
    rtdb.reference(db_path(f'events/{event_id}')).set({
        'id':        event_id,
        'timestamp': timestamp_ms,
        'type':      'person',
        'label':     label,
        'sublabel':  sublabel,
    })


def increment_daily_count(date_key: str, count: int) -> None:
    path = db_path(f'counts/{date_key}/total')
    current = rtdb.reference(path).get() or 0
    rtdb.reference(path).set(current + count)


def write_stats(people_count: int, last_event: str) -> None:
    rtdb.reference(db_path('stats')).update({
        'peopleCount': people_count,
        'lastEvent':   last_event,
    })


# ── Centroid tracker (same as camera.py) ──────────────────────────────────────
class CentroidTracker:
    def __init__(self, max_disappeared: int = 30, max_distance: int = 80) -> None:
        self.next_id = 0
        self.centroids: dict[int, tuple[int, int]] = {}
        self.disappeared: dict[int, int] = {}
        self.sides: dict[int, str] = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def update(self, new_centroids: list[tuple[int, int]]) -> dict[int, tuple[int, int]]:
        if not new_centroids:
            for oid in list(self.disappeared):
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    self._deregister(oid)
            return self.centroids

        if not self.centroids:
            for c in new_centroids:
                self._register(c)
        else:
            ids      = list(self.centroids)
            existing = [self.centroids[i] for i in ids]
            used_ex: set[int]  = set()
            used_new: set[int] = set()

            for ni, nc in enumerate(new_centroids):
                best_j, best_d = -1, float('inf')
                for ej, ec in enumerate(existing):
                    if ej in used_ex:
                        continue
                    d = ((nc[0] - ec[0]) ** 2 + (nc[1] - ec[1]) ** 2) ** 0.5
                    if d < best_d:
                        best_d, best_j = d, ej
                if best_j >= 0 and best_d < self.max_distance:
                    oid = ids[best_j]
                    self.centroids[oid] = nc
                    self.disappeared[oid] = 0
                    used_ex.add(best_j)
                    used_new.add(ni)

            for ej in range(len(existing)):
                if ej not in used_ex:
                    oid = ids[ej]
                    self.disappeared[oid] += 1
                    if self.disappeared[oid] > self.max_disappeared:
                        self._deregister(oid)

            for ni, nc in enumerate(new_centroids):
                if ni not in used_new:
                    self._register(nc)

        return self.centroids

    def check_crossings(self, line_pos: int, axis: str = 'y', direction: str = 'down') -> int:
        count = 0
        for oid, (cx, cy) in self.centroids.items():
            pos  = cy if axis == 'y' else cx
            side = 'before' if pos < line_pos else 'after'
            prev = self.sides.get(oid)
            if prev is not None and prev != side:
                if direction == 'both':
                    count += 1
                elif direction in ('down', 'right') and prev == 'before' and side == 'after':
                    count += 1
                elif direction in ('up', 'left') and prev == 'after' and side == 'before':
                    count += 1
            self.sides[oid] = side
        return count

    def _register(self, centroid: tuple[int, int]) -> None:
        self.centroids[self.next_id] = centroid
        self.disappeared[self.next_id] = 0
        self.next_id += 1

    def _deregister(self, oid: int) -> None:
        del self.centroids[oid]
        del self.disappeared[oid]
        self.sides.pop(oid, None)


# ── Main processing loop ───────────────────────────────────────────────────────
def process_video(video_path: str) -> None:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        log.error('Cannot open video file: %s', video_path)
        sys.exit(1)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps          = cap.get(cv2.CAP_PROP_FPS) or 30
    width        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_s   = total_frames / fps

    log.info('Video: %s', Path(video_path).name)
    log.info('  Resolution : %dx%d', width, height)
    log.info('  FPS        : %.1f', fps)
    log.info('  Duration   : %dm %ds', int(duration_s // 60), int(duration_s % 60))
    log.info('  Frames     : %d (processing every %d)', total_frames, YOLO_SKIP)
    log.info('Loading YOLO model: %s', YOLO_MODEL)

    model   = YOLO(YOLO_MODEL)
    tracker = CentroidTracker()
    axis    = 'x' if COUNT_DIR in ('left', 'right') else 'y'
    line    = int((width if axis == 'x' else height) * COUNT_LINE)

    log.info('Counting line: %s=%d  direction=%s', axis, line, COUNT_DIR)
    log.info('Processing — this may take a few minutes...')

    # We'll use the video file's modification date as the "recording date"
    file_mtime  = os.path.getmtime(video_path)
    record_date = datetime.fromtimestamp(file_mtime, tz=timezone.utc)

    people_count = 0
    last_event   = ''
    pending_events: list[tuple[str, int, str, str]] = []  # (id, ts_ms, label, sublabel)
    daily_counts: dict[str, int] = {}

    frame_num    = 0
    processed    = 0
    last_log_pct = -1
    start_time   = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_num += 1

        # Progress every 5%
        pct = int((frame_num / total_frames) * 100)
        if pct % 5 == 0 and pct != last_log_pct:
            elapsed  = time.time() - start_time
            eta_s    = (elapsed / max(frame_num, 1)) * (total_frames - frame_num)
            log.info('  %d%% — frame %d/%d — %d crossings — ETA %dm%ds',
                     pct, frame_num, total_frames, people_count,
                     int(eta_s // 60), int(eta_s % 60))
            last_log_pct = pct

        if frame_num % YOLO_SKIP != 0:
            continue

        processed += 1
        results   = model(frame, classes=[0], conf=YOLO_CONF, verbose=False)
        centroids = []
        for box in results[0].boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            centroids.append(((x1 + x2) // 2, (y1 + y2) // 2))

        tracker.update(centroids)
        crossings = tracker.check_crossings(line, axis=axis, direction=COUNT_DIR)

        if crossings > 0:
            people_count += crossings

            # Calculate the real-world timestamp of this frame
            frame_time_s = frame_num / fps
            frame_dt     = record_date.replace(
                hour=0, minute=0, second=0, microsecond=0
            ).timestamp() + frame_time_s
            ts_ms    = int(frame_dt * 1000)
            date_key = datetime.fromtimestamp(frame_dt).strftime('%Y-%m-%d')
            ts_label = datetime.fromtimestamp(frame_dt).strftime('%H:%M')

            event_id  = uuid.uuid4().hex[:8]
            sublabel  = f'Crossed line · {ts_label} (from video)'
            last_event = f'Person · {ts_label}'

            pending_events.append((event_id, ts_ms, 'Person counted', sublabel))
            daily_counts[date_key] = daily_counts.get(date_key, 0) + crossings

    cap.release()

    elapsed = time.time() - start_time
    log.info('Processing complete in %dm %ds', int(elapsed // 60), int(elapsed % 60))
    log.info('Total crossings detected: %d', people_count)
    log.info('Writing %d events to Firebase...', len(pending_events))

    # Write all events to Firebase
    for event_id, ts_ms, label, sublabel in pending_events:
        push_event(event_id, ts_ms, label, sublabel)

    # Write daily counts
    for date_key, count in daily_counts.items():
        increment_daily_count(date_key, count)
        log.info('  %s: %d crossings', date_key, count)

    # Write stats
    write_stats(people_count, last_event)

    log.info('Done — results are live in PiVision Analytics.')


# ── Entry point ────────────────────────────────────────────────────────────────
def main() -> None:
    global COMPANY_ID, DEVICE_ID

    parser = argparse.ArgumentParser(description='PiVision offline video processor')
    parser.add_argument('--video',   required=True,  help='Path to video file (MP4, MOV, etc.)')
    parser.add_argument('--company', default=COMPANY_ID, help='Company ID (or set COMPANY_ID env var)')
    parser.add_argument('--device',  default=DEVICE_ID,  help='Device ID (or set DEVICE_ID env var)')
    parser.add_argument('--force',   action='store_true', help='Re-process even if already processed')
    args = parser.parse_args()

    COMPANY_ID = args.company
    DEVICE_ID  = args.device

    if not COMPANY_ID or not DEVICE_ID:
        log.error('Company ID and Device ID are required.\n'
                  '  --company your-company-id --device cam1\n'
                  '  or set COMPANY_ID and DEVICE_ID environment variables')
        sys.exit(1)

    video_path = args.video
    if not os.path.exists(video_path):
        log.error('Video file not found: %s', video_path)
        sys.exit(1)

    init_firebase()

    # Duplicate check
    file_size = os.path.getsize(video_path)
    fhash     = file_hash(video_path, file_size)
    previous  = check_already_processed(fhash)

    if previous and not args.force:
        prev_date = datetime.fromtimestamp(previous['processedAt'] / 1000).strftime('%B %d, %Y at %H:%M')
        log.warning('⚠️  "%s" has already been processed (%s).', Path(video_path).name, prev_date)
        log.warning('   Previous run found %d crossings.', previous.get('vehicleCount', 0))
        answer = input('   Process again and overwrite? (y/n): ').strip().lower()
        if answer != 'y':
            log.info('Cancelled.')
            sys.exit(0)

    log.info('Company : %s', COMPANY_ID)
    log.info('Device  : %s', DEVICE_ID)

    process_video(video_path)

    # Mark as processed
    mark_processed(fhash, Path(video_path).name, file_size, 0)
    log.info('✓ Marked as processed in Firebase.')


if __name__ == '__main__':
    main()
