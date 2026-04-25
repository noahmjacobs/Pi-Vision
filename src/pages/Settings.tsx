import { useState } from 'react'

export default function Settings() {
  const [motionAlerts, setMotionAlerts] = useState(true)
  const [personAlerts, setPersonAlerts] = useState(true)
  const [packageAlerts, setPackageAlerts] = useState(true)
  const [nightMode, setNightMode] = useState(false)
  const [autoRecord, setAutoRecord] = useState(true)
  const [resolution, setResolution] = useState('1080p')
  const [fps, setFps] = useState('30')
  const [retention, setRetention] = useState('7')

  return (
    <div className="settings-page">
      <div>
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Configure your PiVision camera system</div>
      </div>

      {/* Alerts */}
      <div className="glass-card settings-section">
        <div className="settings-section-title">Notifications</div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Motion Alerts</div>
            <div className="settings-row-sub">Get notified on any motion detection</div>
          </div>
          <button className={`toggle${motionAlerts ? ' on' : ''}`} onClick={() => setMotionAlerts(v => !v)} />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Person Identified</div>
            <div className="settings-row-sub">Alert when a person is detected by AI</div>
          </div>
          <button className={`toggle${personAlerts ? ' on' : ''}`} onClick={() => setPersonAlerts(v => !v)} />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Package Detection</div>
            <div className="settings-row-sub">Alert on package delivery or removal</div>
          </div>
          <button className={`toggle${packageAlerts ? ' on' : ''}`} onClick={() => setPackageAlerts(v => !v)} />
        </div>
      </div>

      {/* Camera */}
      <div className="glass-card settings-section">
        <div className="settings-section-title">Camera</div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Resolution</div>
            <div className="settings-row-sub">Video capture resolution</div>
          </div>
          <select className="settings-select" value={resolution} onChange={e => setResolution(e.target.value)}>
            <option>480p</option>
            <option>720p</option>
            <option>1080p</option>
            <option>4K</option>
          </select>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Frame Rate</div>
            <div className="settings-row-sub">Capture frames per second</div>
          </div>
          <select className="settings-select" value={fps} onChange={e => setFps(e.target.value)}>
            <option>15</option>
            <option>24</option>
            <option>30</option>
            <option>60</option>
          </select>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Night Mode</div>
            <div className="settings-row-sub">Enable infrared / low-light processing</div>
          </div>
          <button className={`toggle${nightMode ? ' on' : ''}`} onClick={() => setNightMode(v => !v)} />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Auto Record on Motion</div>
            <div className="settings-row-sub">Automatically save clips when motion is detected</div>
          </div>
          <button className={`toggle${autoRecord ? ' on' : ''}`} onClick={() => setAutoRecord(v => !v)} />
        </div>
      </div>

      {/* Storage */}
      <div className="glass-card settings-section">
        <div className="settings-section-title">Storage</div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Retention Period</div>
            <div className="settings-row-sub">How long to keep recorded footage</div>
          </div>
          <select className="settings-select" value={retention} onChange={e => setRetention(e.target.value)}>
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Firebase Sync</div>
            <div className="settings-row-sub">Sync events and stats to Realtime Database</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#22c55e' }}>Active</div>
        </div>
      </div>

      {/* System */}
      <div className="glass-card settings-section">
        <div className="settings-section-title">System</div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">AI Model</div>
            <div className="settings-row-sub">Claude version used for analysis</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Claude 3.5</div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Camera Location</div>
            <div className="settings-row-sub">Physical location label</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Provo, UT</div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Camera ID</div>
            <div className="settings-row-sub">Unique identifier for this unit</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>CAM-01</div>
        </div>
      </div>
    </div>
  )
}
