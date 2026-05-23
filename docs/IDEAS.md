# PiVision — Ideas & Future Features

A running list of ideas we've discussed. Nothing here is committed to — just a place to come back to.

---

## Analytics & Reporting

- **CSV export** ✅ — added to Analytics page, downloads event log for selected date
- **Weekly/monthly email report** — automatic summary email every Monday: total count, busiest day, busiest hour. Would need a backend function (Firebase Cloud Functions or a simple cron on Railway)
- **Peak hour indicator** — highlight the busiest hour of the day directly on the bar chart
- **Comparison vs last week** — show "↑ 12% vs last week" next to the daily total to make data feel actionable
- **Date range export** — CSV export across multiple days, not just one day at a time

---

## Dashboard Features

- **Occupancy limit alert** — set a max number, dashboard goes red when exceeded. High value for retail and venues
- **Reset daily count at midnight** — right now people count resets on Pi restart. Scheduled midnight reset would make daily numbers clean and reliable
- **Live headcount widget** — a big number on the dashboard showing current people inside (entries minus exits), requires two cameras or bidirectional counting

---

## Multi-location / Admin

- **Multi-location rollup** — one summary dashboard showing total across all company locations. Useful at scale
- **Company-level reporting** — admin can pull reports across all cameras for a company at once

---

## Notifications

- **Mobile push notifications** — alert when occupancy limit hit, or when Pi goes offline. Needs Firebase Cloud Messaging
- **Pi offline alert** — notify when a camera stops sending data (Pi disconnected or crashed)

---

## Camera & Hardware

- **WebRTC / MJPEG live stream in dashboard** — true live video instead of 1fps snapshots. Needs Cloudflare tunnel or similar to get past HTTPS/HTTP mismatch
- **Multi-camera single Pi** — run two cameras off one Pi 4, each with their own DEVICE_ID and STREAM_PORT

---

## Seatbelt / Traffic Mode Ideas

- **YOLOv8-pose for seatbelt detection** — detects shoulder/hip keypoints, diagonal strap region between them could indicate seatbelt presence without custom training
- **Custom seatbelt model** — fine-tune on a public Roboflow seatbelt dataset for highest accuracy
- **Coral USB Accelerator** — Google edge TPU (~$60), plugs into Pi USB, runs inference ~10x faster. Useful if Pi struggles with the seatbelt model
- **Offline buffering + sync** — record to SD card when no WiFi, sync to Firebase when back on network. Essential for roadside deployments
- **Cellular modem** — Sixfab hat for Pi (~$80), gives the Pi its own data connection anywhere

---

## Business / Product

- **Heatmap** — show where in the frame people spend the most time. Interesting for retail layout analysis but complex to implement
- **Per-company branding** — white-label the dashboard with the client's logo and colors
- **Subscription tiers** — basic (1 camera, 30 days history) vs pro (unlimited cameras, full history, email reports)
