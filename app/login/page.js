'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

// On the public demo deployment this shows one-click "explore" logins.
// Off by default so a real install never exposes the demo accounts.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [mode, setMode] = useState('password') // 'password' | 'magic' | 'forgot'
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef(null)

  // surface error details from auth callback failures or hash fragment errors
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const hash = window.location.hash

    // Supabase puts errors in the hash, e.g. #error=access_denied&error_code=otp_expired
    if (hash && hash.includes('error')) {
      const hashParams = new URLSearchParams(hash.substring(1))
      const errorCode = hashParams.get('error_code')
      const errorDesc = hashParams.get('error_description')
      if (errorCode === 'otp_expired') {
        setError('Your password reset link has expired. Please request a new one, or ask your admin to generate a fresh link.')
        setMode('forgot')
      } else if (errorDesc) {
        setError(errorDesc.replace(/\+/g, ' '))
      }
      window.history.replaceState(null, '', window.location.pathname)
    } else if (params.get('error_code') === 'otp_expired' || params.get('error') === 'access_denied') {
      setError('Your password reset link has expired. Please request a new one, or ask your admin to generate a fresh link.')
      setMode('forgot')
      window.history.replaceState(null, '', window.location.pathname)
    } else if (params.get('error') === 'auth_callback_failed') {
      setError('Authentication failed. Your link may have expired — try requesting a new one.')
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setTimeout(() => setCooldown(c => c - 1), 1000)
      return () => clearTimeout(cooldownRef.current)
    }
  }, [cooldown])

  function parseRateLimitError(msg) {
    if (!msg) return null
    const lower = msg.toLowerCase()
    if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('email rate limit') || lower.includes('over_email_send_rate_limit') || lower.includes('security purposes')) {
      return true
    }
    // Extract wait time if present
    const match = msg.match(/(\d+)\s*second/i)
    if (match) return parseInt(match[1], 10)
    return null
  }

  async function handlePasswordLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  async function quickLogin(demoEmail) {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: demoEmail, password: 'demo1234' })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  async function handleMagicLink(e) {
    e.preventDefault()
    if (cooldown > 0) return
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + '/auth/callback?next=/dashboard' } })
    if (error) {
      const rl = parseRateLimitError(error.message)
      if (rl) {
        setCooldown(typeof rl === 'number' ? rl : 60)
        setError('Email rate limit reached. Please wait before trying again.')
      } else {
        setError(error.message)
      }
      setLoading(false)
    } else {
      setMagicSent(true); setLoading(false)
      setCooldown(60) // block re-sends for 60s
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    if (cooldown > 0) return
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth/callback?next=/reset-password',
    })
    if (error) {
      const rl = parseRateLimitError(error.message)
      if (rl) {
        setCooldown(typeof rl === 'number' ? rl : 60)
        setError('Email rate limit reached. Please wait before trying again, or ask your admin to send you a reset link directly.')
      } else {
        setError(error.message)
      }
      setLoading(false)
    } else {
      setResetSent(true); setLoading(false)
      setCooldown(60)
    }
  }

  const submitted = magicSent || resetSent

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-base)' }}>
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(37, 99, 235,0.12) 0%, transparent 70%)' }} />

      <div className="w-full max-w-md relative">
        {/* Icon */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5">
            <div style={{ padding: 8, borderRadius: 22, border: '1px solid rgba(37, 99, 235,0.25)', background: '#FFFFFF', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
              <img src="/icon.svg" alt="Strategic Tracker" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 18, display: 'block' }} />
            </div>
          </div>
          <h1 className="font-display text-3xl text-slate-800 mb-2" style={{ letterSpacing: '0.05em' }}>Strategic Tracker</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sign in to your workspace</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

          {/* Success states */}
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(37, 99, 235,0.1)', border: '1px solid rgba(37, 99, 235,0.2)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <h2 style={{ fontWeight: 700, fontSize: 16, color: 'white', marginBottom: 8 }}>Check your email</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {resetSent ? 'A password reset link has been sent to' : 'A magic link has been sent to'}{' '}
                <strong style={{ color: 'white' }}>{email}</strong>.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
                Check your spam/junk folder if you don't see it within a few minutes.
              </p>
              {resetSent && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.1)' }}>
                  💡 If the email doesn't arrive, ask your admin — they can generate a reset link for you directly from the admin panel.
                </p>
              )}
              <button onClick={() => { setMagicSent(false); setResetSent(false); setMode('password') }}
                style={{ marginTop: 24, fontSize: 12, textDecoration: 'underline', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              {DEMO_MODE && mode !== 'forgot' && (
                <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: 'rgba(37, 99, 235,0.06)', border: '1px solid rgba(37, 99, 235,0.2)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#2563EB', marginBottom: 4 }}>Live demo</div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                    Jump in with sample data, no sign-up needed.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => quickLogin('jordan.hayes@example.com')} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none',
                        cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: 'white' }}>
                      Enter as CEO
                    </button>
                    <button type="button" onClick={() => quickLogin('dana.whitfield@example.com')} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer', background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                      Enter as a team member
                    </button>
                  </div>
                </div>
              )}

              {/* mode tabs: password + magic only, forgot is a link */}
              {mode !== 'forgot' && (
                <div className="flex rounded-lg p-1 mb-6" style={{ background: 'var(--bg-base)' }}>
                  {[['password', 'Password'], ['magic', 'Magic Link']].map(([m, label]) => (
                    <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                      flex: 1, padding: '8px 0', fontSize: 13, borderRadius: 6, border: 'none',
                      background: mode === m ? 'var(--bg-elevated)' : 'transparent',
                      color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                      borderBottom: mode === m ? '2px solid #2563EB' : '2px solid transparent',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}>{label}</button>
                  ))}
                </div>
              )}

              {/* Forgot password header */}
              {mode === 'forgot' && (
                <div style={{ marginBottom: 24 }}>
                  <button onClick={() => { setMode('password'); setError('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                    Back to sign in
                  </button>
                  <h2 style={{ fontWeight: 700, fontSize: 16, color: 'white', marginBottom: 4 }}>Reset your password</h2>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Enter your email and we'll send you a reset link.</p>
                </div>
              )}

              <form onSubmit={mode === 'password' ? handlePasswordLogin : mode === 'magic' ? handleMagicLink : handleForgotPassword}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, marginBottom: 8, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com" required
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 8, fontSize: 13, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                </div>

                {mode === 'password' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 11, marginBottom: 8, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" required
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 8, fontSize: 13, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  </div>
                )}

                {error && (
                  <div style={{ fontSize: 13, padding: '12px 16px', borderRadius: 8, background: 'rgba(214,32,39,0.1)', color: '#F87171', border: '1px solid rgba(214,32,39,0.2)', lineHeight: 1.5 }}>
                    {error}
                    {cooldown > 0 && (
                      <div style={{ marginTop: 6, fontSize: 12, color: '#F59E0B' }}>
                        ⏱ You can try again in {cooldown}s
                      </div>
                    )}
                  </div>
                )}

                <button type="submit" disabled={loading || (cooldown > 0 && mode !== 'password')} style={{
                  width: '100%', padding: '13px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.08em', border: 'none', marginTop: 4,
                  background: (loading || (cooldown > 0 && mode !== 'password')) ? 'rgba(37, 99, 235,0.2)' : 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                  color: 'white', cursor: (loading || (cooldown > 0 && mode !== 'password')) ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 20px rgba(37, 99, 235,0.25)',
                }}>
                  {loading ? 'Please wait…'
                    : cooldown > 0 && mode !== 'password' ? `Wait ${cooldown}s…`
                    : mode === 'magic' ? 'Send Magic Link'
                    : mode === 'forgot' ? 'Send Reset Link'
                    : 'Sign In'}
                </button>

                {/* Forgot password link */}
                {mode === 'password' && (
                  <button type="button" onClick={() => { setMode('forgot'); setError('') }}
                    style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'center' }}>
                    Forgot your password?
                  </button>
                )}
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, marginTop: 24, color: 'var(--text-muted)' }}>
          New users are added by the admin. Contact your administrator if you need access.
        </p>
      </div>
    </div>
  )
}
