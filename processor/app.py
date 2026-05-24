#!/usr/bin/env python3
"""
PiVision Desktop Processor
----------------------------
Sign in with your PiVision account, pick a video, drag the counting line
into position, and hit Process. Results appear live in the dashboard.
"""

from __future__ import annotations

import json
import os
import queue
import hashlib
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import cv2
import requests
import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import Image, ImageTk
import customtkinter as ctk
from ultralytics import YOLO

# ── Appearance ─────────────────────────────────────────────────────────────────
ctk.set_appearance_mode('dark')
ctk.set_default_color_theme('blue')

BG      = '#0f172a'
BG2     = '#1e293b'
BG3     = '#334155'
ACCENT  = '#3b82f6'
TEXT    = '#f1f5f9'
DIM     = '#94a3b8'
SUCCESS = '#22c55e'
DANGER  = '#ef4444'

PREVIEW_W = 640
PREVIEW_H = 360

# ── Firebase config ────────────────────────────────────────────────────────────
FIREBASE_API_KEY = 'AIzaSyAv8s0vErAwc3KZaRF55isbKTzhgjuwGNE'
FIREBASE_DB_URL  = 'https://pivision-28ddb-default-rtdb.firebaseio.com'
SESSION_FILE     = Path.home() / '.pivision_session.json'

YOLO_MODEL = 'yolov8n.pt'
YOLO_CONF  = 0.45
YOLO_SKIP  = 2

APP_VERSION   = '1.0.0'
GITHUB_REPO   = 'noahmjacobs/pi-vision'
DOWNLOAD_URL  = 'https://github.com/noahmjacobs/pi-vision/releases/latest'


# ── Firebase REST helpers ──────────────────────────────────────────────────────
def fb_sign_in(email: str, password: str) -> dict:
    url = f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}'
    r = requests.post(url, json={'email': email, 'password': password, 'returnSecureToken': True}, timeout=10)
    if r.status_code == 400:
        raise ValueError('Invalid email or password.')
    r.raise_for_status()
    return r.json()


def fb_refresh(refresh_token: str) -> dict:
    url = f'https://securetoken.googleapis.com/v1/token?key={FIREBASE_API_KEY}'
    r = requests.post(url, json={'grant_type': 'refresh_token', 'refresh_token': refresh_token}, timeout=10)
    r.raise_for_status()
    d = r.json()
    return {'idToken': d['id_token'], 'refreshToken': d['refresh_token']}


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


# ── Session ────────────────────────────────────────────────────────────────────
def load_session() -> dict | None:
    try:
        if SESSION_FILE.exists():
            return json.loads(SESSION_FILE.read_text())
    except Exception:
        pass
    return None


def save_session(data: dict) -> None:
    SESSION_FILE.write_text(json.dumps(data))


def clear_session() -> None:
    SESSION_FILE.unlink(missing_ok=True)


def fetch_latest_version() -> str | None:
    try:
        r = requests.get(
            f'https://api.github.com/repos/{GITHUB_REPO}/releases/latest',
            headers={'Accept': 'application/vnd.github+json'},
            timeout=5,
        )
        if r.status_code == 200:
            tag = r.json().get('tag_name', '')
            return tag.lstrip('v')
    except Exception:
        pass
    return None


