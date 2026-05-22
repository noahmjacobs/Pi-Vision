# PiVision — Product Requirements Document

**Version:** 0.2  
**Last updated:** May 2026  
**Status:** Active development

---

## 1. Problem

Foot traffic data is valuable — retailers, events, intersections, and researchers all want to know how many people passed through a space and when. Today, solutions are either expensive enterprise hardware, manual counting (a literal person with a clipboard), or cloud-dependent systems with ongoing subscription fees.

There is no simple, affordable, plug-and-play device that a small business owner or researcher can buy, set up in minutes, and get clean foot traffic data from — without a subscription, without IT knowledge, and without a monthly bill.

---

## 2. Vision

A small physical device (Raspberry Pi + camera) that you plug into power, point at a door or walkway, and it starts counting. You open a web dashboard on your phone or laptop and see a live view, a running people count, and a timeline of when traffic peaked.

No cloud subscription. No configuration. Just data.

---

## 3. Target Users

| User | Use Case |
|------|----------|
| Small retail store owner | Count daily foot traffic, see peak hours, measure impact of promotions |
| Event organizer | Count attendees entering/exiting a venue |
| Traffic researcher | Count pedestrians, cyclists, or vehicles at an intersection |
| Municipality / city planner | Measure foot traffic in public spaces |
| Security researcher | Detect and log presence in a monitored area |

**Primary for v1:** Small retail store owner. Simple, one-location, wants a number at the end of the day.

---

## 4. Current State (v0.2 — "Ring Camera Mode")

What the product does right now:

- Raspberry Pi (or MacBook for dev) runs `camera.py`
- Detects motion using OpenCV background subtraction
- Pushes a 640×360 JPEG snapshot to Firebase every second
- Dashboard shows live feed, motion event log, GPT-4o scene description
- Motion events are logged with timestamp to Firebase
- No actual people counting — just motion area threshold

**What's fake/mocked right now:**
- `objectsDetected` stat — hardcoded, not real
- `uptime` stat — hardcoded string, not calculated
- Motion events use generic labels ("Motion detected") not object classification

---

## 5. Product Phases

### Phase 1 — Ring Camera (current)
Basic security camera dashboard. Motion detection, live snapshot feed, AI scene description. No people counting yet.

**Done:**
- Firebase base64 snapshot stream (1fps)
- Motion detection + event logging
- GPT-4o periodic scene analysis
- Skeleton loaders, tooltips, caching

**Remaining:**
- Replace all mock stat data with real values
- Calculate and display real uptime
- Clean up event labels (stop showing "Motion detected" for everything)

---

### Phase 2 — People Counter (next)
Upgrade motion detection to actual person detection. Count individuals, not just pixel changes.

**Key features:**
- Person detection using a lightweight model (YOLOv8-nano or MobileNet SSD — runs on Pi)
- Count unique people crossing a virtual line in the frame
- Daily/hourly totals on dashboard
- Peak hour chart

**Technical approach:**
- Replace `bg_sub.apply()` with YOLOv8-nano inference on each frame
- Track bounding boxes across frames (simple centroid tracker)
- Count when a tracked centroid crosses a configurable line
- Write `stats/peopleCount` and `stats/hourlyBreakdown` to Firebase

---

### Phase 3 — Specialized Deployments
Apply the same core detection to different domains.

**Seat belt compliance monitoring:**
- Camera pointed at road/intersection
- Detect vehicles, then classify driver as belted/unbelted
- Log per-vehicle events with timestamp
- Export CSV report for a session (e.g. 1-hour observation window)
- This likely requires a fine-tuned model or a larger YOLO variant

**Multi-zone counting:**
- Multiple cameras, each writing to a different Firebase path
- Dashboard shows all zones simultaneously

---

## 6. Hardware Spec (target)

| Component | Spec |
|-----------|------|
| Compute | Raspberry Pi 4 (2GB+ RAM) or Pi 5 |
| Camera | USB webcam (1080p30) or Pi Camera Module 3 |
| Power | USB-C PD (standard wall adapter) |
| Housing | 3D printed enclosure with tripod mount (¼-20 thread) |
| Storage | 32GB microSD (OS + app only, no local video storage) |
| Connectivity | WiFi (2.4 or 5GHz) |

**Setup time target:** Under 5 minutes from box to counting.

---

## 7. Dashboard Requirements

### Current screens
- **Dashboard** — live feed, stats, recent events, AI analysis, status bar

### Needed for Phase 2
- **People Count** stat card (replaces or supplements Motion Events)
- **Hourly chart** — bar chart of people counted per hour
- **Daily total** — large number, prominent
- **Event log** — shows "Person detected" not "Motion detected"

### Needed for Phase 3
- **Session mode** — start/stop a timed observation session
- **Export button** — download CSV of events for the session
- **Multi-camera view** — grid of feeds if multiple devices connected

---

## 8. Non-Goals (v1)

- No local video recording or storage
- No facial recognition
- No alerts or push notifications (yet)
- No user accounts or multi-tenant access
- No offline mode (requires WiFi)

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Setup time | < 5 min |
| Count accuracy | > 90% in good lighting, single-file entry |
| Dashboard latency | < 2 seconds from person entering to count updating |
| Uptime | > 99% over a 12-hour session |
| Cost of hardware | < $100 per unit |

---

## 10. Open Questions

1. **Local vs cloud model inference?** YOLOv8-nano runs at ~10fps on Pi 4. Is that fast enough for a busy entrance?
2. **What happens when WiFi drops?** Should the Pi buffer counts locally and sync when back online?
3. **Privacy?** If deployed in a store, do customers need to be notified? (Probably yes — a small sign.)
4. **Pricing model?** One-time hardware purchase? Monthly dashboard fee? Open source self-host?
5. **Seat belt detection accuracy?** This requires a much more capable model and likely a specific dataset. May need fine-tuning.
