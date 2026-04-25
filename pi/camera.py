#!/usr/bin/env python3
"""
PiVision — Raspberry Pi camera script
--------------------------------------
• Firebase Storage snapshots   → 1 frame/second, shown on dashboard
• Motion detection (OpenCV)    → Firebase Realtime Database events
• GPT-4 Vision analysis        → Firebase /claude/lastAnalysis
• MJPEG stream (LAN only)      → http://<local-ip>:8080/stream

Requirements:
  1. Place your Firebase service account JSON at pi/serviceAccount.json
  2. Enable Firebase Storage at console.firebase.google.com
  3. Set environment variable: export OPENAI_API_KEY="sk-..."
  4. Run: python3 camera.py

Optional env vars:
  CAMERA_INDEX        USB camera device index (default: 0)
  MOTION_THRESHOLD    Min contour area in px² to count as motion (default: 3000)
  ANALYSIS_INTERVAL   Seconds between GPT-4 Vision calls (default: 60)
  MOTION_COOLDOWN     Min seconds between consecutive motion events (default: 2)
"""

import os
import sys
import time
import uuid
import base64
import socket
import logging
import threading
import http.server
import socketserver
from datetime import datetime

import cv2
import firebase_admin
from firebase_admin import credentials, db as rtdb, storage as fb_storage
from openai import OpenAI

# ── Config ─────────────────────────────────────────────────────────────────────
FIREBASE_DB_URL  = "https://pivision-28ddb-default-rtdb.firebaseio.com"
FIREBASE_PROJECT = "pivision-28ddb"
STORAGE_BUCKET   = "pivision-28ddb.appspot.com"
SERVICE_ACCOUNT  = os.path.join(os.path.dirname(__file__), "serviceAccount.json")

# Stable download URL — token is set in metadata on every upload
SNAPSHOT_TOKEN = "pivision-snapshot-v1"
SNAPSHOT_URL   = (
    f"https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}"
    f"/o/camera%2Fsnapshot.jpg?alt=media&token={SNAPSHOT_TOKEN}"
)

OPENAI_API_KEY    = os.environ.get("OPENAI_API_KEY", "")
CAMERA_INDEX      = int(os.environ.get("CAMERA_INDEX", "0"))
STREAM_PORT       = int(os.environ.get("STREAM_PORT", "8080"))
MOTION_THRESHOLD  = int(os.environ.get("MOTION_THRESHOLD", "3000"))
ANALYSIS_INTERVAL = int(os.environ.get("ANALYSIS_INTERVAL", "60"))
MOTION_COOLDOWN   = float(os.environ.get("MOTION_COOLDOWN", "2"))

FRAME_WIDTH  = 1280
FRAME_HEIGHT = 720
STREAM_FPS   = 15

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("PiVision")


# ── MJPEG frame buffer (LAN stream) ───────────────────────────────────────────
class FrameBuffer:
    def __init__(self) -> None:
        self._jpeg: bytes | None = None
        self._lock = threading.Lock()

    def write(self, jpeg_bytes: bytes) -> None:
        with self._lock:
            self._jpeg = jpeg_bytes

    def read(self) -> bytes | None:
        with self._lock:
            return self._jpeg


# ── MJPEG HTTP server (LAN only) ──────────────────────────────────────────────
BOUNDARY = b"--piboundary"

class MJPEGHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path not in ("/", "/stream"):
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=piboundary")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        interval = 1.0 / STREAM_FPS
        try:
            while True:
                frame = self.server.frame_buf.read()  # type: ignore[attr-defined]
                if frame is None:
                    time.sleep(0.05)
                    continue
                header = (
                    BOUNDARY + b"\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
                )
                self.wfile.write(header + frame + b"\r\n")
                self.wfile.flush()
                time.sleep(interval)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def log_message(self, *_) -> None:
        pass


class _ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    frame_buf: FrameBuffer


