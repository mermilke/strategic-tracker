'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function Navbar({ user, profile }) {
  const router = useRouter()
  const pathname = usePathname()
  const isManager = profile?.role === 'manager' || profile?.role === 'admin'

  const [directReports, setDirectReports] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [showDashDropdown, setShowDashDropdown] = useState(false)
  const dropdownTimeout = useRef(null)
  const dashDropdownTimeout = useRef(null)

  useEffect(() => {
    if (!isManager) return
    async function loadReports() {
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'direct_report')
        .order('full_name')
      setDirectReports(data || [])
    }
    loadReports()
  }, [isManager])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleDropdownEnter() {
    clearTimeout(dropdownTimeout.current)
    setShowDropdown(true)
  }

  function handleDropdownLeave() {
    dropdownTimeout.current = setTimeout(() => setShowDropdown(false), 150)
  }

  function handleDashDropdownEnter() {
    clearTimeout(dashDropdownTimeout.current)
    setShowDashDropdown(true)
  }

  function handleDashDropdownLeave() {
    dashDropdownTimeout.current = setTimeout(() => setShowDashDropdown(false), 150)
  }

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: 60,
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(37, 99, 235,0.15)',
    }}>
      {/* Top brand line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #2563EB, #4F46E5)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        {/* Logo */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}
          onClick={() => router.push('/dashboard')}
        >
          <img
            src="/icon.svg"
            alt="Strategic Tracker"
            style={{ height: 30, width: 30, objectFit: 'contain', borderRadius: 8 }}
          />
          <span style={{
            fontFamily: "'Poppins', 'DM Sans', sans-serif",
            fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: '#0F172A' }}>Strategic</span>
            <span style={{ color: '#2563EB' }}> Tracker</span>
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'rgba(37, 99, 235,0.2)' }} />

        {/* Nav links */}
        <div style={{ display: 'flex', gap: 4 }}>
          {isManager ? (
            <div
              style={{ position: 'relative' }}
              onMouseEnter={handleDashDropdownEnter}
              onMouseLeave={handleDashDropdownLeave}
            >
              <NavLink href="/dashboard" active={pathname === '/dashboard'} router={router}>
                Dashboard
              </NavLink>
              {showDashDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4,
                  background: 'rgba(255,255,255,0.98)',
                  border: '1px solid rgba(37, 99, 235,0.2)',
                  borderRadius: 8,
                  padding: '4px 0',
                  minWidth: 150,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  zIndex: 100,
                }}>
                  {[['overview', 'Overview'], ['analytics', 'Analytics']].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setShowDashDropdown(false)
                        router.push(`/dashboard?view=${key}`)
                      }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 14px', fontSize: 12,
                        background: 'transparent', border: 'none',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.background = 'rgba(37, 99, 235,0.1)'
                        e.currentTarget.style.color = '#2563EB'
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--text-secondary)'
                      }}
                    >
                      {key === 'analytics' ? '\uD83D\uDCCA ' : ''}{label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NavLink href="/dashboard" active={pathname === '/dashboard'} router={router}>
              My Dashboard
            </NavLink>
          )}
          {!isManager && (
            <NavLink href="/checkin" active={pathname === '/checkin'} router={router}>
              Weekly Check-in
            </NavLink>
          )}

          {/* 1:1 Notes with hover dropdown for manager */}
          {isManager ? (
            <div
              style={{ position: 'relative' }}
              onMouseEnter={handleDropdownEnter}
              onMouseLeave={handleDropdownLeave}
            >
              <NavLink href="/meeting" active={pathname === '/meeting'} router={router}>
                1:1 Notes
              </NavLink>
              {showDropdown && directReports.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4,
                  background: 'rgba(255,255,255,0.98)',
                  border: '1px solid rgba(37, 99, 235,0.2)',
                  borderRadius: 8,
                  padding: '4px 0',
                  minWidth: 180,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  zIndex: 100,
                }}>
                  {directReports.map(r => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setShowDropdown(false)
                        router.push(`/meeting?userId=${r.id}`)
                      }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 14px', fontSize: 12,
                        background: 'transparent', border: 'none',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.background = 'rgba(37, 99, 235,0.1)'
                        e.currentTarget.style.color = '#2563EB'
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--text-secondary)'
                      }}
                    >
                      {r.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NavLink href="/meeting" active={pathname === '/meeting'} router={router}>
              1:1 Notes
            </NavLink>
          )}

          {isManager && (
            <NavLink href="/admin" active={pathname === '/admin'} router={router}>
              Manage Team
            </NavLink>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {profile?.full_name || user?.email}
        </span>
        {isManager && (
          <span style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            background: 'rgba(37, 99, 235,0.1)', color: '#2563EB',
            border: '1px solid rgba(37, 99, 235,0.2)',
          }}>
            {profile?.role === 'admin' ? 'Admin' : 'Manager'}
          </span>
        )}
        <button onClick={handleSignOut} style={{
          fontSize: 12, padding: '6px 12px', borderRadius: 6,
          color: 'var(--text-muted)', border: '1px solid var(--border-subtle)',
          background: 'transparent', cursor: 'pointer', transition: 'all 0.2s',
          letterSpacing: '0.05em',
        }}
          onMouseOver={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}

function NavLink({ href, active, children, router }) {
  return (
    <button onClick={() => router.push(href)} style={{
      padding: '6px 14px', borderRadius: 6, fontSize: 13, border: 'none',
      background: active ? 'rgba(37, 99, 235,0.12)' : 'transparent',
      color: active ? '#2563EB' : 'var(--text-muted)',
      borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
      cursor: 'pointer', transition: 'all 0.2s',
    }}
      onMouseOver={e => { if (!active) { e.currentTarget.style.color = '#2563EB'; e.currentTarget.style.background = 'rgba(37, 99, 235,0.06)' } }}
      onMouseOut={e => { if (!active) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' } }}
    >
      {children}
    </button>
  )
}