# ── Centroid tracker ───────────────────────────────────────────────────────────
class CentroidTracker:
    def __init__(self, max_disappeared: int = 30, max_distance: int = 80) -> None:
        self.next_id = 0
        self.centroids: dict[int, tuple] = {}
        self.disappeared: dict[int, int] = {}
        self.sides: dict[int, str] = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def update(self, new_centroids: list) -> dict:
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
            ids = list(self.centroids)
            existing = [self.centroids[i] for i in ids]
            used_ex: set[int] = set()
            used_new: set[int] = set()
            for ni, nc in enumerate(new_centroids):
                best_j, best_d = -1, float('inf')
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

    def check_crossings(self, line_pos: int, axis: str = 'y', direction: str = 'down') -> int:
        count = 0
        for oid, (cx, cy) in self.centroids.items():
            pos  = cy if axis == 'y' else cx
            side = 'before' if pos < line_pos else 'after'
            prev = self.sides.get(oid)
            if prev is not None and prev != side:
                if direction == 'both':
                    count += 1
                elif direction in ('down', 'right') and prev == 'before':
                    count += 1
                elif direction in ('up', 'left') and prev == 'after':
                    count += 1
            self.sides[oid] = side
        return count

    def _register(self, c: tuple) -> None:
        self.centroids[self.next_id] = c
        self.disappeared[self.next_id] = 0
        self.next_id += 1

    def _deregister(self, oid: int) -> None:
        del self.centroids[oid]
        del self.disappeared[oid]
        self.sides.pop(oid, None)


# ── Processing (background thread) ────────────────────────────────────────────
def file_hash(path: str, size: int) -> str:
    return hashlib.md5(f'{Path(path).name}:{size}'.encode()).hexdigest()[:16]


