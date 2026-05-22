import { ref, set } from 'firebase/database'
import { db } from '../firebase'
import { useFirebaseValue } from '../hooks/useFirebaseData'

function writeConfig(key: string, value: unknown) {
  set(ref(db, `config/${key}`), value).catch(err =>
    console.error(`Failed to write config/${key}:`, err)
  )
}

export default function Settings() {
  const { data: linePosition }   = useFirebaseValue<number>('config/linePosition', 50, { cache: false })
  const { data: countDirection } = useFirebaseValue<string>('config/countDirection', 'down', { cache: false })
  const { data: confidence }     = useFirebaseValue<number>('config/confidence', 45, { cache: false })
  const { data: cameraIndex }    = useFirebaseValue<number>('config/cameraIndex', 0, { cache: false })

  return (
    <div className="settings-page">
      <div>
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Configure your PiVision camera system</div>
      </div>

      {/* Counting */}
      <div className="glass-card settings-section">
        <div className="settings-section-title">Counting</div>

        {/* Line Position */}
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
              onChange={e => writeConfig('linePosition', Number(e.target.value))}
              style={{ width: 120 }}
            />
          </div>
        </div>

        {/* Count Direction */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Count Direction</div>
            <div className="settings-row-sub">Which direction to count as a crossing</div>
          </div>
          <select
            className="settings-select"
            value={countDirection}
            onChange={e => writeConfig('countDirection', e.target.value)}
          >
            <option value="down">Down only (entering)</option>
            <option value="up">Up only (exiting)</option>
            <option value="both">Both directions</option>
          </select>
        </div>

        {/* Detection Confidence */}
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
              onChange={e => writeConfig('confidence', Number(e.target.value))}
              style={{ width: 120 }}
            />
          </div>
        </div>
      </div>

      {/* Camera */}
      <div className="glass-card settings-section">
        <div className="settings-section-title">Camera</div>

        {/* Camera Index */}
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
            onChange={e => writeConfig('cameraIndex', Number(e.target.value))}
            style={{
              width: 64,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 14,
              padding: '6px 10px',
              textAlign: 'center',
            }}
          />
        </div>

        {/* Firebase Sync */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Firebase Sync</div>
            <div className="settings-row-sub">Sync events and stats to Realtime Database</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#22c55e' }}>Active</div>
        </div>

        {/* AI Model */}
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
          Settings are applied when <code style={{ fontFamily: 'monospace', fontSize: 12, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>camera.py</code> starts.
          Restart the camera script after making changes.
        </div>
      </div>
    </div>
  )
}
