# Deployment

## Railway (production)

The dashboard is hosted on Railway at `https://pi-vision-production.up.railway.app`.

Railway watches the `main` branch and auto-deploys on every push.

### How it builds

1. `Dockerfile` — multi-stage build:
   - **Stage 1** (`node:18-alpine`): runs `npm ci && npm run build` → outputs to `dist/`
   - **Stage 2** (`nginx:alpine`): copies `dist/` and `nginx.conf`, serves on port 3000

2. `railway.json` — tells Railway to use the Dockerfile builder

3. `nginx.conf` — SPA fallback routing (`try_files $uri /index.html`) + gzip compression

### Deploying changes

```bash
# All changes to main auto-deploy
git push origin main
```

Railway typically deploys within 2-3 minutes. Watch the build logs in the Railway dashboard.

### Environment variables

No environment variables are required for the frontend — Firebase config is hardcoded in `src/firebase.ts` (public API key, safe to expose for RTDB).

---

## Pi (Raspberry Pi 4)

The Pi runs `camera.py` as a long-lived process. To update it after pushing new code:

```bash
cd ~/Pi-Vision
git pull origin main
# Restart camera.py
source ~/pivision-env/bin/activate && python3 pi/camera.py
```

Or if using systemd:
```bash
sudo systemctl restart pivision
```

---

## Local development

```bash
npm install
npm run dev
# → http://localhost:5173
```

Firebase reads real data from the production database — there is no local emulator configured.

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

## nginx.conf reference

Key settings:
- Listens on port 3000 (Railway expects this)
- `try_files $uri /index.html` — SPA client-side routing fallback
- `gzip on` with common MIME types
- 1-year cache headers for hashed assets (`/assets/`), no-cache for `index.html`
