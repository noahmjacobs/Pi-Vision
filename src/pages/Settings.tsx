import { useState, useEffect } from 'react'
import { ref, set } from 'firebase/database'
import { db } from '../firebase'

const LS_KEY = 'pv_config'

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

function saveLocal(cfg: object) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)) } catch {}
}

export default function Settings() {
  const saved = loadLocal()

  const [linePosition,   setLinePosition]   = useState<number>(saved.linePosition   ?? 50)
  const [countDirection, setCountDirection] = useState<string>(saved.countDirection ?? 'down')
  const [confidence,     setConfidence]     = useState<number>(saved.confidence     ?? 45)
  const [cameraIndex,    setCameraIndex]    = useState<number>(saved.cameraIndex    ?? 0)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function handleSave() {
    setStatus('saving')
    const cfg = { linePosition, countDirection, confidence, cameraIndex }
    saveLocal(cfg)
    try {
      await Promise.all([
        set(ref(db, 'config/linePosition'),   linePosition),
        set(ref(db, 'config/countDirection'), countDirection),
        set(ref(db, 'config/confidence'),     confidence),
        set(ref(db, 'config/cameraIndex'),    cameraIndex),
      ])
      setStatus('saved')
    } catch (err) {
      console.error('Firebase config write failed:', err)
      setStatus('error')
    }
    setTimeout(() => setStatus('idle'), 2500)
  }

  return (
    <div className="settings-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Configure your PiVision camera system</div>
        </div>
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          style={{
            padding: '9px 22px',
            borderRadius: 10,
            border: 'none',
            background: status === 'saved' ? '#22c55e' : status === 'error' ? '#ef4444' : 'var(--accent-blue)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'var(--font)',
            cursor: status === 'saving' ? 'not-allowed' : 'pointer',
            opacity: status === 'saving' ? 0.7 : 1,
            transition: 'background 0.2s',
            minWidth: 90,
          }}
        >
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Failed ✗' : 'Save'}
        </button>
      </div>

      {/* Counting */}
      <div className="glass-card settings-section">
        <div className="settings-section-title">Counting</div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Line Position</div>
            <div className="settings-row-sub">Counting line as % of frame height from top</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 36, textAlign: 'right' }}>
              {linePosition}%
            </span>
            <input
              type="range" min={0} max={100} value={linePosition}
              onChange={e => setLinePosition(Number(e.target.value))}
              style={{ width: 120 }}
            />
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Count Direction</div>
            <div className="settings-row-sub">Which direction to count as a crossing</div>
          </div>
          <select
            className="settings-select"
            value={countDirection}
            onChange={e => setCountDirection(e.target.value)}
          >
            <option value="down">Down only (entering)</option>
            <option value="up">Up only (exiting)</option>
            <option value="both">Both directions</option>
          </select>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Detection Confidence</div>
            <div className="settings-row-sub">Minimum YOLO confidence threshold (0–100%)</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 36, textAlign: 'right' }}>
              {confidence}%
            </span>
            <input
              type="range" min={0} max={100} value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
              style={{ width: 120 }}
            />
          </div>
        </div>
      </div>

      {/* Camera */}
      <div className="glass-card settings-section">
        <div className="settings-section-title">Camera</div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Camera Index</div>
            <div className="settings-row-sub">USB camera device index (0–5)</div>
          </div>
          <input
            type="number" min={0} max={5} value={cameraIndex}
            onChange={e => setCameraIndex(Number(e.target.value))}
            style={{
              width: 64,
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 14,
              padding: '6px 10px',
              textAlign: 'center',
            }}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Firebase Sync</div>
            <div className="settings-row-sub">Sync events and stats to Realtime Database</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#22c55e' }}>Active</div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">AI Model</div>
            <div className="settings-row-sub">Object detection model in use</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>YOLOv8 Nano</div>
        </div>
      </div>

      {/* Note */}
      <div className="glass-card settings-section" style={{ borderLeft: '3px solid rgba(29,110,244,0.6)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Note:</span>{' '}
          Settings are applied when{' '}
          <code style={{ fontFamily: 'monospace', fontSize: 12, background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>camera.py</code>{' '}
          starts. Restart the camera script after saving changes.
        </div>
      </div>
    </div>
  )
}
