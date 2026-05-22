import { useState, useEffect } from 'react'
import { ref, set } from 'firebase/database'
import { db } from '../firebase'
import { useFirebaseValue } from '../hooks/useFirebaseData'

function writeConfig(key: string, value: unknown) {
  set(ref(db, `config/${key}`), value).catch(err =>
    console.error(`Failed to write config/${key}:`, err)
  )
}

export default function Settings() {
  const { data: fbLinePosition }   = useFirebaseValue<number>('config/linePosition', 50, { cache: false })
  const { data: fbCountDirection } = useFirebaseValue<string>('config/countDirection', 'down', { cache: false })
  const { data: fbConfidence }     = useFirebaseValue<number>('config/confidence', 45, { cache: false })
  const { data: fbCameraIndex }    = useFirebaseValue<number>('config/cameraIndex', 0, { cache: false })

  const [linePosition, setLinePosition]     = useState(50)
  const [countDirection, setCountDirection] = useState('down')
  const [confidence, setConfidence]         = useState(45)
  const [cameraIndex, setCameraIndex]       = useState(0)

  useEffect(() => { setLinePosition(fbLinePosition) }, [fbLinePosition])
  useEffect(() => { setCountDirection(fbCountDirection) }, [fbCountDirection])
  useEffect(() => { setConfidence(fbConfidence) }, [fbConfidence])
  useEffect(() => { setCameraIndex(fbCameraIndex) }, [fbCameraIndex])

  return (
    <div className="settings-page">
      <div>
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Configure your PiVision camera system</div>
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
              type="range"
              min={0}
              max={100}
              value={linePosition}
              onChange={e => {
                const v = Number(e.target.value)
                setLinePosition(v)
                writeConfig('linePosition', v)
              }}
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
            onChange={e => {
              setCountDirection(e.target.value)
              writeConfig('countDirection', e.target.value)
            }}
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
              type="range"
              min={0}
              max={100}
              value={confidence}
              onChange={e => {
                const v = Number(e.target.value)
                setConfidence(v)
                writeConfig('confidence', v)
              }}
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
            type="number"
            min={0}
            max={5}
            value={cameraIndex}
            onChange={e => {
              const v = Number(e.target.value)
              setCameraIndex(v)
              writeConfig('cameraIndex', v)
            }}
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
          starts. Restart the camera script after making changes.
        </div>
      </div>
    </div>
  )
}