def start_mjpeg_server(frame_buf: FrameBuffer, port: int) -> None:
    server = _ThreadingServer(("", port), MJPEGHandler)
    server.frame_buf = frame_buf
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "localhost"
    log.info("MJPEG stream available on LAN → http://%s:%d/stream", local_ip, port)


# ── Firebase init ──────────────────────────────────────────────────────────────
def init_firebase() -> None:
    if not os.path.exists(SERVICE_ACCOUNT):
        log.error(
            "\n  serviceAccount.json not found!\n"
            "  Generate at: https://console.firebase.google.com/project/%s/settings/serviceaccounts\n"
            "  Save as: pi/serviceAccount.json\n",
            FIREBASE_PROJECT,
        )
        sys.exit(1)
    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred, {
        "databaseURL": FIREBASE_DB_URL,
        "storageBucket": STORAGE_BUCKET,
    })
    log.info("Firebase connected ✓  (project: %s)", FIREBASE_PROJECT)


# ── Firebase Storage snapshot upload ──────────────────────────────────────────
def upload_snapshot(jpeg_bytes: bytes) -> None:
    try:
        bucket = fb_storage.bucket()
        blob = bucket.blob("camera/snapshot.jpg")
        blob.metadata = {"firebaseStorageDownloadTokens": SNAPSHOT_TOKEN}
        blob.upload_from_string(jpeg_bytes, content_type="image/jpeg")
    except Exception as exc:
        log.warning("Snapshot upload failed: %s", exc)


# ── Firebase Realtime DB helpers ───────────────────────────────────────────────
def push_event(event_type: str, label: str, sublabel: str) -> None:
    event_id = uuid.uuid4().hex[:8]
    rtdb.reference(f"events/{event_id}").set({
        "id":        event_id,
        "timestamp": int(time.time() * 1000),
        "type":      event_type,
        "label":     label,
        "sublabel":  sublabel,
    })


def increment_motion_count() -> None:
    ref = rtdb.reference("stats/motionEvents")
    ref.set((ref.get() or 0) + 1)


def update_stats_last_event(label: str) -> None:
    rtdb.reference("stats/lastEvent").set(label)


def update_claude(text: str) -> None:
    rtdb.reference("claude").set({
        "lastAnalysis": text,
        "lastUpdated":  int(time.time() * 1000),
    })


def set_camera_status(connected: bool, snapshot_url: str = "") -> None:
    rtdb.reference("camera").update({
        "piConnected": connected,
        "status":      "Connected" if connected else "Disconnected",
        "fps":         1 if connected else 0,
        "resolution":  "720p" if connected else "—",
        "snapshotUrl": snapshot_url,
    })


# ── GPT-4 Vision ───────────────────────────────────────────────────────────────
VISION_PROMPT = (
    "You are a concise security camera AI assistant. "
    "In 1–2 sentences describe exactly what you see in this camera frame: "
    "any people, objects, activity, or unusual details. "
    "If nothing notable is happening, say so briefly. Be direct and factual."
)


def analyse_frame_with_gpt4(frame, client: OpenAI) -> str | None:
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    b64 = base64.b64encode(buf).decode("utf-8")
    try:
        resp = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=150,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text",      "text": VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            }],
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        log.warning("GPT-4 Vision error: %s", exc)
        return None


