'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

function getPasswordStrength(pwd) {
  const checks = {
    length: pwd.length >= 10,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  }
  const passed = Object.values(checks).filter(Boolean).length
  return { checks, passed, score: passed }
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState('Verifying your reset link…')

  const strength = getPasswordStrength(password)

  useEffect(() => {
    let cancelled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        if (session) setSessionReady(true)
      }
    })

    // token_hash in the query params comes from admin-generated links
    async function checkTokenHash() {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token_hash')
      const type = params.get('type')
      if (tokenHash && type === 'recovery') {
        if (!cancelled) setCheckingStatus('Verifying recovery token…')
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })
        if (!error && data?.session && !cancelled) {
          setSessionReady(true)
          window.history.replaceState(null, '', window.location.pathname)
          return
        }
        if (error && !cancelled) {
          setCheckingStatus('Token verification failed: ' + error.message)
        }
      }
    }
    checkTokenHash()

    // hash tokens show up on the non-PKCE flow / direct links
    async function checkHashTokens() {
      if (typeof window === 'undefined') return
      const hash = window.location.hash
      if (hash && (hash.includes('access_token') || hash.includes('type=recovery'))) {
        if (!cancelled) setCheckingStatus('Processing recovery token…')
        // Supabase client auto-detects hash tokens, give it a moment
        await new Promise(r => setTimeout(r, 2000))
        const { data: { session } } = await supabase.auth.getSession()
        if (session && !cancelled) { setSessionReady(true); return }
      }
    }
    checkHashTokens()

    // retry getSession a few times, cookies may need time to propagate
    async function checkSession() {
      for (let i = 0; i < 8; i++) {
        if (cancelled) return
        setCheckingStatus(i === 0 ? 'Verifying your reset link…' : `Still checking (attempt ${i + 1}/8)…`)
        const { data: { session } } = await supabase.auth.getSession()
        if (session && !cancelled) { setSessionReady(true); return }
        await new Promise(r => setTimeout(r, 1500))
      }
    }
    checkSession()

    const timeout = setTimeout(() => { if (!cancelled) setTimedOut(true) }, 15000)

    return () => { cancelled = true; subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  async function handleReset(e) {
    e.preventDefault()
    if (strength.passed < 5) { setError('Please meet all password requirements below'); return }
    if (password !== confirm) { setError("Passwords don't match"); return }
    setLoading(true); setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      if (updateError.message.includes('same password') || updateError.message.includes('should be different')) {
        setError('New password must be different from your current password.')
      } else if (updateError.message.includes('session')) {
        setError('Your session has expired. Please request a new password reset link.')
      } else {
        setError(updateError.message)
      }
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    }
  }

  const strengthColors = ['#EF4444','#F59E0B','#F59E0B','#34D399','#2563EB']
  const strengthLabels = ['','Weak','Fair','Good','Strong','Very Strong']

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-base)' }}>
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(37, 99, 235,0.12) 0%, transparent 70%)' }} />
      <div className="w-full max-w-md relative">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5">
            <div style={{ padding: 8, borderRadius: 22, border: '1px solid rgba(37, 99, 235,0.25)', background: '#FFFFFF', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
              <img src="/icon.svg" alt="Strategic Tracker" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 18, display: 'block' }} />
            </div>
          </div>
          <h1 style={{ fontWeight: 700, fontSize: 24, color: '#1E293B', letterSpacing: '0.05em', marginBottom: 8 }}>Set New Password</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Choose a strong password for your account</p>
        </div>

        <div style={{ height: 1, marginBottom: 32, background: 'linear-gradient(90deg, #2563EB, transparent)', borderRadius: 1 }} />

        <div className="rounded-2xl p-8" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {done ? (
            <div className="text-center py-4">
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ fontWeight: 700, fontSize: 16, color: 'white', marginBottom: 8 }}>Password updated!</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Redirecting you to the dashboard…</p>
            </div>
          ) : !sessionReady ? (
            <div className="text-center py-8">
              {!timedOut ? (
                <>
                  <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#2563EB', borderTopColor: 'transparent' }} />
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{checkingStatus}</p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                  <p style={{ fontSize: 14, color: '#F59E0B', fontWeight: 600, marginBottom: 8 }}>Could not verify your reset link</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                    This can happen if:
                  </p>
                  <ul style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', marginBottom: 16, lineHeight: 1.8, paddingLeft: 20 }}>
                    <li>The link has expired (they last 1 hour)</li>
                    <li>The link was already used</li>
                    <li>The email rate limit was reached</li>
                  </ul>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5, padding: '8px 12px', borderRadius: 8, background: 'rgba(37, 99, 235,0.06)', border: '1px solid rgba(37, 99, 235,0.12)' }}>
                    💡 Ask your admin to generate a fresh reset link from the admin panel -- it bypasses email limits.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={() => router.push('/login')} style={{
                      padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: 'rgba(37, 99, 235,0.15)', color: '#2563EB',
                      border: '1px solid rgba(37, 99, 235,0.3)', cursor: 'pointer',
                    }}>
                      Back to Login
                    </button>
                    <button onClick={() => { setTimedOut(false); window.location.reload() }} style={{
                      padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: 'rgba(0,0,0,0.04)', color: 'var(--text-muted)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                    }}>
                      Try Again
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>New password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 10 characters" required
                    className="w-full px-4 py-3 rounded-lg text-sm transition-all"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPwd(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}>
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>

                {/* Strength bar */}
                {password.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                      {[1,2,3,4,5].map(i => (
                        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= strength.passed ? strengthColors[strength.passed - 1] : 'var(--bg-elevated)', transition: 'background 0.3s' }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: strength.passed >= 4 ? '#34D399' : strength.passed >= 2 ? '#F59E0B' : '#F87171', marginBottom: 8 }}>
                      {strengthLabels[strength.passed]}
                    </div>
                    {/* Requirements checklist */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      {[
                        ['length', '10+ characters'],
                        ['upper', 'Uppercase letter'],
                        ['lower', 'Lowercase letter'],
                        ['number', 'Number'],
                        ['special', 'Special character (!@#$…)'],
                      ].map(([key, label]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: strength.checks[key] ? '#34D399' : 'var(--text-muted)' }}>
                          <span>{strength.checks[key] ? '✓' : '○'}</span>
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Confirm password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password" required
                  className="w-full px-4 py-3 rounded-lg text-sm transition-all"
                  style={{ background: 'var(--bg-base)', border: `1px solid ${confirm && confirm !== password ? 'rgba(214,32,39,0.4)' : 'var(--border)'}`, color: 'var(--text-primary)' }} />
                {confirm && confirm !== password && <p style={{ fontSize: 11, color: '#F87171', marginTop: 4 }}>Passwords don't match</p>}
                {confirm && confirm === password && <p style={{ fontSize: 11, color: '#34D399', marginTop: 4 }}>✓ Passwords match</p>}
              </div>

              {error && <div style={{ fontSize: 13, padding: '12px 16px', borderRadius: 8, background: 'rgba(214,32,39,0.1)', color: '#F87171', border: '1px solid rgba(214,32,39,0.2)' }}>{error}</div>}

              <button type="submit" disabled={loading || strength.passed < 5 || password !== confirm} style={{
                width: '100%', padding: '13px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                letterSpacing: '0.08em', border: 'none', marginTop: 8,
                background: (loading || strength.passed < 5 || password !== confirm) ? 'rgba(37, 99, 235,0.2)' : 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                color: 'white', cursor: (loading || strength.passed < 5 || password !== confirm) ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 20px rgba(37, 99, 235,0.2)',
              }}>
                {loading ? 'Updating…' : 'Set New Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
