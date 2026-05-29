import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 12,
    border: '1px solid var(--glass-border)',
    background: 'var(--glass-bg)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'var(--font)',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative orbs */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-5%',
        width: 520, height: 520, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(29,110,244,0.13) 0%, transparent 68%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-5%',
        width: 440, height: 440, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 68%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '55%', left: '60%',
        width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(20,184,166,0.07) 0%, transparent 68%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 18,
            background: 'var(--glass-bg-strong)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--glass-shadow)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--accent-blue)',
              boxShadow: '0 0 0 5px rgba(29,110,244,0.18)',
            }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            PiVision
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 5 }}>
            Sign in to your dashboard
          </div>
        </div>

        {/* Glass card */}
        <div style={{
          background: 'var(--glass-bg-strong)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 24,
          boxShadow: 'var(--glass-shadow-lg)',
          padding: '36px 32px',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 7, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@company.com"
                style={inputStyle}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(29,110,244,0.5)'
                  e.target.style.boxShadow   = '0 0 0 3px rgba(29,110,244,0.12)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'var(--glass-border)'
                  e.target.style.boxShadow   = 'none'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: 7, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={inputStyle}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(29,110,244,0.5)'
                  e.target.style.boxShadow   = '0 0 0 3px rgba(29,110,244,0.12)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'var(--glass-border)'
                  e.target.style.boxShadow   = 'none'
                }}
              />
            </div>

            {error && (
              <div style={{
                fontSize: 13, color: '#ef4444',
                padding: '9px 13px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.18)',
                borderRadius: 10,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 6,
                padding: '12px',
                borderRadius: 12,
                border: 'none',
                background: loading ? 'rgba(29,110,244,0.55)' : 'var(--accent-blue)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'var(--font)',
                cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: '-0.1px',
                boxShadow: loading ? 'none' : '0 2px 14px rgba(29,110,244,0.38)',
                transition: 'background 0.15s, box-shadow 0.15s, transform 0.1s',
              }}
              onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.transform = 'translateY(0)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
