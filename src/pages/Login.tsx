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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(145deg, #e8edf8 0%, #dde3f0 50%, #e4e8f5 100%)',
      backgroundAttachment: 'fixed',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative orbs */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-5%',
        width: 480, height: 480, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(29,110,244,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-8%', right: '-4%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168,85,247,0.09) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 4px 24px rgba(29,110,244,0.15), 0 1px 4px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--accent-blue)',
              boxShadow: '0 0 0 5px rgba(29,110,244,0.18)',
            }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.4px' }}>
            PiVision
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Sign in to your dashboard
          </div>
        </div>

        {/* Glass card */}
        <div style={{
          background: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          border: '1px solid rgba(255,255,255,0.92)',
          borderRadius: 24,
          boxShadow: '0 8px 40px rgba(0,0,0,0.09), 0 2px 8px rgba(0,0,0,0.04)',
          padding: '36px 32px',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 7, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@company.com"
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.10)',
                  background: 'rgba(255,255,255,0.6)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontFamily: 'var(--font)',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(29,110,244,0.5)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(29,110,244,0.1)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(0,0,0,0.10)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 7, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.10)',
                  background: 'rgba(255,255,255,0.6)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontFamily: 'var(--font)',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(29,110,244,0.5)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(29,110,244,0.1)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(0,0,0,0.10)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            {error && (
              <div style={{
                fontSize: 13, color: '#ef4444',
                padding: '9px 13px',
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.15)',
                borderRadius: 10,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
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
                boxShadow: loading ? 'none' : '0 2px 12px rgba(29,110,244,0.35)',
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
