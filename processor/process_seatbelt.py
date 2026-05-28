#!/usr/bin/env python3
"""
PiVision Seatbelt Compliance Processor
----------------------------------------
Processes roadside camera footage to detect vehicles passing through frame
and assess front-seat seatbelt compliance.

Pipeline per video:
  1. Detect + track vehicles frame-by-frame (YOLOv8 COCO)
  2. For each tracked vehicle, analyze the windshield region:
       - Count front-seat occupants (person detection)
       - Check for phone use -> driverDistracted flag
       - Classify seatbelt status (requires seatbelt1.pt in processor/ folder)
  3. When vehicle exits frame, check movement direction — skip if wrong direction
  4. Finalize and upload one DBVehicleEvent to Firebase
  5. Update aggregate stats: totalVehicles, compliantVehicles, distractedVehicles

Firebase schema written:
  companies/{companyId}/devices/{deviceId}/events/{id}  ->  DBVehicleEvent
  companies/{companyId}/devices/{deviceId}/stats         ->  DBSeatbeltStats
  companies/{companyId}/processed/{fhash}                ->  duplicate-check record
"""

from __future__ import annotations

import hashlib
import os
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import cv2
import requests
from ultralytics import YOLO

# ── Firebase config (mirrors app.py) ──────────────────────────────────────────
FIREBASE_API_KEY = 'AIzaSyAv8s0vErAwc3KZaRF55isbKTzhgjuwGNE'
FIREBASE_DB_URL  = 'https://pivision-28ddb-default-rtdb.firebaseio.com'


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


def file_hash(path: str, size: int) -> str:
    return hashlib.md5(f'{Path(path).name}:{size}'.encode()).hexdigest()[:16]


# ── COCO class IDs ─────────────────────────────────────────────────────────────
COCO_VEHICLES = {2: 'car', 5: 'van', 7: 'truck'}
COCO_PERSON   = 0
COCO_PHONE    = 67

VEHICLE_CONF  = 0.40
PERSON_CONF   = 0.30
PHONE_CONF    = 0.35
YOLO_SKIP     = 3

# Minimum horizontal pixel movement to classify direction (avoids noise from parked cars)
DIRECTION_THRESHOLD = 40


# ── Seatbelt model ─────────────────────────────────────────────────────────────
# Drop seatbelt1.pt into the processor/ folder to enable live seatbelt detection.
# Without it the code falls back to returning 'none' (stub).
SEATBELT_MODEL_PATH = Path(__file__).parent / 'seatbelt1.pt'

