# Deployment

## Railway (production frontend)

The dashboard is hosted on Railway. Railway watches the `main` branch and auto-deploys on every push.

### Branches

| Branch | Purpose |
|---|---|
| `main` | Production — Railway deploys from this automatically |
| `dev` | Active development — merge to main when ready to ship |

### Deploying

```bash
# Merge dev into main and push — Railway picks it up within ~2 minutes
git checkout main
git merge dev
git push origin main
git checkout dev
```

### How it builds

1. `Dockerfile` — multi-stage:
   - **Stage 1** (`node:18-alpine`): `npm ci && npm run build` → outputs to `dist/`
   - **Stage 2** (`nginx:alpine`): copies `dist/` + `nginx.conf`, serves on port 3000

2. `railway.json` — tells Railway to use the Dockerfile builder

3. `nginx.conf` — SPA fallback routing + gzip compression

### Environment variables

No environment variables are required for the frontend. Firebase config is hardcoded in
`src/firebase.ts` (public API key — safe to expose for RTDB with proper security rules).

---

## Raspberry Pi (camera script)

Each physical Pi runs `camera.py` as a long-lived process, writing data to Firebase.

### First-time Pi setup

```bash
# On the Pi:
git clone <repo-url> ~/Pi-Vision
cd ~/Pi-Vision/pi
chmod +x install.sh
./install.sh
```

Then add your Firebase service account:
- Firebase Console → Project Settings → Service Accounts → Generate new private key
- Save as `pi/serviceAccount.json` (gitignored — never commit this)

### Running for a specific company/camera

Always set `COMPANY_ID` and `DEVICE_ID` to match what you created in the Admin panel:

```bash
COMPANY_ID=kahuku-apps-llc DEVICE_ID=cam1 python3 camera.py
```

Or use the generated launcher (activates the venv automatically):
```bash
COMPANY_ID=kahuku-apps-llc DEVICE_ID=cam1 ./run.sh
```

### Configuring the systemd service (recommended for production)

After `install.sh`, edit the service file to hard-code the company and camera:

```bash
sudo nano /etc/systemd/system/pivision.service
```

Set the Environment lines:
```ini
Environment=COMPANY_ID=kahuku-apps-llc
Environment=DEVICE_ID=cam1
Environment=CAMERA_INDEX=0
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pivision   # start on boot
sudo systemctl start pivision    # start now
sudo journalctl -u pivision -f   # view logs
```

### Multiple cameras on one Pi

Give each camera.py process a different `STREAM_PORT`:

```bash
# Terminal 1
COMPANY_ID=kahuku-apps-llc DEVICE_ID=cam1 STREAM_PORT=8080 python3 camera.py

# Terminal 2
COMPANY_ID=kahuku-apps-llc DEVICE_ID=cam2 STREAM_PORT=8081 python3 camera.py
```

For systemd with multiple cameras, create separate service files:
`/etc/systemd/system/pivision-cam1.service` and `pivision-cam2.service`.

### Updating the Pi script

```bash
cd ~/Pi-Vision
git pull origin main
sudo systemctl restart pivision
```

---

## Local development

```bash
npm install
npm run dev
# → http://localhost:5173
```

The browser connects to the live Firebase production database — there is no local emulator.
Use the `default` company / `cam1` device (the test namespace) when running camera.py locally.

---

## Dockerfile reference

```dockerfile
# Stage 1 — build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```
