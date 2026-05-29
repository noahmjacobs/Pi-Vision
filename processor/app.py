#!/usr/bin/env python3
"""
PiVision Desktop Processor
----------------------------
Purpose: A standalone desktop GUI for processing recorded video files offline.
The user signs in with their PiVision account, picks a video file, configures
the counting line or seatbelt options, and hits Process. Results are written
directly to Firebase and appear live in the PiVision web dashboard.

Three modes (set per-company in Firebase under companies/{id}/mode):
  people_counter — counts persons crossing a line (e.g. store entrance, hallway)
  car_counter    — counts vehicles crossing a line (e.g. road, parking lot entry)
  seatbelt       — analyzes front-seat seatbelt compliance (no counting line)

people_counter and car_counter share the same pipeline (run_processing) and
the same counting-line UI. Differences:
  - people_counter detects COCO class 0 (person)
  - car_counter detects COCO classes 2/5/7 (car/bus/truck), uses iou=0.3 so
    side-by-side vehicles are kept as separate detections

Both use ByteTrack (built into ultralytics) for tracking across frames.
ByteTrack assigns stable IDs that survive occlusions — if two cars overlap
briefly, each keeps its own ID and both get counted correctly.

Lane boundary sliders let the user restrict the counting line to a portion of
the frame width (or height for left/right), so only one lane is counted.

seatbelt uses a completely separate pipeline in process_seatbelt.py.

--- DEV TESTING ---
Run directly from Python — no need to build a .dmg for every code change:
  python3 /path/to/processor/app.py
Only build a new .dmg when shipping to real users.
"""

from __future__ import annotations

import json
import os
import queue
import hashlib
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import cv2
import requests
import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import Image, ImageDraw, ImageFilter, ImageTk
import customtkinter as ctk
from ultralytics import YOLO

# ── Appearance ──────────────────────────────────────────────────────────────────────────────
ctk.set_default_color_theme('blue')
ctk.set_appearance_mode('dark')

BG      = '#071226'
BG2     = '#16244a'
BG3     = '#38507b'
HOVER   = '#4b67a0'
TEXT    = '#f8fafc'
DIM     = '#c3cce1'
PANEL   = '#1c2c55'
FIELD   = '#2b3d6b'
BORDER  = '#586b98'
CANVAS_BG = '#253a63'

BG_DARK = '#071226'   # video canvas + log — always dark regardless of theme
ACCENT  = '#4f9cff'
AMBER   = '#f59e0b'
GREEN   = '#34c759'
SUCCESS = '#34c759'
DANGER  = '#ff5f57'

PREVIEW_W = 640
PREVIEW_H = 360


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip('#')
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


def _blend(c1: str, c2: str, amount: float) -> str:
    a = _hex_to_rgb(c1)
    b = _hex_to_rgb(c2)
    mixed = tuple(int(a[i] * (1 - amount) + b[i] * amount) for i in range(3))
    return '#%02x%02x%02x' % mixed


def _make_dropzone_bg(width: int, height: int) -> Image.Image:
    matte = _hex_to_rgb(_blend(BG2, '#ffffff', 0.035))
    base = Image.new('RGB', (width, height), matte)
    gradient = Image.new('RGB', (width, height), _hex_to_rgb(CANVAS_BG))
    px = gradient.load()
    left = _hex_to_rgb('#2b5f9c')
    right = _hex_to_rgb('#6b4e8d')
    bottom = _hex_to_rgb('#1c345d')
    for y in range(height):
        vt = y / max(height - 1, 1)
        for x in range(width):
            ht = x / max(width - 1, 1)
            mid = tuple(int(left[i] * (1 - ht) + right[i] * ht) for i in range(3))
            px[x, y] = tuple(int(mid[i] * (1 - vt * 0.45) + bottom[i] * (vt * 0.45)) for i in range(3))

    glow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow, 'RGBA')
    draw.ellipse((width * 0.50, -height * 0.16, width * 1.18, height * 0.88), fill=(255, 132, 190, 70))
    draw.ellipse((-width * 0.22, -height * 0.10, width * 0.44, height * 0.86), fill=(41, 166, 255, 78))
    draw.ellipse((width * 0.30, height * 0.42, width * 0.86, height * 1.14), fill=(79, 156, 255, 34))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=50))
    rounded = Image.alpha_composite(gradient.convert('RGBA'), glow).convert('RGB')
    mask = Image.new('L', (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=18, fill=255)
    base.paste(rounded, (0, 0), mask)
    return base


# ── Firebase config ─────────────────────────────────────────────────────────────────────────
FIREBASE_API_KEY = 'AIzaSyAv8s0vErAwc3KZaRF55isbKTzhgjuwGNE'
FIREBASE_DB_URL  = 'https://pivision-28ddb-default-rtdb.firebaseio.com'


# ── Session file path ────────────────────────────────────────────────────────────────────────
# Mac: stored inside the .app bundle so auto-update can carry it over.
# Windows / dev: ~/.pivision_session.json (survives .exe replacement naturally).
def _session_path() -> Path:
    if getattr(sys, 'frozen', False):
        exe = Path(sys.executable)
        if exe.parts[-2] == 'MacOS' and exe.parts[-3] == 'Contents':
            resources = exe.parent.parent / 'Resources'
            resources.mkdir(parents=True, exist_ok=True)
            return resources / 'session.json'
    return Path.home() / '.pivision_session.json'

SESSION_FILE = _session_path()


# ── YOLO model path ───────────────────────────────────────────────────────────────────────────
MODEL_OPTIONS = {
    'Nano': 'yolov8n.pt',
    'Small': 'yolov8s.pt',
    'Medium': 'yolov8m.pt',
    'Large': 'yolov8l.pt',
}


def _yolo_model_path(model_label: str = 'Small') -> str:
    filename = MODEL_OPTIONS.get(model_label, MODEL_OPTIONS['Small'])
    if getattr(sys, 'frozen', False):
        bundled = Path(sys._MEIPASS) / filename
        if bundled.exists():
            return str(bundled)
    # When running from source, find the model next to app.py regardless of CWD
    local = Path(__file__).parent / filename
    if local.exists():
        return str(local)
    return filename


# ── Logo path ─────────────────────────────────────────────────────────────────────────────────
def _logo_path() -> str | None:
    if getattr(sys, 'frozen', False):
        bundled = Path(sys._MEIPASS) / 'logo.png'
        if bundled.exists():
            return str(bundled)
    local = Path(__file__).parent / 'logo.png'
    if local.exists():
        return str(local)
    return None

LOGO_PATH = _logo_path()


def _logo_holo_path() -> str | None:
    if getattr(sys, 'frozen', False):
        bundled = Path(sys._MEIPASS) / 'logo_holo.png'
        if bundled.exists():
            return str(bundled)
    local = Path(__file__).parent / 'logo_holo.png'
    if local.exists():
        return str(local)
    return None


LOGO_HOLO_PATH = _logo_holo_path()


def _tracker_config_path() -> str:
    """Find bytetrack.yaml — bundled copy next to app.py is the most reliable source."""
    if getattr(sys, 'frozen', False):
        bundled = Path(sys._MEIPASS) / 'bytetrack.yaml'
        if bundled.exists():
            return str(bundled)
    # When running from source, use the copy in the processor/ folder next to app.py
    local = Path(__file__).parent / 'bytetrack.yaml'
    if local.exists():
        return str(local)
    return 'bytetrack.yaml'

TRACKER_CONFIG = _tracker_config_path()
YOLO_CONF  = 0.45
DEFAULT_MODEL = 'Small'
DEFAULT_FRAME_SKIP = 2


# ── Version ───────────────────────────────────────────────────────────────────────────────────
# Bump before every release. Must match the GitHub Release tag (minus the 'v').
APP_VERSION  = '1.0.25'
GITHUB_REPO  = 'noahmjacobs/pi-vision'


# ── Firebase REST helpers ─────────────────────────────────────────────────────────────────────────

def fb_sign_in(email: str, password: str) -> dict:
    url = f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}'
    r = requests.post(url, json={'email': email, 'password': password, 'returnSecureToken': True}, timeout=10)
    if r.status_code == 400:
        raise ValueError('Invalid email or password.')
    r.raise_for_status()
    return r.json()


def fb_refresh(refresh_token: str) -> dict:
    url = f'https://securetoken.googleapis.com/v1/token?key={FIREBASE_API_KEY}'
    r = requests.post(url, json={'grant_type': 'refresh_token', 'refresh_token': refresh_token}, timeout=10)
    r.raise_for_status()
    d = r.json()
    return {'idToken': d['id_token'], 'refreshToken': d['refresh_token']}


def fb_get(path: str, token: str):
    r = requests.get(f'{FIREBASE_DB_URL}/{path}.json?auth={token}', timeout=10)
    r.raise_for_status()
    return r.json()


def fb_put(path: str, data, token: str) -> None:
    r = requests.put(f'{FIREBASE_DB_URL}/{path}.json?auth={token}', json=data, timeout=10)
    r.raise_for_status()


