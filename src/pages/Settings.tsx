import { useState, useEffect } from 'react'
import { ref, set, remove, onValue, off } from 'firebase/database'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { PALETTE, deviceColor } from './Analytics'

function loadLocal(camId: string) {
  try { return JSON.parse(localStorage.getItem(`pv_config_${camId}`) || '{}') } catch { return {} }
}
function saveLocal(camId: string, cfg: object) {
  try { localStorage.setItem(`pv_config_${camId}`, JSON.stringify(cfg)) } catch {}
}

const inputStyle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.04)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font)',
  boxSizing: 'border-box',
}

const addInputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.04)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font)',
  boxSizing: 'border-box',
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass-card">
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          {title}
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 22px 22px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function CameraRow({ device, index, companyId, canRemove, onRemove }: {
  device: { id: string; name: string; color?: string }
  index: number
  companyId: string
  canRemove: boolean
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(device.name)
  const [saving,  setSaving]  = useState(false)
  const color = deviceColor(device.color, index)

  useEffect(() => { setNameVal(device.name) }, [device.name])

  async function saveName() {
    if (!nameVal.trim()) return
    setSaving(true)
    await set(ref(db, `companies/${companyId}/devices/${device.id}/name`), nameVal.trim())
    setSaving(false)
    setEditing(false)
  }

  async function saveColor(c: string) {
    await set(ref(db, `companies/${companyId}/devices/${device.id}/color`), c)
  }

  return (
    <div style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '12px 0' }}>
      {/* Top row: dot + name/input + pencil */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />

        {editing ? (
          <>
            <input
              autoFocus value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditing(false); setNameVal(device.name) } }}
              style={{ ...inputStyle, width: 160 }}
            />
            <button onClick={saveName} disabled={saving}
              style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>
              {saving ? '…' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setNameVal(device.name) }}
              style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.1)', background: 'none', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)', cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{device.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>ID: {device.id}</div>
            </div>
            <button onClick={() => setEditing(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1, marginLeft: 2 }}
              title="Edit">✏️</button>
          </>
        )}
      </div>

      {/* Edit mode: color swatches + remove */}
      {editing && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginRight: 4 }}>Color:</span>
            {PALETTE.map(c => (
              <button key={c} onClick={() => saveColor(c)} title={c}
                style={{
                  width: 22, height: 22, borderRadius: '50%', border: 'none',
                  background: c, cursor: 'pointer', flexShrink: 0,
                  boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : 'none',
                  transition: 'box-shadow 0.15s',
                }}
              />
            ))}
          </div>
          {canRemove && (
            <button onClick={onRemove}
              style={{
                background: 'none', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, padding: '5px 12px', fontSize: 12,
                color: '#ef4444', cursor: 'pointer', fontFamily: 'var(--font)',
              }}>
              Remove Camera
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  const { companyId, devices, deviceId } = useAuth()
  const [selectedCamId, setSelectedCamId] = useState(deviceId || devices[0]?.id || '')

  useEffect(() => {
    if (!selectedCamId && devices.length) setSelectedCamId(devices[0].id)
  }, [devices])

  const [linePosition,   setLinePosition]   = useState(50)
  const [countDirection, setCountDirection] = useState('down')
  const [confidence,     setConfidence]     = useState(45)
  const [cameraIndex,    setCameraIndex]    = useState(0)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!selectedCamId || !companyId) return
    const saved = loadLocal(selectedCamId)
    setLinePosition(saved.linePosition   ?? 50)
    setCountDirection(saved.countDirection ?? 'down')
    setConfidence(saved.confidence       ?? 45)
    setCameraIndex(saved.cameraIndex     ?? 0)
    setStatus('idle')
    const r = ref(db, `companies/${companyId}/devices/${selectedCamId}/config`)
    const h = (snap: any) => {
      if (!snap.exists()) return
      const d = snap.val()
      if (d.linePosition   !== undefined) setLinePosition(d.linePosition)
      if (d.countDirection !== undefined) setCountDirection(d.countDirection)
      if (d.confidence     !== undefined) setConfidence(d.confidence)
      if (d.cameraIndex    !== undefined) setCameraIndex(d.cameraIndex)
    }
    onValue(r, h)
    return () => off(r, 'value', h)
  }, [selectedCamId, companyId])

  async function handleSave() {
    setStatus('saving')
    const cfg = { linePosition, countDirection, confidence, cameraIndex }
    saveLocal(selectedCamId, cfg)
    try {
      await Promise.all([
        set(ref(db, `companies/${companyId}/devices/${selectedCamId}/config/linePosition`),   linePosition),
        set(ref(db, `companies/${companyId}/devices/${selectedCamId}/config/countDirection`), countDirection),
        set(ref(db, `companies/${companyId}/devices/${selectedCamId}/config/confidence`),     confidence),
        set(ref(db, `companies/${companyId}/devices/${selectedCamId}/config/cameraIndex`),    cameraIndex),
      ])
      setStatus('saved')
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus('idle'), 2500)
  }

  const [newCamName, setNewCamName] = useState('')
  const [newCamId,   setNewCamId]   = useState('')
  const [camSaving,  setCamSaving]  = useState(false)
  const [camErr,     setCamErr]     = useState('')

  async function addCamera() {
    setCamErr('')
    if (!newCamName.trim() || !newCamId.trim()) { setCamErr('Both fields are required.'); return }
    const cleanId = newCamId.trim().toLowerCase().replace(/\s+/g, '-')
    if (devices.find(d => d.id === cleanId)) { setCamErr('Camera ID already exists.'); return }
    setCamSaving(true)
    try {
      await set(ref(db, `companies/${companyId}/devices/${cleanId}`), { name: newCamName.trim() })
      setNewCamName('')
      setNewCamId('')
    } catch {
      setCamErr('Failed to add camera.')
    } finally {
      setCamSaving(false)
    }
  }

  async function removeCamera(id: string) {
    if (devices.length <= 1) return
    if (!confirm('Remove this camera? This cannot be undone.')) return
    if (selectedCamId === id) setSelectedCamId(devices.find(d => d.id !== id)?.id ?? '')
    await remove(ref(db, `companies/${companyId}/devices/${id}`))
  }

  const selectedDevice = devices.find(d => d.id === selectedCamId)

  return (
    <div className="settings-page">
      <div>
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Configure your PiVision camera system</div>
      </div>

      {/* ── 1. Cameras (collapsible) ── */}
      <SectionCard title="Cameras">
        {devices.map((device, i) => (
          <CameraRow key={device.id} device={device} index={i} companyId={companyId}
            canRemove={devices.length > 1} onRemove={() => removeCamera(device.id)} />
        ))}

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Add Camera</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input style={{ ...addInputStyle, flex: '1 1 140px' }}
              placeholder="Camera name (e.g. Back Door)" value={newCamName}
              onChange={e => setNewCamName(e.target.value)} />
            <input style={{ ...addInputStyle, flex: '1 1 100px' }}
              placeholder="Camera ID (e.g. cam2)" value={newCamId}
              onChange={e => setNewCamId(e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
            <button onClick={addCamera} disabled={camSaving}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                background: 'var(--accent-blue)', color: '#fff', fontSize: 13,
                fontWeight: 600, fontFamily: 'var(--font)',
                cursor: camSaving ? 'not-allowed' : 'pointer', opacity: camSaving ? 0.7 : 1, whiteSpace: 'nowrap',
              }}>
              {camSaving ? 'Adding…' : '+ Add'}
            </button>
          </div>
          {camErr && <div style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>{camErr}</div>}
        </div>
      </SectionCard>

      {/* ── 2. Camera Settings (collapsible) ── */}
      <SectionCard title={`Camera Settings${selectedDevice ? ` — ${selectedDevice.name}` : ''}`}>

        {/* Camera selector pills */}
        {devices.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {devices.map((device, i) => (
              <button key={device.id} onClick={() => setSelectedCamId(device.id)}
                style={{
                  padding: '5px 14px', borderRadius: 8, fontFamily: 'var(--font)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  border: device.id === selectedCamId ? 'none' : '1px solid rgba(0,0,0,0.1)',
                  background: device.id === selectedCamId ? deviceColor(device.color, i) : 'rgba(0,0,0,0.04)',
                  color: device.id === selectedCamId ? '#fff' : 'var(--text-secondary)',
                  transition: 'background 0.15s, color 0.15s',
                }}>
                {device.name}
              </button>
            ))}
          </div>
        )}

        {/* Counting sub-section */}
        <div style={{ background: 'rgba(0,0,0,0.025)', borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>Counting</div>

          <div className="settings-row">
            <div>
              <div className="settings-row-label">Line Position</div>
              <div className="settings-row-sub">Counting line as % of frame height from top</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 36, textAlign: 'right' }}>{linePosition}%</span>
              <input type="range" min={0} max={100} value={linePosition}
                onChange={e => setLinePosition(Number(e.target.value))} style={{ width: 120 }} />
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row-label">Count Direction</div>
              <div className="settings-row-sub">Which direction to count as a crossing</div>
            </div>
            <select className="settings-select" value={countDirection} onChange={e => setCountDirection(e.target.value)}>
              <option value="down">Downward</option>
              <option value="up">Upward</option>
              <option value="right">Left to Right</option>
              <option value="left">Right to Left</option>
              <option value="both">Both Directions</option>
            </select>
          </div>

          <div className="settings-row" style={{ borderBottom: 'none' }}>
            <div>
              <div className="settings-row-label">Detection Confidence</div>
              <div className="settings-row-sub">Minimum YOLO confidence threshold (0–100%)</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 36, textAlign: 'right' }}>{confidence}%</span>
              <input type="range" min={0} max={100} value={confidence}
                onChange={e => setConfidence(Number(e.target.value))} style={{ width: 120 }} />
            </div>
          </div>
        </div>

        {/* Camera Hardware sub-section */}
        <div style={{ background: 'rgba(0,0,0,0.025)', borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>Camera Hardware</div>

          <div className="settings-row">
            <div>
              <div className="settings-row-label">Camera Index</div>
              <div className="settings-row-sub">USB camera device index (0–5)</div>
            </div>
            <input type="number" min={0} max={5} value={cameraIndex}
              onChange={e => setCameraIndex(Number(e.target.value))}
              style={{ width: 64, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, padding: '6px 10px', textAlign: 'center' }}
            />
          </div>

          <div className="settings-row" style={{ borderBottom: 'none' }}>
            <div>
              <div className="settings-row-label">AI Model</div>
              <div className="settings-row-sub">Object detection model in use</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>YOLOv8 Nano</div>
          </div>
        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={status === 'saving'}
          style={{
            width: '100%', padding: '11px', borderRadius: 10, border: 'none',
            background: status === 'saved' ? '#22c55e' : status === 'error' ? '#ef4444' : 'var(--accent-blue)',
            color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)',
            cursor: status === 'saving' ? 'not-allowed' : 'pointer',
            opacity: status === 'saving' ? 0.7 : 1, transition: 'background 0.2s',
          }}>
          {status === 'saving' ? 'Saving…'
            : status === 'saved' ? `Saved ✓ — ${selectedDevice?.name ?? ''}`
            : status === 'error' ? 'Failed ✗'
            : `Save Settings${selectedDevice && devices.length > 1 ? ` — ${selectedDevice.name}` : ''}`}
        </button>

        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.5 }}>
          Settings apply when <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>camera.py</code> starts. Restart the script after saving.
        </div>
      </SectionCard>

      {/* ── 3. PiVision Processor (collapsible) ── */}
      <SectionCard title="PiVision Processor">
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 4 }}>
            Process recorded video files directly from your computer. The PiVision Processor uses the same AI model as your cameras to count entries and automatically upload results to your dashboard.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            Sign in with your PiVision account, select a video file, place the counting line, and hit Process. Results appear in Analytics instantly.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Mac download */}
          <a
            href="https://github.com/noahmjacobs/pi-vision/releases/latest/download/PiVision-mac.dmg"
            download
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '14px 18px', borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.08)',
              background: 'rgba(0,0,0,0.025)',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.025)')}
            >
              {/* Apple icon */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--text-primary)" style={{ flexShrink: 0 }}>
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Download for Mac</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>macOS 11 or later · .dmg installer</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
          </a>

          {/* Windows download */}
          <a
            href="https://github.com/noahmjacobs/pi-vision/releases/latest/download/PiVision-windows.exe"
            download
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '14px 18px', borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.08)',
              background: 'rgba(0,0,0,0.025)',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.025)')}
            >
              {/* Windows icon */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--text-primary)" style={{ flexShrink: 0 }}>
                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Download for Windows</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Windows 10 or later · .exe installer</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
          </a>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 14, lineHeight: 1.5 }}>
          Requires a PiVision account. Your login credentials are stored securely on your device.
        </div>
      </SectionCard>
    </div>
  )
}
