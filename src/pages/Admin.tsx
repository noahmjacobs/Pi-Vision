import { useState } from 'react'
import { ref, set, remove } from 'firebase/database'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { db, secondaryAuth } from '../firebase'
import { useAuth, Company } from '../context/AuthContext'
import { type Page } from '../App'

interface AddCompanyForm {
  companyName: string
  email: string
  password: string
  cameraName: string
  cameraId: string
}

interface AddCameraForm {
  cameraName: string
  cameraId: string
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 440, padding: '32px 28px' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.04)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font)',
  boxSizing: 'border-box',
}

function CompanyCard({ company, onNavigate }: { company: Company; onNavigate: (page: Page) => void }) {
  const { adminViewAs } = useAuth()
  const [expanded, setExpanded]     = useState(false)
  const [showAddCam, setShowAddCam] = useState(false)
  const [camForm, setCamForm]       = useState<AddCameraForm>({ cameraName: '', cameraId: '' })
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState('')

  async function addCamera() {
    if (!camForm.cameraName.trim() || !camForm.cameraId.trim()) return
    setSaving(true)
    setErr('')
    try {
      await set(ref(db, `companies/${company.id}/devices/${camForm.cameraId.trim()}`), {
        name: camForm.cameraName.trim(),
      })
      setShowAddCam(false)
      setCamForm({ cameraName: '', cameraId: '' })
    } catch {
      setErr('Failed to add camera.')
    } finally {
      setSaving(false)
    }
  }

  async function removeCamera(deviceId: string) {
    if (!confirm(`Remove camera "${deviceId}" from ${company.name}?`)) return
    await remove(ref(db, `companies/${company.id}/devices/${deviceId}`))
  }

  return (
    <>
      <div className="glass-card" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{company.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              {company.devices.length} camera{company.devices.length !== 1 ? 's' : ''} · ID: {company.id}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowAddCam(true)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(29,110,244,0.3)', background: 'rgba(29,110,244,0.08)', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              + Camera
            </button>
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              {expanded ? 'Hide' : 'View'}
            </button>
          </div>
        </div>

        {expanded && company.devices.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {company.devices.map(device => (
              <div key={device.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(0,0,0,0.03)', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{device.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{device.id}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { adminViewAs(company.id, device.id); onNavigate('Dashboard') }}
                    style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    Open
                  </button>
                  <button
                    onClick={() => removeCamera(device.id)}
                    style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {expanded && company.devices.length === 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>No cameras yet — add one above.</div>
        )}
      </div>

      {showAddCam && (
        <Modal title={`Add Camera to ${company.name}`} onClose={() => setShowAddCam(false)}>
          <Field label="Camera Name (display name)">
            <input style={inputStyle} value={camForm.cameraName}
              onChange={e => setCamForm(f => ({ ...f, cameraName: e.target.value }))}
              placeholder="e.g. Front Door" />
          </Field>
          <Field label="Camera ID (used in camera.py as DEVICE_ID)">
            <input style={inputStyle} value={camForm.cameraId}
              onChange={e => setCamForm(f => ({ ...f, cameraId: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
              placeholder="e.g. cam1" />
          </Field>
          {err && <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{err}</div>}
          <button onClick={addCamera} disabled={saving} style={{ width: '100%', padding: '10px', borderRadius: 9, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Adding…' : 'Add Camera'}
          </button>
        </Modal>
      )}
    </>
  )
}

export default function Admin({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { allCompanies } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState<AddCompanyForm>({
    companyName: '', email: '', password: '', cameraName: '', cameraId: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')
  const [success, setSuccess] = useState('')

  function companyIdFromName(name: string) {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  }

  async function handleAddCompany() {
    setErr('')
    setSuccess('')
    const { companyName, email, password, cameraName, cameraId } = form
    if (!companyName.trim() || !email.trim() || !password.trim() || !cameraName.trim() || !cameraId.trim()) {
      setErr('All fields are required.')
      return
    }
    setSaving(true)
    const cId = companyIdFromName(companyName)
    try {
      // Create user with secondary auth so admin stays signed in
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
      const uid  = cred.user.uid
      await secondaryAuth.signOut()

      await Promise.all([
        set(ref(db, `users/${uid}`), { companyId: cId, role: 'user', email }),
        set(ref(db, `companies/${cId}/name`), companyName.trim()),
        set(ref(db, `companies/${cId}/devices/${cameraId.trim()}`), { name: cameraName.trim() }),
      ])

      setSuccess(`Company "${companyName}" created. Login: ${email}`)
      setForm({ companyName: '', email: '', password: '', cameraName: '', cameraId: '' })
      setShowAdd(false)
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to create company.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div>
          <div className="page-title">Admin</div>
          <div className="page-subtitle">Manage companies and cameras</div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}
        >
          + Add Company
        </button>
      </div>

      {success && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontSize: 13, fontWeight: 500 }}>
          {success}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {allCompanies.length === 0 ? (
          <div className="glass-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
            No companies yet. Click "+ Add Company" to get started.
          </div>
        ) : (
          allCompanies.map(company => (
            <CompanyCard key={company.id} company={company} onNavigate={onNavigate} />
          ))
        )}
      </div>

      {showAdd && (
        <Modal title="Add New Company" onClose={() => setShowAdd(false)}>
          <Field label="Company Name">
            <input style={inputStyle} value={form.companyName} autoFocus
              onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              placeholder="e.g. Acme Corp" />
          </Field>
          <Field label="Login Email">
            <input style={inputStyle} type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="company@email.com" />
          </Field>
          <Field label="Login Password">
            <input style={inputStyle} type="password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Min 6 characters" />
          </Field>
          <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', margin: '4px 0 16px' }} />
          <Field label="First Camera Name">
            <input style={inputStyle} value={form.cameraName}
              onChange={e => setForm(f => ({ ...f, cameraName: e.target.value }))}
              placeholder="e.g. Front Door" />
          </Field>
          <Field label="Camera ID (used as DEVICE_ID in camera.py)">
            <input style={inputStyle} value={form.cameraId}
              onChange={e => setForm(f => ({ ...f, cameraId: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
              placeholder="e.g. cam1" />
          </Field>
          {err && <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{err}</div>}
          <button onClick={handleAddCompany} disabled={saving} style={{ width: '100%', padding: '11px', borderRadius: 9, border: 'none', background: saving ? 'rgba(29,110,244,0.5)' : 'var(--accent-blue)', color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Creating…' : 'Create Company'}
          </button>
        </Modal>
      )}
    </div>
  )
}