def fb_patch(path: str, data: dict, token: str) -> None:
    r = requests.patch(f'{FIREBASE_DB_URL}/{path}.json?auth={token}', json=data, timeout=10)
    r.raise_for_status()


# ── Session persistence ──────────────────────────────────────────────────────────────────────────

def load_session() -> dict | None:
    try:
        if SESSION_FILE.exists():
            return json.loads(SESSION_FILE.read_text())
    except Exception:
        pass
    return None


def save_session(data: dict) -> None:
    SESSION_FILE.write_text(json.dumps(data))


def clear_session() -> None:
    SESSION_FILE.unlink(missing_ok=True)


# ── Auto-update: version check ─────────────────────────────────────────────────────────────────────

def fetch_latest_version() -> str | None:
    """Return the latest GitHub release tag (without 'v'), or None on failure."""
    try:
        r = requests.get(
            f'https://api.github.com/repos/{GITHUB_REPO}/releases/latest',
            headers={'Accept': 'application/vnd.github+json'},
            timeout=5,
        )
        if r.status_code == 200:
            tag = r.json().get('tag_name', '')
            return tag.lstrip('v')
    except Exception:
        pass
    return None


# ── Centroid tracker (kept for reference — active pipeline uses ByteTrack) ────────────────────────
# Original lightweight tracker: nearest-centroid matching across frames.
# Replaced by ByteTrack in run_processing because ByteTrack handles occlusions
# (two overlapping cars) far better via Kalman-filter motion prediction.

class CentroidTracker:
    def __init__(self, max_disappeared: int = 30, max_distance: int = 80) -> None:
        self.next_id = 0
        self.centroids: dict[int, tuple] = {}
        self.disappeared: dict[int, int] = {}
        self.sides: dict[int, str] = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def update(self, new_centroids: list) -> dict:
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
            ids = list(self.centroids)
            existing = [self.centroids[i] for i in ids]
            used_ex: set[int] = set()
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

    def check_crossings(self, line_pos: int, axis: str = 'y', direction: str = 'down',
                        x_range: tuple | None = None) -> int:
        count = 0
        for oid, (cx, cy) in self.centroids.items():
            pos  = cy if axis == 'y' else cx
            side = 'before' if pos < line_pos else 'after'
            prev = self.sides.get(oid)
            if prev is not None and prev != side:
                # If a lane boundary is set, only count cars whose centroid is inside it.
                if x_range is not None:
                    lateral = cx if axis == 'y' else cy
                    if not (x_range[0] <= lateral <= x_range[1]):
                        self.sides[oid] = side
                        continue
                if direction == 'both':
                    count += 1
                elif direction in ('down', 'right') and prev == 'before':
                    count += 1
                elif direction in ('up', 'left') and prev == 'after':
                    count += 1
            self.sides[oid] = side
        return count

    def _register(self, c: tuple) -> None:
        self.centroids[self.next_id] = c
        self.disappeared[self.next_id] = 0
        self.next_id += 1

    def _deregister(self, oid: int) -> None:
        del self.centroids[oid]
        del self.disappeared[oid]
        self.sides.pop(oid, None)


# ── Processing pipeline (background thread) ───────────────────────────────────────────────────
# Shared by people_counter and car_counter.
# Goal: open the video, run YOLO on every Nth frame, track centroids, count
# line crossings, then batch-write events + daily counts + stats to Firebase.

def file_hash(path: str, size: int) -> str:
    """Cheap content fingerprint used for duplicate detection (filename + size)."""
    return hashlib.md5(f'{Path(path).name}:{size}'.encode()).hexdigest()[:16]


