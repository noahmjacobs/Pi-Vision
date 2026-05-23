import { useState } from 'react'
import { ref, set } from 'firebase/database'
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
  mode: 'people_counter' | 'seatbelt'
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

  function enter() {
    const firstDevice = company.devices[0]
    adminViewAs(company.id, firstDevice?.id ?? '')
    onNavigate('Dashboard')
  }

  return (
    <div className="glass-card" style={{ padding: '20px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{company.name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
          {company.devices.length === 0
            ? 'No cameras'
            : company.devices.map(d => d.name).join(', ')}
        </div>
      </div>
      <button
        onClick={enter}
        style={{
          flexShrink: 0,
          padding: '8px 18px', borderRadius: 9,
          border: 'none', background: 'var(--accent-blue)',
          color: '#fff', fontSize: 13, fontWeight: 600,
          fontFamily: 'var(--font)', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Enter →
      </button>
    </div>
  )
}

export default function Admin({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { allCompanies } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState<AddCompanyForm>({
    companyName: '', email: '', password: '', cameraName: '', cameraId: '', mode: 'people_counter',
  })
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')
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
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
      const uid  = cred.user.uid
      await secondaryAuth.signOut()

      await Promise.all([
        set(ref(db, `users/${uid}`), { companyId: cId, role: 'user', email }),
        set(ref(db, `companies/${cId}/name`), companyName.trim()),
        set(ref(db, `companies/${cId}/mode`), form.mode),
        set(ref(db, `companies/${cId}/devices/${cameraId.trim()}`), { name: cameraName.trim() }),
      ])

      setSuccess(`"${companyName}" created. Login: ${email}`)
      setForm({ companyName: '', email: '', password: '', cameraName: '', cameraId: '', mode: 'people_counter' })
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
          <div className="page-subtitle">Select a company to view their dashboard</div>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {allCompanies.length === 0 ? (
          <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
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
          <Field label="Camera Mode">
            <div style={{ display: 'flex', gap: 8 }}>
              {(['people_counter', 'seatbelt'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, mode: m }))}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                    fontFamily: 'var(--font)', cursor: 'pointer',
                    border: form.mode === m ? '1.5px solid var(--accent-blue)' : '1px solid rgba(0,0,0,0.1)',
                    background: form.mode === m ? 'rgba(29,110,244,0.08)' : 'rgba(0,0,0,0.03)',
                    color: form.mode === m ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  }}
                >
                  {m === 'people_counter' ? '🚶 People Counter' : '🚗 Seatbelt Compliance'}
                </button>
              ))}
            </div>
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
