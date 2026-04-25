#!/usr/bin/env python3
"""
PiVision — Raspberry Pi camera script
--------------------------------------
Motion detection (OpenCV) → Firebase Realtime Database
GPT-4 Vision analysis      → Firebase /claude/lastAnalysis

Requirements:
  1. Place your Firebase service account JSON at pi/serviceAccount.json
     Generate it: Firebase Console → Project Settings → Service Accounts
                  → Generate new private key → Save as serviceAccount.json
  2. Set environment variable: export OPENAI_API_KEY="sk-..."
  3. Run: python3 camera.py

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
import logging
import threading
from datetime import datetime, timezone

import cv2
import firebase_admin
from firebase_admin import credentials, db as rtdb
from openai import OpenAI

# ── Config ─────────────────────────────────────────────────────────────────────
FIREBASE_DB_URL    = "https://pivision-28ddb-default-rtdb.firebaseio.com"
FIREBASE_PROJECT   = "pivision-28ddb"
FIREBASE_API_KEY   = "AIzaSyAv8s0vErAwc3KZaRF55isbKTzhgjuwGNE"  # web API key (for reference)
SERVICE_ACCOUNT    = os.path.join(os.path.dirname(__file__), "serviceAccount.json")

OPENAI_API_KEY     = os.environ.get("OPENAI_API_KEY", "")
CAMERA_INDEX       = int(os.environ.get("CAMERA_INDEX", "0"))
MOTION_THRESHOLD   = int(os.environ.get("MOTION_THRESHOLD", "3000"))   # px²
ANALYSIS_INTERVAL  = int(os.environ.get("ANALYSIS_INTERVAL", "60"))    # seconds
MOTION_COOLDOWN    = float(os.environ.get("MOTION_COOLDOWN", "2"))     # seconds

FRAME_WIDTH        = 1280
FRAME_HEIGHT       = 720

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("PiVision")

# ── Firebase init ──────────────────────────────────────────────────────────────
def init_firebase() -> None:
    if not os.path.exists(SERVICE_ACCOUNT):
        log.error(
            "\n"
            "  serviceAccount.json not found!\n"
            "  Generate it in 3 steps:\n"
            "    1. Go to https://console.firebase.google.com/project/pivision-28ddb/settings/serviceaccounts\n"
            "    2. Click 'Generate new private key'\n"
            "    3. Save the file as  pi/serviceAccount.json\n"
            "  Then run camera.py again.\n"
        )
        sys.exit(1)

    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
    log.info("Firebase Realtime Database connected ✓  (project: %s)", FIREBASE_PROJECT)


# ── Firebase write helpers ─────────────────────────────────────────────────────
def push_event(event_type: str, label: str, sublabel: str) -> None:
    event_id = uuid.uuid4().hex[:8]
    rtdb.reference(f"events/{event_id}").set({
        "id":        event_id,
        "timestamp": int(time.time() * 1000),   # Unix ms — matches JS Date.now()
        "type":      event_type,                 # "motion" | "object"
        "label":     label,
        "sublabel":  sublabel,
    })


def increment_motion_count() -> None:
    ref = rtdb.reference("stats/motionEvents")
    # firebase-admin doesn't expose atomic increment over REST; read-modify-write
    # is safe here because the Pi is the only writer of this field.
    current = ref.get() or 0
    ref.set(current + 1)


def update_stats_last_event(label: str) -> None:
    rtdb.reference("stats/lastEvent").set(label)


def update_claude(text: str) -> None:
    rtdb.reference("claude").set({
        "lastAnalysis": text,
        "lastUpdated":  int(time.time() * 1000),
    })


def set_camera_status(connected: bool) -> None:
    fps = 30 if connected else 0
    rtdb.reference("camera").update({
        "piConnected": connected,
        "status":      "Connected" if connected else "Disconnected",
        "fps":         fps,
        "resolution":  f"{FRAME_WIDTH // (FRAME_WIDTH // 1280) }p"
                       if connected else "—",
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
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text",      "text": VISION_PROMPT},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    ],
                }
            ],
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        log.warning("GPT-4 Vision error: %s", exc)
        return None


# ── Motion detection + main loop ───────────────────────────────────────────────
def run_camera(cap: cv2.VideoCapture, openai_client: "OpenAI | None") -> None:
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

    # ── Background thread: GPT-4 Vision every ANALYSIS_INTERVAL seconds ────────
    def vision_worker() -> None:
        nonlocal last_analysis_at
        log.info(
            "Vision worker started — first analysis in %ds", ANALYSIS_INTERVAL
        )
        while True:
            time.sleep(5)   # poll every 5 s; actual call throttled by interval
            if openai_client is None:
                continue
            now = time.time()
            if now - last_analysis_at < ANALYSIS_INTERVAL:
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

    # ── Camera read loop ────────────────────────────────────────────────────────
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

        with frame_lock:
            latest_frame = frame

        # Background subtraction → find moving contours
        fg_mask  = bg_sub.apply(frame)
        contours, _ = cv2.findContours(
            fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        motion_area = sum(cv2.contourArea(c) for c in contours)

        now = time.time()
        if motion_area > MOTION_THRESHOLD and (now - last_motion_at) > MOTION_COOLDOWN:
            last_motion_at = now
            ts_label = datetime.now().strftime("%H:%M")
            log.info("Motion  area=%.0fpx²  @ %s", motion_area, ts_label)

            # Write to Firebase in a daemon thread so the camera loop stays fast
            def _write_motion(ts=ts_label):
                try:
                    push_event("motion", "Motion detected", "USB webcam · Pi")
                    increment_motion_count()
                    update_stats_last_event(f"Motion · {ts}")
                except Exception as exc:
                    log.warning("Firebase write failed: %s", exc)

            threading.Thread(target=_write_motion, daemon=True).start()

        # ~20 fps effective rate — leaves headroom for other Pi processes
        time.sleep(0.05)


# ── Entry point ────────────────────────────────────────────────────────────────
def main() -> None:
    if not OPENAI_API_KEY:
        log.warning(
            "OPENAI_API_KEY not set — GPT-4 Vision analysis will be disabled. "
            "Set it with:  export OPENAI_API_KEY='sk-...'"
        )

    init_firebase()

    log.info("Opening camera index %d …", CAMERA_INDEX)
    cap = cv2.VideoCapture(CAMERA_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS, 30)

    if not cap.isOpened():
        log.error(
            "Cannot open camera at index %d\n"
            "  • Check USB connection\n"
            "  • Try a different index: CAMERA_INDEX=1 python3 camera.py\n"
            "  • List devices: v4l2-ctl --list-devices",
            CAMERA_INDEX,
        )
        sys.exit(1)

    openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

    try:
        set_camera_status(True)
        log.info("PiVision is running — press Ctrl+C to stop")
        run_camera(cap, openai_client)
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