def run_processing(video_path, company_id, device_id, line_pos, direction, token, progress_cb, log_cb, done_cb):
    try:
        cap    = cv2.VideoCapture(video_path)
        total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps    = cap.get(cv2.CAP_PROP_FPS) or 30
        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        log_cb(f'Video: {Path(video_path).name}')
        log_cb(f'  {width}x{height}  {fps:.0f}fps  {total} frames')
        log_cb('Loading YOLO model...')

        model   = YOLO(YOLO_MODEL)
        tracker = CentroidTracker()
        axis    = 'x' if direction in ('left', 'right') else 'y'
        line    = int((width if axis == 'x' else height) * line_pos)

        file_mtime  = os.path.getmtime(video_path)
        record_date = datetime.fromtimestamp(file_mtime, tz=timezone.utc)

        log_cb('Processing frames...')

        people_count = 0
        last_event   = ''
        pending: list = []
        daily: dict   = {}
        frame_num     = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_num += 1
            progress_cb(frame_num / total, people_count)

            if frame_num % YOLO_SKIP != 0:
                continue

            results   = model(frame, classes=[0], conf=YOLO_CONF, verbose=False)
            centroids = [
                ((int(b.xyxy[0][0]) + int(b.xyxy[0][2])) // 2,
                 (int(b.xyxy[0][1]) + int(b.xyxy[0][3])) // 2)
                for b in results[0].boxes
            ]
            tracker.update(centroids)
            crossings = tracker.check_crossings(line, axis=axis, direction=direction)

            if crossings > 0:
                people_count += crossings
                frame_dt = (
                    record_date.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
                    + frame_num / fps
                )
                ts_ms    = int(frame_dt * 1000)
                date_key = datetime.fromtimestamp(frame_dt).strftime('%Y-%m-%d')
                ts_label = datetime.fromtimestamp(frame_dt).strftime('%H:%M')
                event_id = uuid.uuid4().hex[:8]
                pending.append((event_id, ts_ms, 'Person counted', f'Crossed line · {ts_label} (from video)'))
                daily[date_key] = daily.get(date_key, 0) + crossings
                last_event = f'Person · {ts_label}'

        cap.release()

        log_cb(f'Complete — {people_count} crossings detected')
        log_cb(f'Writing {len(pending)} events to Firebase...')

        base = f'companies/{company_id}/devices/{device_id}'
        for event_id, ts_ms, label, sublabel in pending:
            fb_put(f'{base}/events/{event_id}', {
                'id': event_id, 'timestamp': ts_ms,
                'type': 'person', 'label': label, 'sublabel': sublabel,
            }, token)

        for date_key, count in daily.items():
            path    = f'{base}/counts/{date_key}/total'
            current = fb_get(path, token) or 0
            fb_put(path, current + count, token)
            log_cb(f'  {date_key}: {count} crossings')

        fb_patch(f'{base}/stats', {'peopleCount': people_count, 'lastEvent': last_event}, token)

        size  = os.path.getsize(video_path)
        fhash = file_hash(video_path, size)
        # Store at company level so duplicate check works across any location
        fb_put(f'companies/{company_id}/processed/{fhash}', {
            'filename':    Path(video_path).name,
            'size':        size,
            'location':    device_id,
            'processedAt': int(time.time() * 1000),
            'vehicleCount': people_count,
        }, token)

        log_cb('Results are live in PiVision Analytics!')
        done_cb(True, people_count)

    except Exception as e:
        log_cb(f'Error: {e}')
        done_cb(False, 0)


# ── App ────────────────────────────────────────────────────────────────────────
class App(ctk.CTk):
    def __init__(self) -> None:
        super().__init__()
        self.title('PiVision Processor')
        self.configure(fg_color=BG)

        self.session: dict | None = None
        self.video_path: str | None = None
        self._preview_frame = None
        self._tk_img = None
        self.line_pos = 0.5
        self.direction = 'down'
        self._processing = False
        self._log_queue: queue.Queue = queue.Queue()
        self._px = self._py = 0
        self._pw = PREVIEW_W
        self._ph = PREVIEW_H

        saved = load_session()
        if saved and saved.get('refreshToken'):
            self._try_restore_session(saved)
        else:
            self._show_signin()

        self._poll_logs()
        self.after(3000, self._check_for_update)

    def _check_for_update(self) -> None:
        def worker():
            latest = fetch_latest_version()
            if latest and latest != APP_VERSION:
                self.after(0, lambda: self._show_update_dialog(latest))
        threading.Thread(target=worker, daemon=True).start()

    def _show_update_dialog(self, latest: str) -> None:
        dialog = ctk.CTkToplevel(self)
        dialog.title('Update Available')
        dialog.geometry('380x200')
        dialog.resizable(False, False)
        dialog.configure(fg_color=BG2)
        dialog.grab_set()
        dialog.lift()

        ctk.CTkLabel(dialog, text='Update Available', font=('Helvetica', 17, 'bold'),
                     text_color=TEXT).pack(pady=(28, 4))
        ctk.CTkLabel(dialog,
                     text=f'PiVision Processor v{latest} is available.\nYou have v{APP_VERSION}.',
                     font=('Helvetica', 13), text_color=DIM, justify='center').pack(pady=(0, 20))

        btn_row = ctk.CTkFrame(dialog, fg_color='transparent')
        btn_row.pack()

        def open_download():
            import webbrowser
            webbrowser.open(DOWNLOAD_URL)
            dialog.destroy()

        ctk.CTkButton(btn_row, text='Download Update', fg_color=ACCENT,
                      command=open_download, width=150).pack(side='left', padx=6)
        ctk.CTkButton(btn_row, text='Not Now', fg_color=BG3, hover_color=BG3,
                      command=dialog.destroy, width=100).pack(side='left', padx=6)

    def _try_restore_session(self, saved: dict) -> None:
        self._show_loading()

        def attempt():
            try:
                tokens = fb_refresh(saved['refreshToken'])
                saved['token'] = tokens['idToken']
                saved['refreshToken'] = tokens['refreshToken']
                save_session(saved)
                self.session = saved
                self.after(0, self._show_main)
            except Exception:
                clear_session()
                self.after(0, self._show_signin)

        threading.Thread(target=attempt, daemon=True).start()

    def _clear(self) -> None:
        for w in self.winfo_children():
            w.destroy()

    # ── Loading ────────────────────────────────────────────────────────────────
    def _show_loading(self) -> None:
        self._clear()
        self.geometry('420x160')
        self.resizable(False, False)
        f = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        f.pack(fill='both', expand=True)
        ctk.CTkLabel(f, text='PiVision Processor', font=('Helvetica', 22, 'bold'),
                     text_color=TEXT).pack(pady=(40, 6))
        ctk.CTkLabel(f, text='Signing in...', font=('Helvetica', 12),
                     text_color=DIM).pack()

    # ── Sign-in ────────────────────────────────────────────────────────────────
    def _show_signin(self) -> None:
        self._clear()
        self.geometry('420x460')
        self.resizable(False, False)

        # Blue header bar
        hdr = ctk.CTkFrame(self, fg_color=ACCENT, corner_radius=0, height=70)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        ctk.CTkLabel(hdr, text='PiVision Processor', font=('Helvetica', 20, 'bold'),
                     text_color='white').pack(expand=True)

        # Form card
        card = ctk.CTkFrame(self, fg_color=BG2, corner_radius=12)
        card.pack(fill='x', padx=28, pady=24)

        inner = ctk.CTkFrame(card, fg_color=BG2, corner_radius=0)
        inner.pack(fill='x', padx=28, pady=24)

        ctk.CTkLabel(inner, text='Email', font=('Helvetica', 12, 'bold'),
                     text_color=TEXT).pack(anchor='w')
        self._email_var = ctk.StringVar()
        self._email_entry = ctk.CTkEntry(
            inner, textvariable=self._email_var, font=('Helvetica', 13),
            fg_color='white', text_color='#111827', border_color='#d1d5db',
            border_width=1, height=42,
        )
        self._email_entry.pack(fill='x', pady=(4, 14))

        ctk.CTkLabel(inner, text='Password', font=('Helvetica', 12, 'bold'),
                     text_color=TEXT).pack(anchor='w')
        self._pw_var = ctk.StringVar()
        pw = ctk.CTkEntry(
            inner, textvariable=self._pw_var, font=('Helvetica', 13),
            fg_color='white', text_color='#111827', border_color='#d1d5db',
            border_width=1, height=42, show='•',
        )
        pw.pack(fill='x', pady=(4, 18))
        pw.bind('<Return>', lambda _: self._do_signin())

        self._signin_err = ctk.CTkLabel(inner, text='', font=('Helvetica', 11),
                                         text_color=DANGER, wraplength=320)
        self._signin_err.pack(fill='x', pady=(0, 8))

        self._signin_btn = ctk.CTkButton(
            inner, text='Sign In', font=('Helvetica', 13, 'bold'),
            fg_color=ACCENT, hover_color='#2563eb', text_color='white',
            height=46, command=self._do_signin,
        )
        self._signin_btn.pack(fill='x')

        self._email_entry.focus_set()

    def _do_signin(self) -> None:
        email    = self._email_var.get().strip()
        password = self._pw_var.get()
        if not email or not password:
            self._signin_err.configure(text='Enter your email and password.')
            return

        self._signin_btn.configure(text='Signing in...', state='disabled')
        self._signin_err.configure(text='')

        def attempt():
            try:
                auth  = fb_sign_in(email, password)
                token = auth['idToken']
                uid   = auth['localId']
                print(f'[Auth] Signed in as uid={uid}')

                user_data = fb_get(f'users/{uid}', token)
                print(f'[Auth] user_data={user_data}')
                if not user_data:
                    raise ValueError('Account not set up yet. Contact your admin.')

                company_id   = user_data.get('companyId') or user_data.get('company', '')
                company_data = fb_get(f'companies/{company_id}', token) or {}
                print(f'[Auth] company_id={company_id}  company_data keys={list(company_data.keys())}')
                devices      = list((company_data.get('devices') or {}).keys())

                session = {
                    'token':        token,
                    'refreshToken': auth.get('refreshToken', ''),
                    'uid':          uid,
                    'email':        email,
                    'companyId':    company_id,
                    'companyName':  company_data.get('name', company_id),
                    'devices':      devices,
                }
                save_session(session)
                self.session = session
                self.after(0, self._show_main)

            except Exception as e:
                import traceback
                traceback.print_exc()
                raw = str(e)
                # Show a clean message — never expose tokens or full URLs
                if '401' in raw or '403' in raw or 'Permission' in raw:
                    err_msg = 'Access denied. Your account may not have permission.'
                elif 'Invalid email or password' in raw:
                    err_msg = 'Invalid email or password.'
                elif 'not set up' in raw or 'not found' in raw:
                    err_msg = raw
                elif 'timeout' in raw.lower() or 'connect' in raw.lower():
                    err_msg = 'Connection failed. Check your internet and try again.'
                else:
                    err_msg = 'Sign-in failed. See terminal for details.'
                def reset():
                    self._signin_btn.configure(text='Sign In', state='normal')
                    self._signin_err.configure(text=err_msg)
                self.after(0, reset)

        threading.Thread(target=attempt, daemon=True).start()

    # ── Main screen ────────────────────────────────────────────────────────────
    def _show_main(self) -> None:
        self._clear()
        self.geometry('800x760')
        self.resizable(True, True)
        s = self.session

        # Header
        hdr = ctk.CTkFrame(self, fg_color=BG2, corner_radius=0, height=52)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        ctk.CTkLabel(hdr, text='PiVision Processor', font=('Helvetica', 15, 'bold'),
                     text_color=TEXT).pack(side='left', padx=20)
        ctk.CTkButton(hdr, text='Sign Out', font=('Helvetica', 10),
                      fg_color=BG3, hover_color=BG3, text_color=DIM, width=80, height=28,
                      command=self._sign_out).pack(side='right', padx=12)
        ctk.CTkLabel(hdr, text=s['email'], font=('Helvetica', 10),
                     text_color=DIM).pack(side='right')

        # Company row
        info = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        info.pack(fill='x', padx=20, pady=(12, 8))
        ctk.CTkLabel(info, text=f'Company:  {s["companyName"]}', font=('Helvetica', 12),
                     text_color=DIM).pack(side='left')

        # Location field with autocomplete
        loc_row = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        loc_row.pack(fill='x', padx=20, pady=(0, 8))
        ctk.CTkLabel(loc_row, text='Location:', font=('Helvetica', 12),
                     text_color=DIM).pack(side='left')
        self._loc_var = ctk.StringVar()
        self._loc_entry = ctk.CTkEntry(
            loc_row, textvariable=self._loc_var, font=('Helvetica', 13),
            fg_color=BG2, text_color=TEXT, border_color=BG3,
            placeholder_text='e.g. North Entrance, Parking Lot A...',
            width=320, height=36,
        )
        self._loc_entry.pack(side='left', padx=(10, 0))

        # Suggestions list (hidden until typing matches something)
        self._sugg_frame = ctk.CTkFrame(self, fg_color=BG2, corner_radius=6,
                                         border_width=1, border_color=BG3)
        self._existing_locations: list[str] = list(s.get('devices', []))
        self._loc_var.trace_add('write', self._on_loc_change)
        self._load_locations()

        ctk.CTkFrame(self, fg_color=BG3, height=1, corner_radius=0).pack(fill='x')

        # Video picker
        vpick = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        vpick.pack(fill='x', padx=20, pady=14)
        ctk.CTkButton(vpick, text='Browse for Video', font=('Helvetica', 12),
                      fg_color=ACCENT, hover_color='#2563eb', text_color='white',
                      height=36, command=self._pick_video).pack(side='left')
        self._video_label = ctk.CTkLabel(vpick, text='No video selected',
                                          font=('Helvetica', 11), text_color=DIM)
        self._video_label.pack(side='left', padx=14)

        # Preview canvas (tk.Canvas renders reliably on all platforms)
        canvas_wrap = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        canvas_wrap.pack(fill='x', padx=20)
        self._canvas = tk.Canvas(canvas_wrap, width=PREVIEW_W, height=PREVIEW_H,
                                  bg='#111827', highlightthickness=1,
                                  highlightbackground=BG3, cursor='crosshair')
        self._canvas.pack()
        self._canvas.bind('<Button-1>', self._on_canvas_click)
        self._draw_placeholder()

        # Direction + position controls
        ctrl = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        ctrl.pack(fill='x', padx=20, pady=(10, 4))
        ctk.CTkLabel(ctrl, text='Direction:', font=('Helvetica', 12),
                     text_color=DIM).pack(side='left')

        self._dir_btns: dict[str, ctk.CTkButton] = {}
        for label, val in [('↓ Down', 'down'), ('↑ Up', 'up'), ('← Left', 'left'),
                           ('→ Right', 'right'), ('↕ Both', 'both')]:
            b = ctk.CTkButton(ctrl, text=label, font=('Helvetica', 11),
                              width=80, height=30, fg_color=BG3, hover_color=ACCENT,
                              text_color=DIM, command=lambda v=val: self._set_direction(v))
            b.pack(side='left', padx=3)
            self._dir_btns[val] = b
        self._update_dir_buttons()

        # Line position slider
        pos_row = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        pos_row.pack(fill='x', padx=20, pady=(0, 6))
        ctk.CTkLabel(pos_row, text='Position:', font=('Helvetica', 12),
                     text_color=DIM).pack(side='left')
        self._line_label = ctk.CTkLabel(pos_row, text='50%', font=('Helvetica', 12, 'bold'),
                                         text_color=TEXT, width=40)
        self._line_label.pack(side='right')
        self._slider = ctk.CTkSlider(pos_row, from_=5, to=95, number_of_steps=90,
                                      fg_color=BG3, progress_color=ACCENT, button_color=ACCENT,
                                      button_hover_color='#2563eb', command=self._on_slider)
        self._slider.set(50)
        self._slider.pack(side='left', fill='x', expand=True, padx=(10, 10))

        ctk.CTkFrame(self, fg_color=BG3, height=1, corner_radius=0).pack(fill='x', pady=(2, 0))

        # Run row
        run_row = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        run_row.pack(fill='x', padx=20, pady=14)
        self._run_btn = ctk.CTkButton(
            run_row, text='Process Video', font=('Helvetica', 13, 'bold'),
            fg_color=SUCCESS, hover_color='#16a34a', text_color='white',
            height=44, command=self._run,
        )
        self._run_btn.pack(side='left')
        self._status_label = ctk.CTkLabel(run_row, text='', font=('Helvetica', 11),
                                           text_color=DIM)
        self._status_label.pack(side='left', padx=16)

        self._progress = ctk.CTkProgressBar(self, progress_color=ACCENT, fg_color=BG3, height=8,
                                             corner_radius=4)
        self._progress.pack(fill='x', padx=20, pady=(0, 8))
        self._progress.set(0)

        # Log
        log_wrap = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        log_wrap.pack(fill='both', expand=True, padx=20, pady=(0, 16))
        self._log_text = ctk.CTkTextbox(log_wrap, font=('Menlo', 10),
                                         fg_color='#0d1117', text_color=DIM)
        self._log_text.pack(fill='both', expand=True)
        self._log_text.configure(state='disabled')

    # ── Preview ────────────────────────────────────────────────────────────────
    def _draw_placeholder(self) -> None:
        self._canvas.delete('all')
        self._canvas.create_text(
            PREVIEW_W // 2, PREVIEW_H // 2,
            text='Select a video — then click anywhere on the preview to set the counting line',
            fill='#475569', font=('Helvetica', 12), width=420, justify='center',
        )

    def _pick_video(self) -> None:
        path = filedialog.askopenfilename(
            title='Select Video File',
            filetypes=[('Video files', '*.mp4 *.mov *.mkv *.avi *.m4v'), ('All files', '*.*')],
        )
        if not path:
            return
        self.video_path = path
        self._video_label.configure(text=Path(path).name, text_color=TEXT)
        self._load_preview()

    def _load_preview(self) -> None:
        cap   = cv2.VideoCapture(self.video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.set(cv2.CAP_PROP_POS_FRAMES, total // 2)
        ret, frame = cap.read()
        cap.release()
        if not ret:
            return
        self._preview_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        self._redraw_preview()

    def _redraw_preview(self) -> None:
        if self._preview_frame is None:
            return
        h, w  = self._preview_frame.shape[:2]
        scale = min(PREVIEW_W / w, PREVIEW_H / h)
        nw, nh = int(w * scale), int(h * scale)
        frame = cv2.resize(self._preview_frame, (nw, nh))

        axis = 'x' if self.direction in ('left', 'right') else 'y'
        if axis == 'y':
            ly = int(nh * self.line_pos)
            cv2.line(frame, (0, ly), (nw, ly), (239, 68, 68), 2)
            cv2.putText(frame, f'Line  {int(self.line_pos * 100)}%', (8, max(ly - 6, 14)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (239, 68, 68), 1)
        else:
            lx = int(nw * self.line_pos)
            cv2.line(frame, (lx, 0), (lx, nh), (239, 68, 68), 2)
            cv2.putText(frame, f'Line  {int(self.line_pos * 100)}%', (max(lx + 4, 4), 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (239, 68, 68), 1)

        padded = Image.new('RGB', (PREVIEW_W, PREVIEW_H), (13, 18, 30))
        ox = (PREVIEW_W - nw) // 2
        oy = (PREVIEW_H - nh) // 2
        padded.paste(Image.fromarray(frame), (ox, oy))

        self._px, self._py, self._pw, self._ph = ox, oy, nw, nh
        self._tk_img = ImageTk.PhotoImage(padded)
        self._canvas.delete('all')
        self._canvas.create_image(0, 0, anchor='nw', image=self._tk_img)
        self._canvas.create_text(PREVIEW_W - 8, PREVIEW_H - 8, anchor='se',
                                  text='Click or use slider to move the counting line',
                                  fill='#475569', font=('Helvetica', 10))

    def _load_locations(self) -> None:
        def fetch():
            try:
                data = fb_get(f'companies/{self.session["companyId"]}/devices',
                              self.session['token'])
                if isinstance(data, dict):
                    locs = sorted(data.keys())
                    self._existing_locations = locs
            except Exception:
                pass
        threading.Thread(target=fetch, daemon=True).start()

    def _on_loc_change(self, *_) -> None:
        typed = self._loc_var.get().strip().lower()
        matches = [loc for loc in self._existing_locations
                   if typed and typed in loc.lower() and loc.lower() != typed]

        for w in self._sugg_frame.winfo_children():
            w.destroy()

        if matches:
            self._sugg_frame.pack(fill='x', padx=30, pady=(0, 4))
            for loc in matches[:6]:
                ctk.CTkButton(
                    self._sugg_frame, text=loc, font=('Helvetica', 11),
                    fg_color='transparent', hover_color=BG3, text_color=TEXT,
                    anchor='w', height=28,
                    command=lambda l=loc: self._pick_location(l),
                ).pack(fill='x', padx=4, pady=1)
        else:
            self._sugg_frame.pack_forget()

    def _pick_location(self, loc: str) -> None:
        self._loc_var.set(loc)
        self._sugg_frame.pack_forget()

    def _on_slider(self, val: float) -> None:
        self.line_pos = val / 100
        self._line_label.configure(text=f'{int(val)}%')
        self._redraw_preview()

    def _on_canvas_click(self, event: tk.Event) -> None:
        if self._preview_frame is None:
            return
        axis = 'x' if self.direction in ('left', 'right') else 'y'
        rel  = ((event.y - self._py) / max(self._ph, 1) if axis == 'y'
                else (event.x - self._px) / max(self._pw, 1))
        self.line_pos = max(0.05, min(0.95, rel))
        self._slider.set(self.line_pos * 100)
        self._line_label.configure(text=f'{int(self.line_pos * 100)}%')
        self._redraw_preview()

    def _set_direction(self, val: str) -> None:
        self.direction = val
        self._update_dir_buttons()
        self._redraw_preview()

    def _update_dir_buttons(self) -> None:
        for val, btn in self._dir_btns.items():
            if val == self.direction:
                btn.configure(fg_color=ACCENT, text_color='white')
            else:
                btn.configure(fg_color=BG3, text_color=DIM)

    # ── Run ────────────────────────────────────────────────────────────────────
    def _run(self) -> None:
        if not self.video_path:
            messagebox.showwarning('No Video', 'Please select a video file first.')
            return
        location = self._loc_var.get().strip()
        if not location:
            messagebox.showwarning('No Location', 'Please enter a location name for this video.')
            self._loc_entry.focus_set()
            return
        if self._processing:
            return

        # Duplicate check — looks at company level (new) AND all device paths (old records)
        size    = os.path.getsize(self.video_path)
        fhash   = file_hash(self.video_path, size)
        cid     = self.session['companyId']
        token   = self.session['token']
        previous = None

        # New path (company-level)
        try:
            result = fb_get(f'companies/{cid}/processed/{fhash}', token)
            if isinstance(result, dict):
                previous = result
                print(f'[Dup] Found at company level: {result}')
        except Exception as e:
            print(f'[Dup] Company-level check failed: {e}')

        # Old path (per-device) — backward compat with records written before this update
        if not previous:
            for loc in self._existing_locations:
                try:
                    result = fb_get(f'companies/{cid}/devices/{loc}/processed/{fhash}', token)
                    if isinstance(result, dict):
                        result.setdefault('location', loc)
                        previous = result
                        print(f'[Dup] Found at device level ({loc}): {result}')
                        break
                except Exception:
                    pass

        if not previous:
            print(f'[Dup] No existing record found for hash {fhash}')

        if previous and isinstance(previous, dict):
            prev_date     = datetime.fromtimestamp(
                previous.get('processedAt', 0) / 1000
            ).strftime('%B %d, %Y at %H:%M')
            prev_count    = previous.get('vehicleCount', 0)
            prev_location = previous.get('location', 'unknown location')
            answer = messagebox.askyesno(
                'Already Processed',
                f'"{Path(self.video_path).name}" was already processed on {prev_date}\n'
                f'Location: {prev_location}  ·  {prev_count} crossings found.\n\n'
                f'Process again? (This will add duplicate counts to the dashboard.)',
            )
            if not answer:
                return

        self._processing = True
        self._run_btn.configure(state='disabled', text='Processing...')
        self._progress.set(0)
        self._status_label.configure(text='', text_color=DIM)

        def progress_cb(frac: float, count: int) -> None:
            def _update():
                self._progress.set(frac)
                self._status_label.configure(text=f'{int(frac * 100)}%  ·  {count} crossings')
            self.after(0, _update)

        def log_cb(msg: str) -> None:
            self._log_queue.put(msg)

        def done_cb(success: bool, count: int) -> None:
            def _update():
                self._processing = False
                self._run_btn.configure(state='normal', text='Process Video')
                self._status_label.configure(
                    text=f'Done — {count} crossings written to dashboard' if success else 'Processing failed',
                    text_color=SUCCESS if success else DANGER,
                )
            self.after(0, _update)

        threading.Thread(
            target=run_processing,
            args=(
                self.video_path,
                self.session['companyId'],
                location,
                self.line_pos,
                self.direction,
                self.session['token'],
                progress_cb, log_cb, done_cb,
            ),
            daemon=True,
        ).start()

    # ── Log polling ────────────────────────────────────────────────────────────
    def _poll_logs(self) -> None:
        while True:
            try:
                msg = self._log_queue.get_nowait()
                if hasattr(self, '_log_text'):
                    self._log_text.configure(state='normal')
                    self._log_text.insert('end', f'{msg}\n')
                    self._log_text.see('end')
                    self._log_text.configure(state='disabled')
            except queue.Empty:
                break
        self.after(100, self._poll_logs)

    # ── Sign out ───────────────────────────────────────────────────────────────
    def _sign_out(self) -> None:
        clear_session()
        self.session = None
        self._show_signin()


if __name__ == '__main__':
    App().mainloop()
