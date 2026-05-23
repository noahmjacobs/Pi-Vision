#!/usr/bin/env python3
from __future__ import annotations
"""
PiVision — Raspberry Pi camera script (Phase 2 — People Counter)
-----------------------------------------------------------------
• YOLOv8-nano person detection  → tracks individuals crossing a line
• People count                  → Firebase /stats/peopleCount
• Realtime DB snapshots         → 1 frame/second (base64 JPEG)
• MJPEG stream (LAN only)       → http://<local-ip>:8080/stream

Requirements:
  1. Place your Firebase service account JSON at pi/serviceAccount.json
  2. Run: python3 camera.py

Optional env vars:
  CAMERA_INDEX        USB camera device index (default: 0)
  YOLO_MODEL          Model weights file (default: yolov8n.pt — downloads automatically)
  YOLO_CONFIDENCE     Detection confidence threshold 0–1 (default: 0.45)
  YOLO_SKIP           Run YOLO every Nth frame (default: 2 — helps on slower hardware)
  COUNT_LINE_POS      Counting line position as fraction of frame height (default: 0.5)
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
from firebase_admin import credentials, db as rtdb
from ultralytics import YOLO

# ── Config ─────────────────────────────────────────────────────────────────────
FIREBASE_DB_URL  = "https://pivision-28ddb-default-rtdb.firebaseio.com"
FIREBASE_PROJECT = "pivision-28ddb"
SERVICE_ACCOUNT  = os.path.join(os.path.dirname(__file__), "serviceAccount.json")

CAMERA_INDEX      = int(os.environ.get("CAMERA_INDEX", "0"))
STREAM_PORT       = int(os.environ.get("STREAM_PORT", "8080"))

YOLO_MODEL      = os.environ.get("YOLO_MODEL", "yolov8n.pt")
YOLO_CONFIDENCE = float(os.environ.get("YOLO_CONFIDENCE", "0.45"))
YOLO_SKIP       = int(os.environ.get("YOLO_SKIP", "2"))
COUNT_LINE_POS  = float(os.environ.get("COUNT_LINE_POS", "0.5"))  # fraction of relevant frame dimension
COUNT_DIRECTION = os.environ.get("COUNT_DIRECTION", "down")        # down | up | right | left | both

FRAME_WIDTH  = 1280
FRAME_HEIGHT = 720
STREAM_FPS   = 15

SNAPSHOT_W = 640
SNAPSHOT_H = 360

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("PiVision")


# ── Centroid tracker ───────────────────────────────────────────────────────────
class CentroidTracker:
    """Tracks person centroids across frames and detects line crossings."""

    def __init__(self, max_disappeared: int = 30, max_distance: int = 80) -> None:
        self.next_id = 0
        self.centroids: dict[int, tuple[int, int]] = {}
        self.disappeared: dict[int, int] = {}
        self.sides: dict[int, str] = {}   # 'above' or 'below' the counting line
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
                best_j, best_d = -1, float("inf")
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

    def check_crossings(self, line_pos: int, axis: str = "y", direction: str = "down") -> int:
        """Returns number of people who crossed the line this frame.

        axis='y'  → horizontal line, tracks vertical movement (down/up)
        axis='x'  → vertical line, tracks horizontal movement (right/left)
        direction: down | up | right | left | both
        """
        count = 0
        for oid, (cx, cy) in self.centroids.items():
            pos  = cy if axis == "y" else cx
            side = "before" if pos < line_pos else "after"
            prev = self.sides.get(oid)
            if prev is not None and prev != side:
                if direction == "both":
                    count += 1
                elif direction in ("down", "right") and prev == "before" and side == "after":
                    count += 1
                elif direction in ("up", "left") and prev == "after" and side == "before":
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
    firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
    log.info("Firebase connected ✓  (project: %s)", FIREBASE_PROJECT)


# ── Firebase helpers ───────────────────────────────────────────────────────────
def push_event(event_type: str, label: str, sublabel: str) -> None:
    event_id = uuid.uuid4().hex[:8]
    rtdb.reference(f"events/{event_id}").set({
        "id":        event_id,
        "timestamp": int(time.time() * 1000),
        "type":      event_type,
        "label":     label,
        "sublabel":  sublabel,
    })


def update_people_count(count: int) -> None:
    rtdb.reference("stats/peopleCount").set(count)


def update_stats_last_event(label: str) -> None:
    rtdb.reference("stats/lastEvent").set(label)


def increment_daily_count(crossings: int) -> None:
    """Reads counts/{YYYY-MM-DD}/total and increments it by crossings."""
    date_key = datetime.now().strftime("%Y-%m-%d")
    path = f"counts/{date_key}/total"
    try:
        current = rtdb.reference(path).get() or 0
        rtdb.reference(path).set(current + crossings)
    except Exception as exc:
        log.warning("Daily count update failed: %s", exc)


def load_firebase_config() -> dict:
    """Reads config node from Firebase and returns it as a dict."""
    try:
        result = rtdb.reference("config").get()
        if isinstance(result, dict):
            return result
        return {}
    except Exception as exc:
        log.warning("Failed to load Firebase config: %s", exc)
        return {}


def set_camera_status(connected: bool) -> None:
    update: dict = {
        "piConnected": connected,
        "status":      "Connected" if connected else "Disconnected",
        "fps":         1 if connected else 0,
        "resolution":  "720p" if connected else "—",
    }
    if connected:
        update["sessionStart"] = int(time.time() * 1000)
    else:
        update["sessionStart"] = 0  # stops uptime counter on dashboard
    rtdb.reference("camera").update(update)
    if not connected:
        rtdb.reference("camera/snapshot").set("")
        rtdb.reference("stats/peopleCount").set(0)


# ── Camera + people counting loop ─────────────────────────────────────────────
def run_camera(cap: cv2.VideoCapture, frame_buf: FrameBuffer) -> None:
    log.info(
        "Loading YOLO model: %s  (confidence=%.2f  skip=%d  line=%.0f%%)",
        YOLO_MODEL, YOLO_CONFIDENCE, YOLO_SKIP, COUNT_LINE_POS * 100,
    )
    model     = YOLO(YOLO_MODEL)
    tracker   = CentroidTracker()
    axis      = "x" if COUNT_DIRECTION in ("left", "right") else "y"
    line_pos  = int((FRAME_WIDTH if axis == "x" else FRAME_HEIGHT) * COUNT_LINE_POS)

    people_count = 0
    latest_frame = None
    frame_lock   = threading.Lock()

    log.info(
        "People counter ready — %s line at %d px  direction=%s",
        "vertical" if axis == "x" else "horizontal", line_pos, COUNT_DIRECTION,
    )

    # ── Snapshot worker: 1 frame/second → Realtime Database ───────────────────
    def snapshot_worker() -> None:
        log.info("Snapshot worker started — pushing 1 frame/second to Firebase")
        while True:
            time.sleep(1)
            with frame_lock:
                f = latest_frame.copy() if latest_frame is not None else None
            if f is None:
                continue
            # Draw counting line so users can see it on the dashboard
            annotated = f.copy()
            if axis == "x":
                cv2.line(annotated, (line_pos, 0), (line_pos, FRAME_HEIGHT), (0, 200, 255), 2)
            else:
                cv2.line(annotated, (0, line_pos), (FRAME_WIDTH, line_pos), (0, 200, 255), 2)
            small = cv2.resize(annotated, (SNAPSHOT_W, SNAPSHOT_H))
            _, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 60])
            b64 = base64.b64encode(buf).decode("utf-8")
            try:
                rtdb.reference("camera/snapshot").set(b64)
            except Exception as exc:
                log.warning("Snapshot write failed: %s", exc)

    threading.Thread(target=snapshot_worker, daemon=True).start()

    # ── Main capture + detection loop ─────────────────────────────────────────
    _encode_params  = [cv2.IMWRITE_JPEG_QUALITY, 70]
    _frame_interval = 1.0 / STREAM_FPS
    frame_num       = 0

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

        frame_num += 1
        if frame_num % YOLO_SKIP == 0:
            results   = model(frame, classes=[0], conf=YOLO_CONFIDENCE, verbose=False)
            centroids = []
            for box in results[0].boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                centroids.append(((x1 + x2) // 2, (y1 + y2) // 2))

            tracker.update(centroids)
            crossings = tracker.check_crossings(line_pos, axis=axis, direction=COUNT_DIRECTION)

            if crossings > 0:
                people_count += crossings
                ts_label = datetime.now().strftime("%H:%M")
                log.info("Person crossed line  total=%d  @ %s", people_count, ts_label)

                def _write_person(count=people_count, ts=ts_label, cx=crossings):
                    try:
                        push_event("person", "Person counted", f"Crossed line · {ts}")
                        update_people_count(count)
                        update_stats_last_event(f"Person · {ts}")
                        increment_daily_count(cx)
                    except Exception as exc:
                        log.warning("Firebase write failed: %s", exc)

                threading.Thread(target=_write_person, daemon=True).start()

        time.sleep(_frame_interval)


# ── Entry point ────────────────────────────────────────────────────────────────
def main() -> None:
    init_firebase()

    # Load config from Firebase and override defaults if present
    fb_config = load_firebase_config()
    global COUNT_LINE_POS, YOLO_CONFIDENCE, COUNT_DIRECTION
    if "linePosition" in fb_config:
        COUNT_LINE_POS = float(fb_config["linePosition"]) / 100.0
        log.info("Firebase config: linePosition=%.2f", COUNT_LINE_POS)
    if "confidence" in fb_config:
        YOLO_CONFIDENCE = float(fb_config["confidence"]) / 100.0
        log.info("Firebase config: confidence=%.2f", YOLO_CONFIDENCE)
    if "countDirection" in fb_config:
        COUNT_DIRECTION = str(fb_config["countDirection"])
        log.info("Firebase config: countDirection=%s", COUNT_DIRECTION)

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

    try:
        set_camera_status(True)
        log.info("PiVision is running — press Ctrl+C to stop")
        run_camera(cap, frame_buf)
    except KeyboardInterrupt:
        log.info("Shutting down…")
    finally:
        cap.release()
        try:
            set_camera_status(False)
        except Exception:
            pass
        log.info("Goodbye.")


if __name__ == "__main__":
    main()
