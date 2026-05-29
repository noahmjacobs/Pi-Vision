// Camera management (CameraRow, addCamera, removeCamera) and Camera Settings
// (line position, count direction, confidence, camera index) have been archived.
// Those sections were for the old Raspberry Pi live camera setup, which is
// shelved while the desktop processor app is the primary product.
// To restore: check git history for the full camera settings implementation.

import type { ReactNode } from 'react'

function DownloadCard({
  icon, title, subtitle, href,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  href: string
}) {
  return (
    <a href={href} download style={{ textDecoration: 'none' }}>
      <div
        className="glass-card"
        style={{
          display: 'flex', alignItems: 'center', gap: 18,
          padding: '18px 22px', cursor: 'pointer',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = 'var(--glass-shadow-lg)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = ''
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'var(--accent-blue-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent-blue)',
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>{subtitle}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>
    </a>
  )
}

function AppleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function WindowsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  )
}

export default function Settings() {
  return (
    <div className="settings-page">
      <div>
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Manage your PiVision setup</div>
      </div>

      {/* ── PiVision Processor downloads ── */}
      <div className="glass-card" style={{ padding: '22px 24px' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            PiVision Processor
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Desktop app for processing recorded video files. Sign in, drop a video, set a counting line, and results appear in Analytics instantly. No cloud upload — video stays on your machine.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DownloadCard
            href="https://github.com/noahmjacobs/pi-vision/releases/latest/download/PiVision-mac.dmg"
            icon={<AppleIcon />}
            title="Download for Mac"
            subtitle="macOS 11 or later · .dmg installer"
          />
          <DownloadCard
            href="https://github.com/noahmjacobs/pi-vision/releases/latest/download/PiVision-windows.exe"
            icon={<WindowsIcon />}
            title="Download for Windows"
            subtitle="Windows 10 or later · .exe installer"
          />
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 14, lineHeight: 1.5 }}>
          Sign in with your PiVision account credentials. Session is stored locally on your device.
        </div>
      </div>
    </div>
  )
}
