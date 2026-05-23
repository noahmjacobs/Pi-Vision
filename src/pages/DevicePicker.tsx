import { useAuth } from '../context/AuthContext'
import { useFirebaseValue } from '../hooks/useFirebaseData'

function CameraIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )
}

function DeviceCard({ companyId, deviceId, name, onSelect }: {
  companyId: string
  deviceId: string
  name: string
  onSelect: () => void
}) {
  const path = `companies/${companyId}/devices/${deviceId}/camera/piConnected`
  const { data: isOnline } = useFirebaseValue<boolean>(path, false, { cache: false })
  const { data: count }    = useFirebaseValue<number>(
    `companies/${companyId}/devices/${deviceId}/stats/peopleCount`, 0, { cache: false }
  )

  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <div className="glass-card" style={{ padding: '20px 22px', transition: 'box-shadow 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(29,110,244,0.15)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: isOnline ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CameraIcon color={isOnline ? '#22c55e' : '#6b7280'} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{deviceId}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isOnline ? '#22c55e' : '#ef4444',
              boxShadow: isOnline ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 0 0 3px rgba(239,68,68,0.2)',
            }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: isOnline ? '#22c55e' : '#ef4444' }}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isOnline ? count.toLocaleString() : '—'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>people this session</span>
        </div>
      </div>
    </button>
  )
}

export default function DevicePicker() {
  const { companyName, companyId, devices, setDeviceId, signOut } = useAuth()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      padding: '40px 24px',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="logo-dot" />
            <span className="logo-text" style={{ fontSize: 18 }}>PiVision</span>
          </div>
          <button
            onClick={signOut}
            style={{
              background: 'none',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 13,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            Sign out
          </button>
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          {companyName || 'Your Cameras'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28 }}>
          Select a camera to view its dashboard
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {devices.map(device => (
            <DeviceCard
              key={device.id}
              companyId={companyId}
              deviceId={device.id}
              name={device.name}
              onSelect={() => setDeviceId(device.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