def detect_seatbelts(frame, vehicle_bbox, occupants: int) -> str:
    """Returns 'both' | 'driver' | 'passenger' | 'none'. Uses seatbelt1.pt if present."""
    if SEATBELT_MODEL_PATH.exists():
        try:
            model  = YOLO(str(SEATBELT_MODEL_PATH))
            crop   = windshield_crop(frame, vehicle_bbox)
            if crop is None:
                return 'none'
            h, w   = crop.shape[:2]
            d_crop = crop[:, :w // 2]
            p_crop = crop[:, w // 2:]

            def has_belt(region):
                if region.size == 0:
                    return False
                res = model(region, conf=0.35, verbose=False)
                return any(int(b.cls) == 0 for b in res[0].boxes)

            driver_belted = has_belt(d_crop)
            if occupants == 1:
                return 'driver' if driver_belted else 'none'
            passenger_belted = has_belt(p_crop)
            if driver_belted and passenger_belted:
                return 'both'
            if driver_belted:
                return 'driver'
            if passenger_belted:
                return 'passenger'
            return 'none'
        except Exception:
            pass
    return 'none'


# ── Windshield crop helper ─────────────────────────────────────────────────────
def windshield_crop(frame, bbox):
    """Crop the upper 55% of a vehicle bounding box (windshield + occupant area)."""
    x1, y1, x2, y2 = [int(v) for v in bbox]
    fh, fw = frame.shape[:2]
    x1 = max(0, x1)
    x2 = min(fw, x2)
    y1 = max(0, y1)
    crop_y2 = min(fh, y1 + int((y2 - y1) * 0.55))
    if x2 <= x1 or crop_y2 <= y1:
        return None
    return frame[y1:crop_y2, x1:x2]


# ── Vehicle type classifier ────────────────────────────────────────────────────
def classify_vehicle_type(coco_class: int, x1, y1, x2, y2) -> str:
    if coco_class == 7:
        return 'truck'
    if coco_class == 5:
        return 'van'
    w, h = x2 - x1, y2 - y1
    if w > 0 and h / w > 0.65 and w * h > 15000:
        return 'suv'
    return 'car'


# ── Per-vehicle state accumulator ─────────────────────────────────────────────
class VehicleRecord:
    def __init__(self):
        self.type_votes:    list[str] = []
        self.occupant_vals: list[int] = []
        self.belt_votes:    list[str] = []
        self.distracted:    int       = 0
        self.frame_count:   int       = 0
        self.first_cx:      float | None = None
        self.last_cx:       float        = 0.0

    def add(self, vtype: str, occupants: int, seatbelts: str, phone: bool, cx: float = 0.0) -> None:
        self.type_votes.append(vtype)
        self.occupant_vals.append(occupants)
        self.belt_votes.append(seatbelts)
        if phone:
            self.distracted += 1
        self.frame_count += 1
        if self.first_cx is None:
            self.first_cx = cx
        self.last_cx = cx

    def finalize(self) -> dict | None:
        if self.frame_count < 2:
            return None
        vtype     = Counter(self.type_votes).most_common(1)[0][0]
        occupants = max(1, min(2, round(
            sum(self.occupant_vals) / len(self.occupant_vals)
        )))
        seatbelts = Counter(self.belt_votes).most_common(1)[0][0] if self.belt_votes else 'none'
        distracted = self.frame_count > 0 and (self.distracted / self.frame_count) > 0.25
        dx = self.last_cx - (self.first_cx if self.first_cx is not None else self.last_cx)
        if dx > DIRECTION_THRESHOLD:
            movement = 'right'
        elif dx < -DIRECTION_THRESHOLD:
            movement = 'left'
        else:
            movement = 'stationary'
        return {
            'vehicleType':      vtype,
            'occupants':        occupants,
            'seatbelts':        seatbelts,
            'driverDistracted': bool(distracted),
            'movement':         movement,
        }


# ── Minimal centroid tracker ───────────────────────────────────────────────────
class VehicleTracker:
    def __init__(self, max_disappeared: int = 20, max_distance: int = 120):
        self.next_id        = 0
        self.centroids:     dict[int, tuple] = {}
        self.disappeared:   dict[int, int]   = {}
        self.records:       dict[int, VehicleRecord] = {}
        self.max_disappeared = max_disappeared
        self.max_distance    = max_distance

    def update(self, detections: list[tuple]) -> tuple[set[int], list[dict]]:
        finalized: list[dict] = []

        if not detections:
            for oid in list(self.disappeared):
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    result = self.records[oid].finalize()
                    if result:
                        finalized.append(result)
                    del self.centroids[oid]
                    del self.disappeared[oid]
                    del self.records[oid]
            return set(self.centroids.keys()), finalized

        if not self.centroids:
            for cx, cy, vtype, occ, belt, phone, bbox in detections:
                self._register(cx, cy, vtype, occ, belt, phone)
        else:
            ids      = list(self.centroids)
            existing = [self.centroids[i] for i in ids]
            used_ex: set[int]  = set()
            used_new: set[int] = set()

            for ni, (cx, cy, *_rest) in enumerate(detections):
                best_j, best_d = -1, float('inf')
                for ej, (ex, ey) in enumerate(existing):
                    if ej in used_ex:
                        continue
                    d = ((cx - ex) ** 2 + (cy - ey) ** 2) ** 0.5
                    if d < best_d:
                        best_d, best_j = d, ej
                if best_j >= 0 and best_d < self.max_distance:
                    oid = ids[best_j]
                    self.centroids[oid]   = (cx, cy)
                    self.disappeared[oid] = 0
                    vtype, occ, belt, phone = detections[ni][2:6]
                    self.records[oid].add(vtype, occ, belt, phone, cx)
                    used_ex.add(best_j)
                    used_new.add(ni)

            for ej, oid in enumerate(ids):
                if ej not in used_ex:
                    self.disappeared[oid] += 1
                    if self.disappeared[oid] > self.max_disappeared:
                        result = self.records[oid].finalize()
                        if result:
                            finalized.append(result)
                        del self.centroids[oid]
                        del self.disappeared[oid]
                        del self.records[oid]

            for ni, det in enumerate(detections):
                if ni not in used_new:
                    cx, cy, vtype, occ, belt, phone, _ = det
                    self._register(cx, cy, vtype, occ, belt, phone)

        return set(self.centroids.keys()), finalized

    def _register(self, cx, cy, vtype, occ, belt, phone):
        self.centroids[self.next_id]   = (cx, cy)
        self.disappeared[self.next_id] = 0
        rec = VehicleRecord()
        rec.add(vtype, occ, belt, phone, cx)
        self.records[self.next_id] = rec
        self.next_id += 1

    def flush(self) -> list[dict]:
        results = []
        for oid in list(self.records):
            result = self.records[oid].finalize()
            if result:
                results.append(result)
        self.centroids.clear()
        self.disappeared.clear()
        self.records.clear()
        return results


# ── Compliance check ───────────────────────────────────────────────────────────
def is_compliant(event: dict) -> bool:
    occ   = event['occupants']
    belts = event['seatbelts']
    if occ == 1:
        return belts in ('driver', 'both')
    return belts == 'both'


# ── Main processing entry point ────────────────────────────────────────────────
def run_seatbelt_processing(
    video_path: str,
    company_id: str,
    device_id:  str,
    token:      str,
    progress_cb,
    log_cb,
    done_cb,
    vehicle_direction: str = 'both',
):
    try:
        cap   = cv2.VideoCapture(video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps   = cap.get(cv2.CAP_PROP_FPS) or 30

        log_cb(f'Video: {Path(video_path).name}')
        log_cb(f'  {int(cap.get(3))}x{int(cap.get(4))}  {fps:.0f}fps  {total} frames')
        dir_label = {'right': 'left→right only', 'left': 'right→left only', 'both': 'both directions'}
        log_cb(f'  Traffic direction filter: {dir_label.get(vehicle_direction, vehicle_direction)}')
        log_cb('Loading detection model...')

        import sys as _sys
        _bundled = Path(_sys._MEIPASS) / 'yolov8m.pt' if getattr(_sys, 'frozen', False) else Path('yolov8m.pt')
        model   = YOLO(str(_bundled) if _bundled.exists() else 'yolov8m.pt')
        tracker = VehicleTracker()

        file_mtime  = os.path.getmtime(video_path)
        record_date = datetime.fromtimestamp(file_mtime, tz=timezone.utc)

        log_cb('Processing frames...')

        vehicles_total      = 0
        vehicles_compliant  = 0
        vehicles_distracted = 0
        vehicles_skipped    = 0
        pending_events:     list[dict] = []
        frame_num           = 0
        last_event          = ''

        def process_finalized(finalized_list: list[dict]) -> None:
            nonlocal vehicles_total, vehicles_compliant, vehicles_distracted, vehicles_skipped, last_event
            for result in finalized_list:
                # Direction filter — skip vehicles moving the wrong way
                if vehicle_direction != 'both':
                    movement = result.get('movement', 'stationary')
                    if movement != vehicle_direction:
                        vehicles_skipped += 1
                        continue

                vehicles_total += 1
                compliant = is_compliant(result)
                if compliant:
                    vehicles_compliant += 1
                if result['driverDistracted']:
                    vehicles_distracted += 1

                frame_ts = (
                    record_date.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
                    + frame_num / fps
                )
                ts_ms    = int(frame_ts * 1000)
                ts_label = datetime.fromtimestamp(frame_ts).strftime('%H:%M')
                event_id = uuid.uuid4().hex[:8]

                event = {
                    'id':               event_id,
                    'timestamp':        ts_ms,
                    'type':             'vehicle',
                    'vehicleType':      result['vehicleType'],
                    'occupants':        result['occupants'],
                    'seatbelts':        result['seatbelts'],
                    'driverDistracted': result['driverDistracted'],
                }
                pending_events.append(event)
                last_event = f'{result["vehicleType"].title()} · {ts_label}'
                log_cb(f'  Vehicle: {result["vehicleType"]}, {result["occupants"]} occ, '
                       f'belts={result["seatbelts"]}, dist={result["driverDistracted"]}, '
                       f'dir={result["movement"]}')

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_num += 1
            progress_cb(frame_num / total, vehicles_total)

            if frame_num % YOLO_SKIP != 0:
                continue

            results = model(
                frame,
                classes=list(COCO_VEHICLES.keys()) + [COCO_PERSON, COCO_PHONE],
                conf=0.30,
                verbose=False,
            )

            boxes = results[0].boxes

            vehicle_boxes: list[tuple] = []
            person_boxes:  list[tuple] = []
            phone_boxes:   list[tuple] = []

            for b in boxes:
                cls  = int(b.cls)
                conf = float(b.conf)
                x1, y1, x2, y2 = [float(v) for v in b.xyxy[0]]
                if cls in COCO_VEHICLES and conf >= VEHICLE_CONF:
                    vehicle_boxes.append((x1, y1, x2, y2, cls))
                elif cls == COCO_PERSON and conf >= PERSON_CONF:
                    person_boxes.append((x1, y1, x2, y2))
                elif cls == COCO_PHONE and conf >= PHONE_CONF:
                    phone_boxes.append((x1, y1, x2, y2))

            detections: list[tuple] = []
            for (vx1, vy1, vx2, vy2, vcls) in vehicle_boxes:
                cx = (vx1 + vx2) / 2
                cy = (vy1 + vy2) / 2

                vtype = classify_vehicle_type(vcls, vx1, vy1, vx2, vy2)

                vh  = vy2 - vy1
                occ = 0
                for (px1, py1, px2, py2) in person_boxes:
                    pcx = (px1 + px2) / 2
                    pcy = (py1 + py2) / 2
                    if vx1 < pcx < vx2 and vy1 < pcy < vy1 + vh * 0.6:
                        occ += 1
                occ = max(1, min(2, occ)) if occ > 0 else 1

                phone_detected = False
                driver_x_max   = vx1 + (vx2 - vx1) * 0.55
                for (phx1, phy1, phx2, phy2) in phone_boxes:
                    phcx = (phx1 + phx2) / 2
                    phcy = (phy1 + phy2) / 2
                    if vx1 < phcx < driver_x_max and vy1 < phcy < vy2:
                        phone_detected = True
                        break

                seatbelts = detect_seatbelts(frame, (vx1, vy1, vx2, vy2), occ)

                detections.append((cx, cy, vtype, occ, seatbelts, phone_detected, (vx1, vy1, vx2, vy2)))

            _, finalized = tracker.update(detections)
            process_finalized(finalized)

        cap.release()

        final_flush = tracker.flush()
        process_finalized(final_flush)

        log_cb(f'Complete — {vehicles_total} vehicles counted, {vehicles_skipped} skipped (wrong direction)')
        if vehicles_total > 0:
            pct = int(vehicles_compliant / vehicles_total * 100)
            log_cb(f'  Compliance: {pct}%  ({vehicles_compliant}/{vehicles_total})')
            log_cb(f'  Distracted: {vehicles_distracted}')

        log_cb(f'Writing {len(pending_events)} events to Firebase...')
        base = f'companies/{company_id}/devices/{device_id}'
        for event in pending_events:
            fb_put(f'{base}/events/{event["id"]}', event, token)

        fb_patch(f'{base}/stats', {
            'totalVehicles':      vehicles_total,
            'compliantVehicles':  vehicles_compliant,
            'distractedVehicles': vehicles_distracted,
            'lastEvent':          last_event,
        }, token)

        size  = os.path.getsize(video_path)
        fhash = file_hash(video_path, size)
        fb_put(f'companies/{company_id}/processed/{fhash}', {
            'filename':    Path(video_path).name,
            'size':        size,
            'location':    device_id,
            'processedAt': int(time.time() * 1000),
            'vehicleCount': vehicles_total,
        }, token)

        log_cb('Results are live in PiVision Analytics!')
        done_cb(True, vehicles_total)

    except Exception as e:
        log_cb(f'Error: {e}')
        done_cb(False, 0)