# ── Camera + motion loop ───────────────────────────────────────────────────────
def run_camera(cap: cv2.VideoCapture, frame_buf: FrameBuffer, openai_client) -> None:
    log.info(
        "Motion detection started  (threshold=%dpx²  analysis_interval=%ds)",
        MOTION_THRESHOLD, ANALYSIS_INTERVAL,
    )
    bg_sub = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=False)

    last_motion_at   = 0.0
    last_analysis_at = 0.0
    latest_frame     = None
    frame_lock       = threading.Lock()

    # ── Snapshot upload worker (1 frame/second → Firebase Storage) ────────────
    def snapshot_worker() -> None:
        log.info("Snapshot worker started — uploading 1 frame/second to Firebase Storage")
        while True:
            time.sleep(1)
            with frame_lock:
                f = latest_frame.copy() if latest_frame is not None else None
            if f is None:
                continue
            _, buf = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 70])
            threading.Thread(target=upload_snapshot, args=(buf.tobytes(),), daemon=True).start()

    threading.Thread(target=snapshot_worker, daemon=True).start()

    # ── GPT-4 Vision worker ────────────────────────────────────────────────────
    def vision_worker() -> None:
        nonlocal last_analysis_at
        log.info("Vision worker started — first analysis in %ds", ANALYSIS_INTERVAL)
        while True:
            time.sleep(5)
            if openai_client is None:
                continue
            if time.time() - last_analysis_at < ANALYSIS_INTERVAL:
                continue
            with frame_lock:
                snapshot = latest_frame.copy() if latest_frame is not None else None
            if snapshot is None:
                continue
            log.info("Sending frame to GPT-4 Vision…")
            result = analyse_frame_with_gpt4(snapshot, openai_client)
            if result:
                log.info("Analysis → %s", result)
                try:
                    update_claude(result)
                except Exception as exc:
                    log.warning("Firebase claude update failed: %s", exc)
            last_analysis_at = time.time()

    threading.Thread(target=vision_worker, daemon=True).start()

    # ── Main capture loop ──────────────────────────────────────────────────────
    _encode_params  = [cv2.IMWRITE_JPEG_QUALITY, 70]
    _frame_interval = 1.0 / STREAM_FPS

    while True:
        ret, frame = cap.read()
        if not ret:
            log.error("Frame read failed — camera disconnected?")
            try:
                set_camera_status(False)
            except Exception:
                pass
            time.sleep(2)
            continue

        _, jpg = cv2.imencode(".jpg", frame, _encode_params)
        frame_buf.write(jpg.tobytes())

        with frame_lock:
            latest_frame = frame

        fg_mask = bg_sub.apply(frame)
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        motion_area = sum(cv2.contourArea(c) for c in contours)

        now = time.time()
        if motion_area > MOTION_THRESHOLD and (now - last_motion_at) > MOTION_COOLDOWN:
            last_motion_at = now
            ts_label = datetime.now().strftime("%H:%M")
            log.info("Motion  area=%.0fpx²  @ %s", motion_area, ts_label)

            def _write_motion(ts=ts_label):
                try:
                    push_event("motion", "Motion detected", "USB webcam · Pi")
                    increment_motion_count()
                    update_stats_last_event(f"Motion · {ts}")
                except Exception as exc:
                    log.warning("Firebase write failed: %s", exc)

            threading.Thread(target=_write_motion, daemon=True).start()

        time.sleep(_frame_interval)


# ── Entry point ────────────────────────────────────────────────────────────────
def main() -> None:
    if not OPENAI_API_KEY:
        log.warning(
            "OPENAI_API_KEY not set — GPT-4 Vision disabled. "
            "Set with:  export OPENAI_API_KEY='sk-...'"
        )

    init_firebase()

    frame_buf = FrameBuffer()
    start_mjpeg_server(frame_buf, STREAM_PORT)

    log.info("Opening camera index %d …", CAMERA_INDEX)
    cap = cv2.VideoCapture(CAMERA_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS, 30)

    if not cap.isOpened():
        log.error(
            "Cannot open camera at index %d\n"
            "  • Check USB connection\n"
            "  • Try: CAMERA_INDEX=1 python3 camera.py\n"
            "  • List devices: v4l2-ctl --list-devices",
            CAMERA_INDEX,
        )
        sys.exit(1)

    openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

    try:
        set_camera_status(True, SNAPSHOT_URL)
        log.info("Snapshot URL → %s", SNAPSHOT_URL)
        log.info("PiVision is running — press Ctrl+C to stop")
        run_camera(cap, frame_buf, openai_client)
    except KeyboardInterrupt:
        log.info("Shutting down…")
    finally:
        cap.release()
        try:
            set_camera_status(False, "")
        except Exception:
            pass
        log.info("Goodbye.")


if __name__ == "__main__":
    main()
