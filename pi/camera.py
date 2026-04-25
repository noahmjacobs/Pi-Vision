#!/usr/bin/env python3
"""
PiVision — Raspberry Pi camera script
--------------------------------------
• Motion detection (OpenCV) → Firebase Realtime Database
• MJPEG stream server        → port 8080, URL written to /camera/streamUrl
• GPT-4 Vision analysis      → Firebase /claude/lastAnalysis

Requirements:
  1. Place your Firebase service account JSON at pi/serviceAccount.json
  2. Set environment variable: export OPENAI_API_KEY="sk-..."
  3. Run: python3 camera.py

Optional env vars:
  CAMERA_INDEX        USB camera device index (default: 0)
  STREAM_PORT         MJPEG HTTP server port (default: 8080)
  MOTION_THRESHOLD    Min contour area in px² to count as motion (default: 3000)
  ANALYSIS_INTERVAL   Seconds between GPT-4 Vision calls (default: 60)
  MOTION_COOLDOWN     Min seconds between consecutive motion events (default: 2)
  STREAM_HOST         Override public host/IP written to Firebase (optional)
"""

import os
import sys
import time
import uuid
import json
import base64
import socket
import logging
import threading
import subprocess
import http.server
import socketserver
import urllib.request
from datetime import datetime

import cv2
import firebase_admin
from firebase_admin import credentials, db as rtdb
from openai import OpenAI

# ── Config ─────────────────────────────────────────────────────────────────────
FIREBASE_DB_URL   = "https://pivision-28ddb-default-rtdb.firebaseio.com"
FIREBASE_PROJECT  = "pivision-28ddb"
FIREBASE_API_KEY  = "AIzaSyAv8s0vErAwc3KZaRF55isbKTzhgjuwGNE"
SERVICE_ACCOUNT   = os.path.join(os.path.dirname(__file__), "serviceAccount.json")

OPENAI_API_KEY    = os.environ.get("OPENAI_API_KEY", "")
CAMERA_INDEX      = int(os.environ.get("CAMERA_INDEX", "0"))
STREAM_PORT       = int(os.environ.get("STREAM_PORT", "8080"))
MOTION_THRESHOLD  = int(os.environ.get("MOTION_THRESHOLD", "3000"))
ANALYSIS_INTERVAL = int(os.environ.get("ANALYSIS_INTERVAL", "60"))
MOTION_COOLDOWN   = float(os.environ.get("MOTION_COOLDOWN", "2"))
STREAM_HOST       = os.environ.get("STREAM_HOST", "")   # optional override

FRAME_WIDTH  = 1280
FRAME_HEIGHT = 720
STREAM_FPS   = 15   # MJPEG stream target frame rate

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("PiVision")


# ── MJPEG frame buffer ─────────────────────────────────────────────────────────
class FrameBuffer:
    """Thread-safe store for the latest JPEG-encoded frame."""

    def __init__(self) -> None:
        self._jpeg: bytes | None = None
        self._lock = threading.Lock()

    def write(self, jpeg_bytes: bytes) -> None:
        with self._lock:
            self._jpeg = jpeg_bytes

    def read(self) -> bytes | None:
        with self._lock:
            return self._jpeg


# ── MJPEG HTTP server ──────────────────────────────────────────────────────────
BOUNDARY = b"--piboundary"

class MJPEGHandler(http.server.BaseHTTPRequestHandler):
    """Serves a continuous MJPEG stream at / and /stream."""

    def do_GET(self) -> None:
        if self.path not in ("/", "/stream"):
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=piboundary")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.end_headers()

        interval = 1.0 / STREAM_FPS
        try:
            while True:
                frame = self.server.frame_buf.read()   # type: ignore[attr-defined]
                if frame is None:
                    time.sleep(0.05)
                    continue
                header = (
                    BOUNDARY + b"\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame)).encode() + b"\r\n"
                    b"\r\n"
                )
                self.wfile.write(header + frame + b"\r\n")
                self.wfile.flush()
                time.sleep(interval)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def log_message(self, *_) -> None:  # silence per-request access logs
        pass


class _ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    frame_buf: FrameBuffer


def start_mjpeg_server(frame_buf: FrameBuffer, port: int) -> None:
    server = _ThreadingServer(("", port), MJPEGHandler)
    server.frame_buf = frame_buf
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log.info("MJPEG stream server running on port %d  →  /stream", port)


