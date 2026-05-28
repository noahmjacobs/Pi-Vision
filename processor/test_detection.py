#!/usr/bin/env python3
"""
Quick test script — run vehicle type + occupant count detection on a video file.
No Firebase, no seatbelt detection. Just prints results and saves an annotated video.

Usage:
    python test_detection.py path/to/video.mp4
"""

import sys
from collections import Counter
from pathlib import Path

import cv2
from ultralytics import YOLO

COCO_VEHICLES = {2: 'car', 5: 'van', 7: 'truck'}
COCO_PERSON   = 0

VEHICLE_CONF  = 0.40
PERSON_CONF   = 0.30
YOLO_SKIP     = 3

COLORS = {
    'car':   (100, 220, 100),
    'suv':   (100, 180, 255),
    'truck': (80,  80,  255),
    'van':   (255, 180,  60),
}


def classify_vehicle_type(coco_class, x1, y1, x2, y2):
    if coco_class == 7:
        return 'truck'
    if coco_class == 5:
        return 'van'
    w, h = x2 - x1, y2 - y1
    if w > 0 and h / w > 0.65 and w * h > 15000:
        return 'suv'
    return 'car'


class SimpleTracker:
    def __init__(self, max_disappeared=20, max_distance=120):
        self.next_id = 0
        self.centroids = {}
        self.disappeared = {}
        self.type_votes = {}
        self.occ_vals = {}
        self.frame_counts = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def update(self, detections):
        finalized = []

        if not detections:
            for oid in list(self.disappeared):
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    finalized.append(self._finalize(oid))
                    self._delete(oid)
            return finalized

        if not self.centroids:
            for cx, cy, vtype, occ in detections:
                self._register(cx, cy, vtype, occ)
        else:
            ids = list(self.centroids)
            existing = [self.centroids[i] for i in ids]
            used_ex = set()
            used_new = set()

            for ni, (cx, cy, vtype, occ) in enumerate(detections):
                best_j, best_d = -1, float('inf')
                for ej, (ex, ey) in enumerate(existing):
                    if ej in used_ex:
                        continue
                    d = ((cx - ex) ** 2 + (cy - ey) ** 2) ** 0.5
                    if d < best_d:
                        best_d, best_j = d, ej
                if best_j >= 0 and best_d < self.max_distance:
                    oid = ids[best_j]
                    self.centroids[oid] = (cx, cy)
                    self.disappeared[oid] = 0
                    self.type_votes[oid].append(vtype)
                    self.occ_vals[oid].append(occ)
                    self.frame_counts[oid] += 1
                    used_ex.add(best_j)
                    used_new.add(ni)

            for ej, oid in enumerate(ids):
                if ej not in used_ex:
                    self.disappeared[oid] += 1
                    if self.disappeared[oid] > self.max_disappeared:
                        finalized.append(self._finalize(oid))
                        self._delete(oid)

            for ni, det in enumerate(detections):
                if ni not in used_new:
                    self._register(*det)

        return finalized

    def flush(self):
        results = []
        for oid in list(self.centroids):
            if self.frame_counts.get(oid, 0) >= 2:
                results.append(self._finalize(oid))
            self._delete(oid)
        return results

    def _register(self, cx, cy, vtype, occ):
        self.centroids[self.next_id] = (cx, cy)
        self.disappeared[self.next_id] = 0
        self.type_votes[self.next_id] = [vtype]
        self.occ_vals[self.next_id] = [occ]
        self.frame_counts[self.next_id] = 1
        self.next_id += 1

    def _finalize(self, oid):
        if self.frame_counts.get(oid, 0) < 2:
            return None
        vtype = Counter(self.type_votes[oid]).most_common(1)[0][0]
        occ = max(1, min(2, round(sum(self.occ_vals[oid]) / len(self.occ_vals[oid]))))
        return {'id': oid, 'vehicleType': vtype, 'occupants': occ}

    def _delete(self, oid):
        self.centroids.pop(oid, None)
        self.disappeared.pop(oid, None)
        self.type_votes.pop(oid, None)
        self.occ_vals.pop(oid, None)
        self.frame_counts.pop(oid, None)


def run(video_path: str):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f'Could not open video: {video_path}')
        sys.exit(1)

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps   = cap.get(cv2.CAP_PROP_FPS) or 30
    w     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    out_path = Path(video_path).stem + '_annotated.mp4'
    out = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))

    print(f'Video: {Path(video_path).name}  ({w}x{h}  {fps:.0f}fps  {total} frames)')
    print('Loading YOLOv8 Medium...')

    model   = YOLO('yolov8m.pt')
    tracker = SimpleTracker()

    results_log = []
    frame_num   = 0
    last_frame  = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_num += 1
        last_frame = frame.copy()

        if frame_num % 50 == 0:
            print(f'  {frame_num}/{total} frames...')

        if frame_num % YOLO_SKIP != 0:
            out.write(frame)
            continue

        results = model(
            frame,
            classes=list(COCO_VEHICLES.keys()) + [COCO_PERSON],
            conf=0.28,
            verbose=False,
        )

        boxes = results[0].boxes
        vehicle_dets = []
        person_boxes = []

        for b in boxes:
            cls  = int(b.cls)
            conf = float(b.conf)
            x1, y1, x2, y2 = [float(v) for v in b.xyxy[0]]
            if cls in COCO_VEHICLES and conf >= VEHICLE_CONF:
                vehicle_dets.append((x1, y1, x2, y2, cls))
            elif cls == COCO_PERSON and conf >= PERSON_CONF:
                person_boxes.append((x1, y1, x2, y2))

        tracker_input = []
        for (vx1, vy1, vx2, vy2, vcls) in vehicle_dets:
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

            tracker_input.append((cx, cy, vtype, occ))

            # Draw vehicle box
            color = COLORS.get(vtype, (200, 200, 200))
            cv2.rectangle(frame, (int(vx1), int(vy1)), (int(vx2), int(vy2)), color, 2)
            label = f'{vtype}  {occ}p'
            cv2.putText(frame, label, (int(vx1), int(vy1) - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        # Draw person boxes (small blue)
        for (px1, py1, px2, py2) in person_boxes:
            cv2.rectangle(frame, (int(px1), int(py1)), (int(px2), int(py2)), (255, 180, 0), 1)

        finalized = tracker.update(tracker_input)
        for r in finalized:
            if r:
                results_log.append(r)
                print(f'  >> Vehicle #{r["id"]+1}: {r["vehicleType"].upper()}  {r["occupants"]} occupant(s)')

        out.write(frame)

    cap.release()

    final = tracker.flush()
    for r in final:
        if r:
            results_log.append(r)
            print(f'  >> Vehicle #{r["id"]+1}: {r["vehicleType"].upper()}  {r["occupants"]} occupant(s)')

    out.release()

    print()
    print('─' * 40)
    print(f'TOTAL VEHICLES DETECTED: {len(results_log)}')
    type_counts = Counter(r['vehicleType'] for r in results_log)
    for vtype, count in type_counts.most_common():
        print(f'  {vtype:<8} {count}')
    print()
    print(f'Annotated video saved to: {out_path}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python test_detection.py path/to/video.mp4')
        sys.exit(1)
    run(sys.argv[1])