def run_processing(
    video_path, company_id, device_id, line_pos, direction,
    token, progress_cb, log_cb, done_cb,
    mode: str = 'people_counter',
    line_x_start: float = 0.0, line_x_end: float = 1.0,
    video_start_ts: float | None = None,
    yolo_model_label: str = DEFAULT_MODEL,
    yolo_skip: int = DEFAULT_FRAME_SKIP,
    frame_cb=None,
    cancel_event=None,
):
    """
    Core counting pipeline shared by people_counter and car_counter.

    mode='people_counter'  → detect COCO class 0 (person)
    mode='car_counter'     → detect COCO classes 2/5/7 (car/bus/truck), iou=0.3

    line_pos              → fraction (0-1) of frame height/width for the counting line
    direction             → 'down'|'up'|'left'|'right' — only crossings in this direction count
    line_x_start/end      → fraction (0-1) lane boundary — centroids outside this range are ignored
    video_start_ts        → Unix timestamp of the video recording start (from user input or file mtime)
    yolo_model_label      → Nano|Small|Medium|Large model selector
    yolo_skip             → run detection every Nth frame
    """
    try:
        cap    = cv2.VideoCapture(video_path)
        total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps    = cap.get(cv2.CAP_PROP_FPS) or 30
        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        log_cb(f'Video: {Path(video_path).name}')
        log_cb(f'  {width}x{height}  {fps:.0f}fps  {total} frames')
        yolo_skip = max(1, int(yolo_skip))
        yolo_model_path = _yolo_model_path(yolo_model_label)
        log_cb(f'Loading YOLO {yolo_model_label.lower()} model...')
        log_cb(f'Frame skip: every {yolo_skip} frame{"s" if yolo_skip != 1 else ""}')

        is_car_counter = mode == 'car_counter'
        yolo_classes   = [2, 5, 7] if is_car_counter else [0]
        unit_label     = 'Vehicle' if is_car_counter else 'Person'
        count_label    = 'vehicle' if is_car_counter else 'person'

        model       = YOLO(yolo_model_path)
        axis        = 'x' if direction in ('left', 'right') else 'y'
        line        = int((width if axis == 'x' else height) * line_pos)
        x_range     = (int(width * line_x_start), int(width * line_x_end)) if (line_x_start > 0.01 or line_x_end < 0.99) else None
        track_sides: dict[int, str] = {}  # ByteTrack ID → which side of the line it was on last

        # Base timestamp: use manually entered date/time if provided, else fall back to file mtime
        file_mtime = os.path.getmtime(video_path)
        base_ts    = video_start_ts if video_start_ts is not None else file_mtime

        log_cb('Processing frames...')

        upload_id  = uuid.uuid4().hex[:12]
        count      = 0
        last_event = ''
        pending: list = []
        daily: dict   = {}
        frame_num     = 0
        preview_interval = max(1, total // 360) if total > 0 else 30

        while True:
            if cancel_event is not None and cancel_event.is_set():
                log_cb('Cancelled by user.')
                cap.release()
                done_cb(False, count, cancelled=True)
                return
            ret, frame = cap.read()
            if not ret:
                break
            frame_num += 1
            progress_cb(frame_num / max(total, 1), count)

            # Keep the preview moving with the progress bar without flooding the UI thread.
            if frame_cb and (frame_num == 1 or frame_num % preview_interval == 0):
                try:
                    frame_cb(frame.copy())
                except Exception:
                    pass

            if frame_num % yolo_skip != 0:
                continue

            results = model.track(frame, classes=yolo_classes, conf=YOLO_CONF,
                                  verbose=False, persist=True, tracker=TRACKER_CONFIG,
                                  iou=0.3)
            boxes     = results[0].boxes
            crossings = 0
            if boxes is not None and boxes.id is not None:
                for i, track_id in enumerate(boxes.id.int().tolist()):
                    box  = boxes.xyxy[i]
                    cx   = int((float(box[0]) + float(box[2])) / 2)
                    cy   = int((float(box[1]) + float(box[3])) / 2)
                    pos  = cy if axis == 'y' else cx
                    side = 'before' if pos < line else 'after'
                    prev = track_sides.get(track_id)
                    if prev is not None and prev != side:
                        if x_range is not None:
                            lateral = cx if axis == 'y' else cy
                            if not (x_range[0] <= lateral <= x_range[1]):
                                track_sides[track_id] = side
                                continue
                        if direction == 'both':
                            crossings += 1
                        elif direction in ('down', 'right') and prev == 'before':
                            crossings += 1
                        elif direction in ('up', 'left') and prev == 'after':
                            crossings += 1
                    track_sides[track_id] = side

            if crossings > 0:
                count += crossings
                # frame_dt = when this crossing happened in real time
                # base_ts is when the video recording started (manual input or file mtime)
                frame_dt = base_ts + frame_num / fps
                ts_ms    = int(frame_dt * 1000)
                date_key = datetime.fromtimestamp(frame_dt).strftime('%Y-%m-%d')
                ts_label = datetime.fromtimestamp(frame_dt).strftime('%H:%M')
                event_id = uuid.uuid4().hex[:8]
                pending.append((
                    event_id, ts_ms,
                    f'{unit_label} counted',
                    f'Crossed line · {ts_label} (from video)',
                ))
                daily[date_key] = daily.get(date_key, 0) + crossings
                last_event = f'{unit_label} · {ts_label}'

        cap.release()

        log_cb(f'Complete — {count} crossings detected')
        log_cb(f'Writing {len(pending)} events to Firebase...')

        base = f'companies/{company_id}/devices/{device_id}'
        for event_id, ts_ms, label, sublabel in pending:
            fb_put(f'{base}/events/{event_id}', {
                'id': event_id, 'timestamp': ts_ms,
                'type': count_label, 'label': label, 'sublabel': sublabel,
                'uploadId': upload_id,
            }, token)

        for date_key, daily_count in daily.items():
            path    = f'{base}/counts/{date_key}/total'
            current = fb_get(path, token) or 0
            fb_put(path, current + daily_count, token)
            log_cb(f'  {date_key}: {daily_count} crossings')

        fb_patch(f'{base}/stats', {'peopleCount': count, 'lastEvent': last_event}, token)

        fb_put(f'{base}/uploads/{upload_id}', {
            'filename':    Path(video_path).name,
            'processedAt': int(time.time() * 1000),
            'videoDate':   int(base_ts * 1000),
            'vehicleCount': count,
            'direction':   direction,
            'location':    device_id,
        }, token)

        size  = os.path.getsize(video_path)
        fhash = file_hash(video_path, size)
        fb_put(f'companies/{company_id}/processed/{fhash}', {
            'filename':     Path(video_path).name,
            'size':         size,
            'location':     device_id,
            'processedAt':  int(time.time() * 1000),
            'vehicleCount': count,
        }, token)

        log_cb('Results are live in PiVision Analytics!')
        done_cb(True, count)

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log_cb(f'Error: {e}')
        log_cb('(See PiVision_error.log on your Desktop for full details)')
        # Write full traceback to ~/Desktop/PiVision_error.log so it's readable
        # even in the bundled .app where there's no terminal output.
        try:
            log_path = Path.home() / 'Desktop' / 'PiVision_error.log'
            log_path.write_text(
                f'PiVision v{APP_VERSION} — processing error\n'
                f'Video: {video_path}\n\n'
                f'{tb}\n'
            )
        except Exception:
            pass
        done_cb(False, 0)


# ── GUI Application ────────────────────────────────────────────────────────────────────────────────

class App(ctk.CTk):
    def __init__(self) -> None:
        super().__init__()
        self.title('PiVision Processor')

        self.configure(fg_color=BG)

        self.session: dict | None = None
        self.video_path: str | None = None
        self._preview_frame = None
        self._tk_img = None
        self._dropzone_img = None
        self._header_logo_img = None
        self._calendar_frame = None
        self._calendar_widget = None
        self._calendar_visible = False
        self._work_frame = None
        self.line_pos    = 0.5
        self.line_x_start = 0.0   # left edge of counting line (fraction 0-1)
        self.line_x_end   = 1.0   # right edge of counting line (fraction 0-1)
        self.direction = 'down'
        self._vehicle_dir = 'towards'
        self._processing = False
        self._cancel_event: threading.Event | None = None
        self._clear_video_btn: ctk.CTkButton | None = None
        self._log_queue:   queue.Queue = queue.Queue()
        self._frame_queue: queue.Queue = queue.Queue(maxsize=2)
        self._px = self._py = 0
        self._pw = PREVIEW_W
        self._ph = PREVIEW_H
        self._date_var: ctk.StringVar | None = None
        self._hour_var: ctk.StringVar | None = None
        self._min_var:  ctk.StringVar | None = None
        self._model_var: ctk.StringVar | None = None
        self._skip_var:  ctk.StringVar | None = None

        saved = load_session()
        if saved and saved.get('refreshToken'):
            self._try_restore_session(saved)
        else:
            self._show_signin()

        self._poll_logs()
        if '--just-updated' not in sys.argv:
            self.after(3000, self._check_for_update)


    # ── Auto-update ──────────────────────────────────────────────────────────────────────────
    # The download URL always points to /releases/latest/download/ so the user
    # jumps straight to the current release regardless of how many versions
    # they've skipped — no incremental stepping through intermediate versions.

    def _check_for_update(self) -> None:
        def worker():
            latest = fetch_latest_version()
            if latest and latest != APP_VERSION:
                self.after(0, lambda: self._show_update_dialog(latest))
        threading.Thread(target=worker, daemon=True).start()

    def _show_update_dialog(self, latest: str) -> None:
        dialog = ctk.CTkToplevel(self)
        dialog.title('Update Available')
        dialog.geometry('400x220')
        dialog.resizable(False, False)
        dialog.configure(fg_color=BG2)
        dialog.grab_set()
        dialog.lift()

        ctk.CTkLabel(dialog, text='Update Available', font=('Helvetica', 17, 'bold'),
                     text_color=TEXT).pack(pady=(28, 4))
        status_label = ctk.CTkLabel(
            dialog,
            text=f'PiVision Processor v{latest} is available.\nYou have v{APP_VERSION}.',
            font=('Helvetica', 13), text_color=DIM, justify='center',
        )
        status_label.pack(pady=(0, 14))

        progress_bar = ctk.CTkProgressBar(dialog, width=320)
        progress_bar.set(0)

        btn_row = ctk.CTkFrame(dialog, fg_color='transparent')
        btn_row.pack()

        ctk.CTkButton(
            btn_row, text='Update Now', fg_color=ACCENT,
            command=lambda: self._start_auto_update(
                dialog, status_label, progress_bar, btn_row
            ),
            width=150,
        ).pack(side='left', padx=6)
        ctk.CTkButton(btn_row, text='Not Now', fg_color=BG3, hover_color=HOVER,
                      text_color=DIM, command=dialog.destroy, width=100).pack(side='left', padx=6)

    def _start_auto_update(self, dialog, status_label, progress_bar, btn_row) -> None:
        for w in btn_row.winfo_children():
            w.destroy()
        progress_bar.pack(pady=(0, 16))

        def worker():
            try:
                is_win = sys.platform == 'win32'
                asset_url = (
                    f'https://github.com/{GITHUB_REPO}/releases/latest/download/PiVision-windows.exe'
                    if is_win else
                    f'https://github.com/{GITHUB_REPO}/releases/latest/download/PiVision-mac.dmg'
                )

                self.after(0, lambda: status_label.configure(text='Downloading…'))

                r     = requests.get(asset_url, stream=True, timeout=120)
                total = int(r.headers.get('content-length', 0))
                done  = 0
                suffix    = '.exe' if is_win else '.dmg'
                tmp_asset = Path(tempfile.gettempdir()) / f'PiVision-update{suffix}'

                with open(tmp_asset, 'wb') as f:
                    for chunk in r.iter_content(8192):
                        f.write(chunk)
                        done += len(chunk)
                        if total:
                            p = done / total
                            self.after(0, lambda v=p: progress_bar.set(v))

                self.after(0, lambda: status_label.configure(text='Installing…'))

                if is_win:
                    self._install_windows(tmp_asset)
                else:
                    self._install_mac(tmp_asset)

            except Exception as e:
                err = str(e)
                self.after(0, lambda: status_label.configure(text=f'Update failed: {err}'))

        threading.Thread(target=worker, daemon=True).start()

    def _install_windows(self, new_exe: Path) -> None:
        """Replace the running .exe then relaunch via a background batch script."""
        current_exe = Path(sys.executable) if getattr(sys, 'frozen', False) else new_exe
        bat = Path(tempfile.gettempdir()) / 'pivision_update.bat'
        bat.write_text(
            '@echo off\n'
            'timeout /t 2 /nobreak > nul\n'
            f'move /y "{new_exe}" "{current_exe}"\n'
            'timeout /t 1 /nobreak > nul\n'
            f'start "" "{current_exe}" --just-updated\n'
        )
        subprocess.Popen(
            ['cmd', '/c', str(bat)],
            start_new_session=True,
            creationflags=0x08000000,  # CREATE_NO_WINDOW
        )
        self.after(500, self.quit)

    def _install_mac(self, dmg_path: Path) -> None:
        """Mount DMG, ditto .app, carry session into new bundle, relaunch."""
        exe = Path(sys.executable)
        if exe.parts[-2] == 'MacOS' and exe.parts[-3] == 'Contents':
            app_path = exe.parent.parent.parent
        else:
            app_path = Path('/Applications/PiVision.app')
        install_dir = app_path.parent

        with tempfile.TemporaryDirectory() as tmp:
            mnt_point = Path(tmp) / 'mnt'
            mnt_point.mkdir()

            subprocess.run(
                ['hdiutil', 'attach', str(dmg_path), '-nobrowse',
                 '-mountpoint', str(mnt_point)],
                check=True, capture_output=True,
            )
            apps = list(mnt_point.glob('*.app'))
            if not apps:
                raise RuntimeError('No .app found in DMG')
            src_app = apps[0]
            dst_app = install_dir / 'PiVision.app'

            old_session  = app_path / 'Contents' / 'Resources' / 'session.json'
            session_data = old_session.read_text() if old_session.exists() else None

            subprocess.run(['ditto', str(src_app), str(dst_app)],
                           check=True, capture_output=True)
            subprocess.run(['xattr', '-cr', str(dst_app)], capture_output=True)

            if session_data:
                new_session = dst_app / 'Contents' / 'Resources' / 'session.json'
                new_session.parent.mkdir(parents=True, exist_ok=True)
                new_session.write_text(session_data)

            subprocess.run(['hdiutil', 'detach', str(mnt_point)], capture_output=True)

        self._relaunch_mac(dst_app)

    def _relaunch_mac(self, app_path: Path) -> None:
        subprocess.Popen(
            ['bash', '-c', f'sleep 1.5 && open "{app_path}" --args --just-updated'],
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.quit()


    # ── Session restore ───────────────────────────────────────────────────────────────────────────

    def _try_restore_session(self, saved: dict) -> None:
        self._show_loading()

        def attempt():
            try:
                tokens = fb_refresh(saved['refreshToken'])
                saved['token'] = tokens['idToken']
                saved['refreshToken'] = tokens['refreshToken']
                save_session(saved)
                self.session = saved
                self.after(0, self._show_main)
            except Exception:
                clear_session()
                self.after(0, self._show_signin)

        threading.Thread(target=attempt, daemon=True).start()

    # ── Screen helpers ────────────────────────────────────────────────────────────────────────────

    def _clear(self) -> None:
        for w in self.winfo_children():
            w.destroy()

    def _show_loading(self) -> None:
        self._clear()
        self.geometry('420x160')
        self.resizable(False, False)
        f = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        f.pack(fill='both', expand=True)
        if LOGO_PATH:
            _raw = Image.open(LOGO_PATH).convert('RGBA')
            _logo_ctk = ctk.CTkImage(light_image=_raw, dark_image=_raw, size=(52, 52))
            ctk.CTkLabel(f, image=_logo_ctk, text='').pack(pady=(30, 0))
            ctk.CTkLabel(f, text='PiVision', font=('Helvetica', 18, 'bold'),
                         text_color=TEXT).pack(pady=(8, 4))
        else:
            ctk.CTkLabel(f, text='PiVision', font=('Helvetica', 22, 'bold'),
                         text_color=TEXT).pack(pady=(40, 6))
        ctk.CTkLabel(f, text='Signing in…', font=('Helvetica', 12),
                     text_color=DIM).pack()

    # ── Sign-in screen ───────────────────────────────────────────────────────────────────────────

    def _show_signin(self) -> None:
        self._clear()
        self.geometry('440x530')
        self.resizable(False, False)
        self.configure(fg_color=BG)

        # ── Top title area ─────────────────────────────────────────────────
        top = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        top.pack(fill='x', pady=(44, 0))

        # Logo image (or fallback dot if file missing)
        if LOGO_PATH:
            _raw = Image.open(LOGO_PATH).convert('RGBA')
            _logo_ctk = ctk.CTkImage(light_image=_raw, dark_image=_raw, size=(64, 64))
            ctk.CTkLabel(top, image=_logo_ctk, text='').pack()
        else:
            logo_frame = ctk.CTkFrame(top, fg_color=BG2, corner_radius=14,
                                       width=52, height=52)
            logo_frame.pack()
            logo_frame.pack_propagate(False)
            ctk.CTkLabel(logo_frame, text='●', font=('Helvetica', 20),
                         text_color=ACCENT).place(relx=0.5, rely=0.5, anchor='center')

        ctk.CTkLabel(top, text='PiVision', font=('Helvetica', 22, 'bold'),
                     text_color=TEXT).pack(pady=(12, 2))
        ctk.CTkLabel(top, text='Sign in to your account', font=('Helvetica', 12),
                     text_color=DIM).pack()

        # ── Card ───────────────────────────────────────────────────────────
        card  = ctk.CTkFrame(
            self, fg_color=_blend(PANEL, '#ffffff', 0.035),
            corner_radius=16, border_width=1, border_color=BORDER,
        )
        card.pack(fill='x', padx=28, pady=20)
        inner = ctk.CTkFrame(card, fg_color='transparent', corner_radius=0)
        inner.pack(fill='x', padx=26, pady=24)

        ctk.CTkLabel(inner, text='EMAIL', font=('Helvetica', 10, 'bold'),
                     text_color=DIM).pack(anchor='w')
        self._email_var   = ctk.StringVar()
        self._email_entry = ctk.CTkEntry(
            inner, textvariable=self._email_var, font=('Helvetica', 13),
            fg_color=_blend(FIELD, '#ffffff', 0.04), text_color=TEXT, border_color=BORDER,
            border_width=1, height=42, placeholder_text='you@company.com',
            placeholder_text_color=DIM,
        )
        self._email_entry.pack(fill='x', pady=(5, 14))

        ctk.CTkLabel(inner, text='PASSWORD', font=('Helvetica', 10, 'bold'),
                     text_color=DIM).pack(anchor='w')
        self._pw_var = ctk.StringVar()
        pw = ctk.CTkEntry(
            inner, textvariable=self._pw_var, font=('Helvetica', 13),
            fg_color=_blend(FIELD, '#ffffff', 0.04), text_color=TEXT, border_color=BORDER,
            border_width=1, height=42, show='•',
        )
        pw.pack(fill='x', pady=(5, 18))
        pw.bind('<Return>', lambda _: self._do_signin())

        self._signin_err = ctk.CTkLabel(inner, text='', font=('Helvetica', 11),
                                         text_color=DANGER, wraplength=320)
        self._signin_err.pack(fill='x', pady=(0, 8))

        self._signin_btn = ctk.CTkButton(
            inner, text='Sign In', font=('Helvetica', 13, 'bold'),
            fg_color='#3f98ff', hover_color='#5ab7ff', text_color='white',
            height=46, corner_radius=10, border_width=1, border_color='#7cc8ff',
            command=self._do_signin,
        )
        self._signin_btn.pack(fill='x')

        self._email_entry.focus_set()

    def _do_signin(self) -> None:
        email    = self._email_var.get().strip()
        password = self._pw_var.get()
        if not email or not password:
            self._signin_err.configure(text='Enter your email and password.')
            return

        self._signin_btn.configure(text='Signing in...', state='disabled')
        self._signin_err.configure(text='')

        def attempt():
            try:
                auth  = fb_sign_in(email, password)
                token = auth['idToken']
                uid   = auth['localId']

                user_data = fb_get(f'users/{uid}', token)
                if not user_data:
                    raise ValueError('Account not set up yet. Contact your admin.')

                company_id   = user_data.get('companyId') or user_data.get('company', '')
                company_data = fb_get(f'companies/{company_id}', token) or {}
                devices      = list((company_data.get('devices') or {}).keys())
                mode         = company_data.get('mode', 'people_counter')

                session = {
                    'token':        token,
                    'refreshToken': auth.get('refreshToken', ''),
                    'uid':          uid,
                    'email':        email,
                    'companyId':    company_id,
                    'companyName':  company_data.get('name', company_id),
                    'devices':      devices,
                    'mode':         mode,
                }
                save_session(session)
                self.session = session
                self.after(0, self._show_main)

            except Exception as e:
                import traceback
                traceback.print_exc()
                raw = str(e)
                if '401' in raw or '403' in raw or 'Permission' in raw:
                    err_msg = 'Access denied. Your account may not have permission.'
                elif 'Invalid email or password' in raw:
                    err_msg = 'Invalid email or password.'
                elif 'not set up' in raw or 'not found' in raw:
                    err_msg = raw
                elif 'timeout' in raw.lower() or 'connect' in raw.lower():
                    err_msg = 'Connection failed. Check your internet and try again.'
                else:
                    err_msg = 'Sign-in failed. See terminal for details.'
                def reset():
                    self._signin_btn.configure(text='Sign In', state='normal')
                    self._signin_err.configure(text=err_msg)
                self.after(0, reset)

        threading.Thread(target=attempt, daemon=True).start()


    # ── Main screen ─────────────────────────────────────────────────────────────────────────────────

    def _show_main(self) -> None:
        self._clear()
        self.geometry('980x860')
        self.resizable(True, True)
        self.configure(fg_color=BG)
        s    = self.session
        mode = s.get('mode', 'people_counter')

        is_seatbelt    = mode == 'seatbelt'
        is_car_counter = mode == 'car_counter'

        if is_seatbelt:
            mode_label = 'Seatbelt Compliance'
        elif is_car_counter:
            mode_label = 'Car Counter'
        else:
            mode_label = 'People Counter'

        hdr = ctk.CTkFrame(self, fg_color=_blend(BG2, '#ffffff', 0.05), corner_radius=0, height=70)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        if LOGO_HOLO_PATH:
            try:
                _logo_raw = Image.open(LOGO_HOLO_PATH).convert('RGBA')
                _logo_ctk = ctk.CTkImage(light_image=_logo_raw, dark_image=_logo_raw, size=(34, 34))
                ctk.CTkLabel(hdr, image=_logo_ctk, text='').pack(side='left', padx=(28, 8))
                self._header_logo_img = _logo_ctk
            except Exception:
                pass
        ctk.CTkLabel(hdr, text='PiVision', font=('Helvetica', 19, 'bold'),
                     text_color=TEXT).pack(side='left', padx=(0 if LOGO_HOLO_PATH else 34, 12))
        ctk.CTkButton(hdr, text='Sign Out', font=('Helvetica', 12),
                      fg_color=_blend(FIELD, '#ffffff', 0.04), hover_color=HOVER, text_color=TEXT, width=92, height=34,
                      corner_radius=10, border_width=1, border_color=BORDER,
                      command=self._sign_out).pack(side='right', padx=(10, 24))
        ctk.CTkLabel(hdr, text=f'{s["companyName"]}  ·  {s["email"]}',
                     font=('Helvetica', 11), text_color=DIM).pack(side='right', padx=(0, 16))
        ctk.CTkLabel(hdr, text=mode_label, font=('Helvetica', 11),
                     text_color=DIM).pack(side='right', padx=(0, 14))

        self.minsize(860, 760)

        shell = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        shell.pack(fill='both', expand=True, padx=10, pady=(10, 12))

        panel = ctk.CTkFrame(
            shell, fg_color=_blend(PANEL, '#ffffff', 0.04), corner_radius=14,
            border_width=1, border_color=BORDER, bg_color=BG,
        )
        panel.pack(fill='both', expand=True)

        # ── Metadata row ──────────────────────────────────────────────────
        meta_row = ctk.CTkFrame(panel, fg_color='transparent', corner_radius=0)
        meta_row.pack(fill='x', padx=24, pady=(20, 14))
        ctk.CTkLabel(meta_row, text='Location:', font=('Helvetica', 12),
                     text_color=TEXT).pack(side='left')
        self._loc_var = ctk.StringVar()
        self._loc_entry = ctk.CTkComboBox(
            meta_row, variable=self._loc_var,
            values=list(s.get('devices', [])) or [''],
            fg_color=_blend(FIELD, '#ffffff', 0.04), border_color=BORDER, border_width=1,
            button_color=_blend(FIELD, '#ffffff', 0.04), button_hover_color=HOVER,
            dropdown_fg_color=BG2, dropdown_text_color=TEXT,
            dropdown_hover_color=HOVER, text_color=TEXT,
            width=300, height=36, corner_radius=8, font=('Helvetica', 11),
            dropdown_font=('Helvetica', 11),
        )
        self._loc_entry.pack(side='left', padx=(12, 22))

        ctk.CTkLabel(meta_row, text='Date:', font=('Helvetica', 12),
                     text_color=TEXT).pack(side='left')
        self._date_var = ctk.StringVar()
        _date_entry = ctk.CTkEntry(
            meta_row, textvariable=self._date_var, font=('Helvetica', 11),
            fg_color=_blend(FIELD, '#ffffff', 0.04), text_color=TEXT, border_color=BORDER, border_width=1,
            placeholder_text='Select date', placeholder_text_color=DIM,
            width=132, height=36, corner_radius=8,
        )
        _date_entry.pack(side='left', padx=(12, 0))
        _cal_btn = ctk.CTkButton(
            meta_row, text='Cal', width=48, height=36, corner_radius=8,
            fg_color=_blend(FIELD, '#ffffff', 0.04), hover_color=HOVER, text_color=TEXT,
            border_color=BORDER, border_width=1, font=('Helvetica', 11),
            command=self._toggle_calendar,
        )
        _cal_btn.pack(side='left', padx=(0, 8))

        self._hour_var = ctk.StringVar(value='00')
        self._min_var  = ctk.StringVar(value='00')
        ctk.CTkOptionMenu(
            meta_row, variable=self._hour_var,
            values=[f'{h:02d}' for h in range(24)],
            fg_color=_blend(FIELD, '#ffffff', 0.04), button_color=_blend(FIELD, '#ffffff', 0.04), button_hover_color=HOVER,
            text_color=TEXT, dropdown_fg_color=BG2, dropdown_text_color=TEXT,
            dropdown_hover_color=HOVER, width=58, height=36, font=('Helvetica', 11),
            dropdown_font=('Helvetica', 11),
        ).pack(side='left')
        ctk.CTkOptionMenu(
            meta_row, variable=self._min_var,
            values=[f'{m:02d}' for m in range(0, 60, 5)],
            fg_color=_blend(FIELD, '#ffffff', 0.04), button_color=_blend(FIELD, '#ffffff', 0.04), button_hover_color=HOVER,
            text_color=TEXT, dropdown_fg_color=BG2, dropdown_text_color=TEXT,
            dropdown_hover_color=HOVER, width=58, height=36, font=('Helvetica', 11),
            dropdown_font=('Helvetica', 11),
        ).pack(side='left', padx=(8, 0))
        ctk.CTkLabel(meta_row, text='Optional', font=('Helvetica', 11),
                     text_color=DIM).pack(side='left', padx=(10, 0))

        self._calendar_frame = self._build_calendar_panel(panel)
        self._calendar_visible = False

        self._existing_locations: list[str] = list(s.get('devices', []))
        self._load_locations()

        work = ctk.CTkFrame(
            panel, fg_color=_blend(BG2, '#ffffff', 0.035), corner_radius=12,
            border_width=1, border_color=BORDER,
            bg_color=_blend(PANEL, '#ffffff', 0.04),
        )
        self._work_frame = work
        work.pack(fill='both', expand=True, padx=14, pady=(0, 14))

        vpick = ctk.CTkFrame(work, fg_color='transparent', corner_radius=0)
        vpick.pack(fill='x', padx=14, pady=(14, 12))
        ctk.CTkButton(vpick, text='⇧  Browse for Video', font=('Helvetica', 12, 'bold'),
                      fg_color='#3f98ff', hover_color='#5ab7ff', text_color='white',
                      height=42, width=190, corner_radius=8, border_width=1,
                      border_color='#7cc8ff',
                      command=self._pick_video).pack(side='left')
        self._video_label = ctk.CTkLabel(vpick, text='No video selected',
                                          font=('Helvetica', 12), text_color=TEXT)
        self._video_label.pack(side='left', padx=(16, 4))
        self._clear_video_btn = ctk.CTkButton(
            vpick, text='✕', font=('Helvetica', 11, 'bold'),
            fg_color='transparent', hover_color=HOVER, text_color=DIM,
            width=24, height=24, corner_radius=12,
            command=self._clear_video,
        )
        self._clear_video_btn.pack(side='left', padx=(0, 8))
        self._clear_video_btn.pack_forget()  # hidden until a video is selected
        self._skip_var = ctk.StringVar(value=str(DEFAULT_FRAME_SKIP))
        ctk.CTkOptionMenu(
            vpick, variable=self._skip_var,
            values=[str(i) for i in range(1, 11)],
            fg_color=_blend(FIELD, '#ffffff', 0.04),
            button_color=_blend(FIELD, '#ffffff', 0.04),
            button_hover_color=HOVER,
            text_color=TEXT, dropdown_fg_color=BG2, dropdown_text_color=TEXT,
            dropdown_hover_color=HOVER, width=76, height=34,
            font=('Helvetica', 11), dropdown_font=('Helvetica', 11),
        ).pack(side='right', padx=(8, 0))
        ctk.CTkLabel(vpick, text='Skip', font=('Helvetica', 11),
                     text_color=DIM).pack(side='right', padx=(16, 0))
        self._model_var = ctk.StringVar(value=DEFAULT_MODEL)
        ctk.CTkOptionMenu(
            vpick, variable=self._model_var,
            values=list(MODEL_OPTIONS.keys()),
            fg_color=_blend(FIELD, '#ffffff', 0.04),
            button_color=_blend(FIELD, '#ffffff', 0.04),
            button_hover_color=HOVER,
            text_color=TEXT, dropdown_fg_color=BG2, dropdown_text_color=TEXT,
            dropdown_hover_color=HOVER, width=112, height=34,
            font=('Helvetica', 11), dropdown_font=('Helvetica', 11),
        ).pack(side='right')
        ctk.CTkLabel(vpick, text='Model', font=('Helvetica', 11),
                     text_color=DIM).pack(side='right', padx=(0, 8))

        canvas_wrap = ctk.CTkFrame(work, fg_color='transparent', corner_radius=0)
        canvas_wrap.pack(fill='x', padx=14)
        self._canvas = tk.Canvas(
            canvas_wrap, width=PREVIEW_W, height=PREVIEW_H,
            bg=_blend(BG2, '#ffffff', 0.035), highlightthickness=0,
            cursor='crosshair' if not is_seatbelt else 'arrow',
        )
        self._canvas.pack()
        if not is_seatbelt:
            self._canvas.bind('<Button-1>', self._on_canvas_click)

        # Drag-and-drop onto the canvas
        try:
            from tkinterdnd2 import TkinterDnD, DND_FILES
            TkinterDnD._require(self)
            self._canvas.drop_target_register(DND_FILES)
            self._canvas.dnd_bind('<<Drop>>', self._on_video_drop)
            self._has_dnd = True
        except Exception:
            self._has_dnd = False

        self._draw_placeholder()

        if not is_seatbelt:
            ctrl = ctk.CTkFrame(work, fg_color='transparent', corner_radius=0)
            ctrl.pack(fill='x', padx=14, pady=(18, 8))
            ctk.CTkLabel(ctrl, text='Direction:', font=('Helvetica', 12),
                         text_color=TEXT).pack(side='left')

            self._dir_btns: dict[str, ctk.CTkButton] = {}
            for label, val in [('↓ Down', 'down'), ('↑ Up', 'up'),
                               ('← Left', 'left'), ('→ Right', 'right')]:
                b = ctk.CTkButton(
                    ctrl, text=label, font=('Helvetica', 12),
                    width=92, height=42, fg_color=_blend(FIELD, '#ffffff', 0.025), hover_color=HOVER,
                    text_color=TEXT, corner_radius=8, border_width=1,
                    border_color=BORDER, command=lambda v=val: self._set_direction(v),
                )
                b.pack(side='left', padx=(10 if not self._dir_btns else 8, 0))
                self._dir_btns[val] = b
            self._update_dir_buttons()

            pos_row = ctk.CTkFrame(work, fg_color='transparent', corner_radius=0)
            pos_row.pack(fill='x', padx=14, pady=(0, 12))
            ctk.CTkLabel(pos_row, text='Position:', font=('Helvetica', 12),
                         text_color=TEXT).pack(side='left')
            self._line_label = ctk.CTkLabel(pos_row, text='50%',
                                             font=('Helvetica', 12, 'bold'),
                                             text_color=TEXT, width=40)
            self._line_label.pack(side='right')
            self._slider = ctk.CTkSlider(
                pos_row, from_=5, to=95, number_of_steps=90,
                fg_color=BG3, progress_color=ACCENT, button_color=ACCENT,
                button_hover_color='#75b6ff', command=self._on_slider,
            )
            self._slider.set(50)
            self._slider.pack(side='left', fill='x', expand=True, padx=(10, 10))

            # Lane boundary — single row: L [start slider] [end slider] R
            lane_row = ctk.CTkFrame(work, fg_color='transparent', corner_radius=0)
            lane_row.pack(fill='x', padx=14, pady=(0, 14))
            ctk.CTkLabel(lane_row, text='Lane:', font=('Helvetica', 12),
                         text_color=TEXT).pack(side='left')
            self._lane_start_name = ctk.CTkLabel(lane_row, text='L',
                         font=('Helvetica', 11, 'bold'), text_color=TEXT, width=16)
            self._lane_start_name.pack(side='left', padx=(8, 0))
            self._lane_start_slider = ctk.CTkSlider(
                lane_row, from_=0, to=90, number_of_steps=90,
                fg_color=BG3, progress_color=BG3, button_color=ACCENT,
                button_hover_color='#75b6ff', command=self._on_lane_start_slider,
            )
            self._lane_start_slider.set(0)
            self._lane_start_slider.pack(side='left', fill='x', expand=True, padx=(4, 4))
            self._lane_end_slider = ctk.CTkSlider(
                lane_row, from_=10, to=100, number_of_steps=90,
                fg_color=BG3, progress_color=BG3, button_color=ACCENT,
                button_hover_color='#75b6ff', command=self._on_lane_end_slider,
            )
            self._lane_end_slider.set(100)
            self._lane_end_slider.pack(side='left', fill='x', expand=True, padx=(4, 4))
            self._lane_end_name = ctk.CTkLabel(lane_row, text='R',
                         font=('Helvetica', 11, 'bold'), text_color=TEXT, width=16)
            self._lane_end_name.pack(side='left')
            self._lane_start_label = None
            self._lane_end_label   = None
        else:
            dir_row = ctk.CTkFrame(work, fg_color='transparent', corner_radius=0)
            dir_row.pack(fill='x', padx=14, pady=(18, 8))
            ctk.CTkLabel(dir_row, text='Traffic Direction:', font=('Helvetica', 12),
                         text_color=TEXT).pack(side='left')
            self._vdir_btns: dict[str, ctk.CTkButton] = {}
            for label, val in [('↓ Towards Camera', 'towards'), ('↔ Both', 'both')]:
                b = ctk.CTkButton(
                    dir_row, text=label, font=('Helvetica', 11),
                    width=150, height=42, fg_color=_blend(FIELD, '#ffffff', 0.025), hover_color=HOVER,
                    text_color=TEXT, corner_radius=8, border_width=1,
                    border_color=BORDER, command=lambda v=val: self._set_vehicle_dir(v),
                )
                b.pack(side='left', padx=(10 if not self._vdir_btns else 8, 0))
                self._vdir_btns[val] = b
            self._update_vdir_buttons()

            self._dir_btns          = {}
            self._slider            = None
            self._line_label        = None
            self._lane_start_slider = None
            self._lane_end_slider   = None
            self._lane_start_label  = None
            self._lane_end_label    = None
            self._lane_start_name   = None
            self._lane_end_name     = None

        run_row = ctk.CTkFrame(panel, fg_color='transparent', corner_radius=0)
        run_row.pack(fill='x', padx=18, pady=(12, 8))
        self._run_btn = ctk.CTkButton(
            run_row, text='▷  Process Video', font=('Helvetica', 14, 'bold'),
            fg_color='#3f98ff', hover_color='#5ab7ff', text_color='white',
            width=190, height=50, corner_radius=10, border_width=1,
            border_color='#7cc8ff', command=self._run,
        )
        self._run_btn.pack(side='left')
        self._status_label = ctk.CTkLabel(run_row, text='', font=('Helvetica', 11),
                                           text_color=TEXT)
        self._status_label.pack(side='left', padx=16)

        self._progress = ctk.CTkProgressBar(panel, progress_color=ACCENT, fg_color=BG3,
                                             height=7, corner_radius=5)
        self._progress.pack(fill='x', padx=18, pady=(2, 10))
        self._progress.set(0)

        log_wrap = ctk.CTkFrame(panel, fg_color='transparent', corner_radius=0)
        log_wrap.pack(fill='both', expand=True, padx=18, pady=(0, 14))
        self._log_text = ctk.CTkTextbox(log_wrap, font=('Menlo', 10),
                                         fg_color=BG_DARK, text_color='#a8b2c8',
                                         corner_radius=10, border_width=1,
                                         border_color='#263a63')
        self._log_text.pack(fill='both', expand=True)
        self._log_text.configure(state='disabled')


    # ── Preview canvas helpers ────────────────────────────────────────────────────────────────────────

    def _draw_placeholder(self) -> None:
        self._canvas.delete('all')
        is_seatbelt = self.session and self.session.get('mode') == 'seatbelt'
        has_dnd = getattr(self, '_has_dnd', False)
        if is_seatbelt:
            line1 = 'Drop a video here or click Browse'
            line2 = ''
        else:
            line1 = 'Drop a video here or click Browse'
            line2 = 'Then click anywhere to set the counting line'
        self._dropzone_img = ImageTk.PhotoImage(_make_dropzone_bg(PREVIEW_W, PREVIEW_H))
        self._canvas.create_image(0, 0, anchor='nw', image=self._dropzone_img)
        pad = 28
        self._canvas.create_rectangle(
            pad, pad, PREVIEW_W - pad, PREVIEW_H - pad,
            outline='#9aabd0', dash=(3, 3), width=1,
        )
        self._canvas.create_text(
            PREVIEW_W // 2, PREVIEW_H // 2 - (12 if line2 else 0),
            text=line1, fill=TEXT,
            font=('Helvetica', 15), justify='center',
        )
        if line2:
            self._canvas.create_text(
                PREVIEW_W // 2, PREVIEW_H // 2 + 16,
                text=line2, fill=DIM,
                font=('Helvetica', 12), justify='center',
            )

    def _on_video_drop(self, event) -> None:
        """Handle drag-and-drop of a video file onto the canvas."""
        raw = event.data.strip()
        # macOS wraps paths with spaces in braces: {/path/to/my file.mp4}
        if raw.startswith('{') and raw.endswith('}'):
            raw = raw[1:-1]
        path = raw
        if not path.lower().endswith(('.mp4', '.mov', '.mkv', '.avi', '.m4v')):
            return
        self.video_path = path
        self._video_label.configure(text=Path(path).name, text_color=TEXT)
        self._clear_video_btn.pack(side='left', padx=(0, 8))
        try:
            mtime = os.path.getmtime(path)
            dt    = datetime.fromtimestamp(mtime)
            if self._date_var: self._date_var.set(dt.strftime('%Y-%m-%d'))
            if self._hour_var: self._hour_var.set(f'{dt.hour:02d}')
            if self._min_var:  self._min_var.set(f'{(dt.minute // 5) * 5:02d}')
        except Exception:
            pass
        self._load_preview()

    def _pick_video(self) -> None:
        path = filedialog.askopenfilename(
            title='Select Video File',
            filetypes=[('Video files', '*.mp4 *.mov *.mkv *.avi *.m4v'), ('All files', '*.*')],
        )
        if not path:
            return
        self.video_path = path
        self._video_label.configure(text=Path(path).name, text_color=TEXT)
        self._clear_video_btn.pack(side='left', padx=(0, 8))
        # Pre-fill date/time from file modification time — user can override if needed
        try:
            mtime = os.path.getmtime(path)
            dt    = datetime.fromtimestamp(mtime)
            if self._date_var is not None:
                self._date_var.set(dt.strftime('%Y-%m-%d'))
            if self._hour_var is not None:
                self._hour_var.set(f'{dt.hour:02d}')
            if self._min_var is not None:
                self._min_var.set(f'{(dt.minute // 5) * 5:02d}')
        except Exception:
            pass
        self._load_preview()

    def _clear_video(self) -> None:
        self.video_path = None
        self._video_label.configure(text='No video selected', text_color=DIM)
        self._clear_video_btn.pack_forget()
        # Clear preview canvas
        self._canvas.delete('all')

    def _load_preview(self) -> None:
        cap   = cv2.VideoCapture(self.video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.set(cv2.CAP_PROP_POS_FRAMES, total // 2)
        ret, frame = cap.read()
        cap.release()
        if not ret:
            return
        self._preview_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        self._redraw_preview()

    def _redraw_preview(self) -> None:
        if self._preview_frame is None:
            return
        h, w  = self._preview_frame.shape[:2]
        scale = min(PREVIEW_W / w, PREVIEW_H / h)
        nw, nh = int(w * scale), int(h * scale)
        frame  = cv2.resize(self._preview_frame, (nw, nh))

        is_seatbelt = self.session and self.session.get('mode') == 'seatbelt'

        if not is_seatbelt:
            axis  = 'x' if self.direction in ('left', 'right') else 'y'
            x1    = int(nw * self.line_x_start)
            x2    = int(nw * self.line_x_end)
            if axis == 'y':
                ly = int(nh * self.line_pos)
                cv2.line(frame, (x1, ly), (x2, ly), (239, 68, 68), 2)
                cv2.putText(frame, f'Line  {int(self.line_pos * 100)}%',
                            (max(x1 + 4, 8), max(ly - 6, 14)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (239, 68, 68), 1)
            else:
                lx = int(nw * self.line_pos)
                y1 = int(nh * self.line_x_start)
                y2 = int(nh * self.line_x_end)
                cv2.line(frame, (lx, y1), (lx, y2), (239, 68, 68), 2)
                cv2.putText(frame, f'Line  {int(self.line_pos * 100)}%',
                            (max(lx + 4, 4), max(y1 + 16, 20)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (239, 68, 68), 1)

        bg_hex = CANVAS_BG.lstrip('#')
        bg_rgb = tuple(int(bg_hex[i:i + 2], 16) for i in (0, 2, 4))
        padded = Image.new('RGB', (PREVIEW_W, PREVIEW_H), bg_rgb)
        ox = (PREVIEW_W - nw) // 2
        oy = (PREVIEW_H - nh) // 2
        padded.paste(Image.fromarray(frame), (ox, oy))

        self._px, self._py, self._pw, self._ph = ox, oy, nw, nh
        self._tk_img = ImageTk.PhotoImage(padded)
        self._canvas.delete('all')
        self._canvas.create_image(0, 0, anchor='nw', image=self._tk_img)
        if not is_seatbelt:
            self._canvas.create_text(
                PREVIEW_W - 8, PREVIEW_H - 8, anchor='se',
                text='Click or use slider to move the counting line',
                fill='#475569', font=('Helvetica', 10),
            )


    # ── Location autocomplete ──────────────────────────────────────────────────────────────────────

    def _load_locations(self) -> None:
        def fetch():
            try:
                try:  # refresh token first
                    tokens = fb_refresh(self.session.get('refreshToken', ''))
                    self.session['token'] = tokens['idToken']
                    self.session['refreshToken'] = tokens['refreshToken']
                    save_session(self.session)
                except Exception:
                    pass
                data = fb_get(f'companies/{self.session["companyId"]}/devices',
                              self.session['token'])
                if isinstance(data, dict):
                    self._existing_locations = sorted(data.keys())
                elif isinstance(data, list):
                    self._existing_locations = sorted(str(x) for x in data if x)
                if self._existing_locations:
                    self.after(0, lambda: self._loc_entry.configure(
                        values=self._existing_locations))
            except Exception as e:
                print(f'[locations] {e}')
        threading.Thread(target=fetch, daemon=True).start()

    def _on_loc_change(self, *_) -> None:
        typed   = self._loc_var.get().strip().lower()
        matches = [loc for loc in self._existing_locations
                   if typed and typed in loc.lower() and loc.lower() != typed]

        for w in self._sugg_frame.winfo_children():
            w.destroy()

        if matches:
            self._sugg_frame.pack(fill='x', padx=30, pady=(0, 4))
            for loc in matches[:6]:
                ctk.CTkButton(
                    self._sugg_frame, text=loc, font=('Helvetica', 11),
                    fg_color='transparent', hover_color=BG3, text_color=TEXT,
                    anchor='w', height=28,
                    command=lambda l=loc: self._pick_location(l),
                ).pack(fill='x', padx=4, pady=1)
        else:
            self._sugg_frame.pack_forget()

    def _pick_location(self, loc: str) -> None:
        self._loc_var.set(loc)
        self._sugg_frame.pack_forget()

    def _show_all_locations(self) -> None:
        """▼ button — show every saved location as a dropdown."""
        for w in self._sugg_frame.winfo_children():
            w.destroy()
        locs = self._existing_locations
        if not locs:
            return
        self._sugg_frame.pack(fill='x', padx=30, pady=(0, 4))
        for loc in locs[:10]:
            ctk.CTkButton(
                self._sugg_frame, text=loc, font=('Helvetica', 11),
                fg_color='transparent', hover_color=BG3, text_color=TEXT,
                anchor='w', height=28,
                command=lambda l=loc: self._pick_location(l),
            ).pack(fill='x', padx=4, pady=1)

    def _build_calendar_panel(self, parent):
        """Inline calendar panel. No popup windows, no stacking."""
        try:
            from tkcalendar import Calendar as _Cal
            import tkinter.ttk as _ttk
        except ImportError:
            return None

        frame = ctk.CTkFrame(
            parent, fg_color=_blend(BG2, '#ffffff', 0.035),
            border_width=1, border_color=BORDER, corner_radius=12,
        )

        # Force clam theme so our colors work on macOS (native 'aqua' ignores them)
        _style = _ttk.Style(frame)
        try:
            _style.theme_use('clam')
        except Exception:
            pass

        init_date = datetime.now()
        try:
            init_date = datetime.strptime(self._date_var.get().strip(), '%Y-%m-%d')
        except Exception:
            pass

        cal = _Cal(
            frame, selectmode='day',
            year=init_date.year, month=init_date.month, day=init_date.day,
            date_pattern='y-mm-dd',
            background=BG2, foreground=TEXT,
            headersbackground=ACCENT, headersforeground='white',
            normalbackground=BG2, normalforeground=TEXT,
            weekendbackground=BG2, weekendforeground=TEXT,
            selectbackground=ACCENT, selectforeground='white',
            othermonthbackground=BG3, othermonthforeground=DIM,
            bordercolor=BG3, font=('Helvetica', 10),
            showweeknumbers=False,
        )
        cal.pack(fill='x', padx=10, pady=(10, 6))
        cal.bind('<<CalendarSelected>>', lambda _: self._select_calendar_date(cal.get_date()))
        self._calendar_widget = cal

        btn_row = ctk.CTkFrame(frame, fg_color='transparent', corner_radius=0)
        btn_row.pack(fill='x', padx=10, pady=(0, 10))

        ctk.CTkButton(
            btn_row, text='Today', font=('Helvetica', 11, 'bold'),
            fg_color=FIELD, hover_color=HOVER, text_color=TEXT,
            height=30, corner_radius=7, command=self._select_today,
        ).pack(side='left', fill='x', expand=True, padx=(0, 4))
        ctk.CTkButton(
            btn_row, text='Select', font=('Helvetica', 11, 'bold'),
            fg_color=ACCENT, hover_color='#2f80ed', text_color='white',
            height=30, corner_radius=7,
            command=lambda: self._select_calendar_date(cal.get_date()),
        ).pack(side='left', fill='x', expand=True, padx=(4, 0))

        return frame

    def _toggle_calendar(self) -> None:
        if self._calendar_frame is None:
            return
        if self._calendar_visible:
            self._hide_calendar()
            return
        pack_opts = {'fill': 'x', 'padx': 24, 'pady': (0, 14)}
        if self._work_frame is not None:
            pack_opts['before'] = self._work_frame
        self._calendar_frame.pack(**pack_opts)
        self._calendar_visible = True

    def _hide_calendar(self) -> None:
        if self._calendar_frame is not None:
            self._calendar_frame.pack_forget()
        self._calendar_visible = False

    def _select_calendar_date(self, date_str: str) -> None:
        if self._date_var is not None:
            self._date_var.set(date_str)
        self._hide_calendar()

    def _select_today(self) -> None:
        self._select_calendar_date(datetime.now().strftime('%Y-%m-%d'))


    # ── Counting line controls ────────────────────────────────────────────────────────────────────────

    def _on_slider(self, val: float) -> None:
        self.line_pos = val / 100
        self._line_label.configure(text=f'{int(val)}%')
        self._redraw_preview()

    def _on_canvas_click(self, event: tk.Event) -> None:
        if self._preview_frame is None:
            return
        axis = 'x' if self.direction in ('left', 'right') else 'y'
        rel  = ((event.y - self._py) / max(self._ph, 1) if axis == 'y'
                else (event.x - self._px) / max(self._pw, 1))
        self.line_pos = max(0.05, min(0.95, rel))
        self._slider.set(self.line_pos * 100)
        self._line_label.configure(text=f'{int(self.line_pos * 100)}%')
        self._redraw_preview()

    def _on_lane_start_slider(self, val: float) -> None:
        self.line_x_start = val / 100
        if self._lane_start_label:
            self._lane_start_label.configure(text=f'{int(val)}%')
        self._redraw_preview()

    def _on_lane_end_slider(self, val: float) -> None:
        self.line_x_end = val / 100
        if self._lane_end_label:
            self._lane_end_label.configure(text=f'{int(val)}%')
        self._redraw_preview()

    def _set_direction(self, val: str) -> None:
        self.direction = val
        self._update_dir_buttons()
        self._redraw_preview()
        if self._lane_start_name and self._lane_end_name:
            if val in ('left', 'right'):
                self._lane_start_name.configure(text='T')
                self._lane_end_name.configure(text='B')
            else:
                self._lane_start_name.configure(text='L')
                self._lane_end_name.configure(text='R')

    def _update_dir_buttons(self) -> None:
        for val, btn in self._dir_btns.items():
            if val == self.direction:
                btn.configure(fg_color='#4f9cff', text_color='white', border_color='#8dc8ff')
            else:
                btn.configure(fg_color=_blend(FIELD, '#ffffff', 0.025), text_color=TEXT, border_color=BORDER)

    def _set_vehicle_dir(self, val: str) -> None:
        self._vehicle_dir = val
        self._update_vdir_buttons()

    def _update_vdir_buttons(self) -> None:
        for val, btn in self._vdir_btns.items():
            if val == self._vehicle_dir:
                btn.configure(fg_color=AMBER, text_color='white', border_color=AMBER)
            else:
                btn.configure(fg_color=_blend(FIELD, '#ffffff', 0.025), text_color=TEXT, border_color=BORDER)


    # ── Run / process ──────────────────────────────────────────────────────────────────────────────────

    def _run(self) -> None:
        if not self.video_path:
            messagebox.showwarning('No Video', 'Please select a video file first.')
            return
        location = self._loc_var.get().strip()
        if not location:
            messagebox.showwarning('No Location', 'Please enter a location name for this video.')
            self._loc_entry.focus_set()
            return
        if self._processing:
            # Button clicked while processing — treat as cancel
            if self._cancel_event is not None:
                self._cancel_event.set()
                self._run_btn.configure(state='disabled', text='Cancelling...')
            return

        size    = os.path.getsize(self.video_path)
        fhash   = file_hash(self.video_path, size)
        cid     = self.session['companyId']
        token   = self.session['token']
        previous = None

        try:
            result = fb_get(f'companies/{cid}/processed/{fhash}', token)
            if isinstance(result, dict):
                previous = result
        except Exception:
            pass

        if not previous:
            for loc in self._existing_locations:
                try:
                    result = fb_get(f'companies/{cid}/devices/{loc}/processed/{fhash}', token)
                    if isinstance(result, dict):
                        result.setdefault('location', loc)
                        previous = result
                        break
                except Exception:
                    pass

        if previous and isinstance(previous, dict):
            prev_date  = datetime.fromtimestamp(
                previous.get('processedAt', 0) / 1000
            ).strftime('%B %d, %Y at %H:%M')
            prev_count = previous.get('vehicleCount', 0)
            prev_loc   = previous.get('location', 'unknown location')
            answer = messagebox.askyesno(
                'Already Processed',
                f'"{Path(self.video_path).name}" was already processed on {prev_date}\n'
                f'Location: {prev_loc}  ·  {prev_count} crossings found.\n\n'
                f'Process again? (This will add duplicate counts to the dashboard.)',
            )
            if not answer:
                return

        self._processing = True
        self._cancel_event = threading.Event()
        self._run_btn.configure(
            state='normal', text='✕  Cancel',
            fg_color='#c0392b', hover_color='#e74c3c',
            border_color='#e74c3c',
        )
        self._progress.set(0)
        self._status_label.configure(text='', text_color=DIM)

        mode        = self.session.get('mode', 'people_counter')
        is_seatbelt = mode == 'seatbelt'
        unit        = 'vehicles' if mode in ('seatbelt', 'car_counter') else 'crossings'
        yolo_model_label = self._model_var.get() if self._model_var is not None else DEFAULT_MODEL
        try:
            yolo_skip = int(self._skip_var.get()) if self._skip_var is not None else DEFAULT_FRAME_SKIP
        except ValueError:
            yolo_skip = DEFAULT_FRAME_SKIP

        # Parse video start date/time from dropdowns
        video_start_ts: float | None = None
        if self._date_var is not None:
            date_str = self._date_var.get().strip()
            hour_str = self._hour_var.get() if self._hour_var else '00'
            min_str  = self._min_var.get()  if self._min_var  else '00'
            if date_str:
                try:
                    video_start_ts = datetime.strptime(
                        f'{date_str} {hour_str}:{min_str}', '%Y-%m-%d %H:%M'
                    ).timestamp()
                except ValueError:
                    pass  # bad format → fall back to file mtime inside run_processing

        def progress_cb(frac: float, count: int) -> None:
            def _update():
                self._progress.set(frac)
                self._status_label.configure(text=f'{int(frac * 100)}%  ·  {count} {unit}')
            self.after(0, _update)

        def log_cb(msg: str) -> None:
            self._log_queue.put(msg)

        def done_cb(success: bool, count: int, cancelled: bool = False) -> None:
            def _update():
                self._processing = False
                self._cancel_event = None
                self._run_btn.configure(
                    state='normal', text='▷  Process Video',
                    fg_color='#3f98ff', hover_color='#5ab7ff',
                    border_color='#7cc8ff',
                )
                if cancelled:
                    msg, color = 'Cancelled', DIM
                elif success:
                    msg, color = f'Done — {count} {unit} written to dashboard', SUCCESS
                else:
                    msg, color = 'Processing failed', DANGER
                self._status_label.configure(text=msg, text_color=color)
            self.after(0, _update)

        cancel_event = self._cancel_event

        if is_seatbelt:
            from process_seatbelt import run_seatbelt_processing
            threading.Thread(
                target=run_seatbelt_processing,
                args=(
                    self.video_path,
                    self.session['companyId'],
                    location,
                    self.session['token'],
                    progress_cb, log_cb, done_cb,
                    self._vehicle_dir,
                ),
                kwargs={'cancel_event': cancel_event},
                daemon=True,
            ).start()
        else:
            threading.Thread(
                target=run_processing,
                args=(
                    self.video_path,
                    self.session['companyId'],
                    location,
                    self.line_pos,
                    self.direction,
                    self.session['token'],
                    progress_cb, log_cb, done_cb,
                    mode,
                ),
                kwargs={
                    'line_x_start':   self.line_x_start,
                    'line_x_end':     self.line_x_end,
                    'video_start_ts': video_start_ts,
                    'yolo_model_label': yolo_model_label,
                    'yolo_skip': yolo_skip,
                    'frame_cb':       self._queue_preview_frame,
                    'cancel_event':   cancel_event,
                },
                daemon=True,
            ).start()


    # ── Log polling ───────────────────────────────────────────────────────────────────────────────────

    def _queue_preview_frame(self, frame) -> None:
        while True:
            try:
                self._frame_queue.get_nowait()
            except queue.Empty:
                break
        try:
            self._frame_queue.put_nowait(frame)
        except queue.Full:
            pass

    def _poll_logs(self) -> None:
        # Live video frame preview
        latest = None
        try:
            while True:
                latest = self._frame_queue.get_nowait()
        except queue.Empty:
            pass
        if latest is not None and hasattr(self, '_canvas'):
            self._preview_frame = cv2.cvtColor(latest, cv2.COLOR_BGR2RGB)
            self._redraw_preview()

        # Log messages
        while True:
            try:
                msg = self._log_queue.get_nowait()
                if hasattr(self, '_log_text'):
                    self._log_text.configure(state='normal')
                    self._log_text.insert('end', f'{msg}\n')
                    self._log_text.see('end')
                    self._log_text.configure(state='disabled')
            except queue.Empty:
                break
        self.after(33 if self._processing else 100, self._poll_logs)

    def _sign_out(self) -> None:
        clear_session()
        self.session = None
        self._show_signin()


if __name__ == '__main__':
    App().mainloop()