# ── Network helpers ────────────────────────────────────────────────────────────
def get_local_ip() -> str:
    """Return the Pi's LAN IP by probing a UDP socket (no packet sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


# ── ngrok Tunnel (auto HTTPS) ─────────────────────────────────────────────────
def start_ngrok_tunnel(port: int, wait: float = 15.0) -> str | None:
    """
    Launch `ngrok http <port>` and return the public HTTPS URL by querying
    ngrok's local API at http://localhost:4040/api/tunnels.
    Returns None if ngrok is not installed or no URL appears within `wait` s.
    """
    try:
        subprocess.Popen(
            ["ngrok", "http", str(port)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        log.info("ngrok not installed — using local IP (stream embeds only on same network)")
        return None
    except Exception as exc:
        log.warning("ngrok launch error: %s", exc)
        return None

    deadline = time.time() + wait
    while time.time() < deadline:
        time.sleep(1)
        try:
            with urllib.request.urlopen("http://localhost:4040/api/tunnels", timeout=2) as r:
                data = json.loads(r.read())
                for t in data.get("tunnels", []):
                    if t.get("proto") == "https":
                        url = t["public_url"] + "/stream"
                        log.info("ngrok tunnel active → %s", url)
                        return url
        except Exception:
            continue

    log.warning("ngrok started but no HTTPS URL appeared within %ds", int(wait))
    return None


# ── Firebase init ──────────────────────────────────────────────────────────────
def init_firebase() -> None:
    if not os.path.exists(SERVICE_ACCOUNT):
        log.error(
            "\n"
            "  serviceAccount.json not found!\n"
            "  Generate it:\n"
            "    1. https://console.firebase.google.com/project/pivision-28ddb/settings/serviceaccounts\n"
            "    2. Click 'Generate new private key'\n"
            "    3. Save as pi/serviceAccount.json\n"
        )
        sys.exit(1)

    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
    log.info("Firebase connected ✓  (project: %s)", FIREBASE_PROJECT)


# ── Firebase write helpers ─────────────────────────────────────────────────────
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


def set_camera_status(connected: bool, stream_url: str = "") -> None:
    rtdb.reference("camera").update({
        "piConnected": connected,
        "status":      "Connected" if connected else "Disconnected",
        "fps":         STREAM_FPS if connected else 0,
        "resolution":  "1080p" if connected else "—",
        "streamUrl":   stream_url,
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
def run_camera(
    cap: cv2.VideoCapture,
    frame_buf: FrameBuffer,
    openai_client: "OpenAI | None",
) -> None:
    log.info(
        "Motion detection started  (threshold=%dpx²  analysis_interval=%ds)",
        MOTION_THRESHOLD, ANALYSIS_INTERVAL,
    )

    bg_sub = cv2.createBackgroundSubtractorMOG2(
        history=500, varThreshold=50, detectShadows=False
    )

    last_motion_at   = 0.0
    last_analysis_at = 0.0
    latest_frame     = None
    frame_lock       = threading.Lock()

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
    _encode_params = [cv2.IMWRITE_JPEG_QUALITY, 70]
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

        # ── Push JPEG into stream buffer (powers the MJPEG server) ──────────
        _, jpg = cv2.imencode(".jpg", frame, _encode_params)
        frame_buf.write(jpg.tobytes())

        # ── Store raw frame for GPT-4 Vision ──────────────────────────────
        with frame_lock:
            latest_frame = frame

        # ── Motion detection ────────────────────────────────────────────────
        fg_mask = bg_sub.apply(frame)
        contours, _ = cv2.findContours(
            fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
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

    # Start MJPEG server before opening the camera so the port is ready
    frame_buf = FrameBuffer()
    start_mjpeg_server(frame_buf, STREAM_PORT)

    # Determine stream URL to publish to Firebase.
    # Priority: STREAM_HOST env var → ngrok tunnel (HTTPS) → local IP (HTTP)
    if STREAM_HOST:
        stream_url = f"http://{STREAM_HOST}:{STREAM_PORT}/stream"
    else:
        log.info("Starting ngrok tunnel for HTTPS stream URL…")
        tunnel_url = start_ngrok_tunnel(STREAM_PORT)
        if tunnel_url:
            stream_url = tunnel_url
        else:
            host = get_local_ip()
            stream_url = f"http://{host}:{STREAM_PORT}/stream"
            log.info("Falling back to local stream URL: %s", stream_url)

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
        set_camera_status(True, stream_url)
        log.info("Stream URL written to Firebase → %s", stream_url)
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
