'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import Navbar from '../../components/Navbar'
import ManagerDashboard from '../../components/ManagerDashboard'
import DirectReportDashboard from '../../components/DirectReportDashboard'

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const viewAsId = searchParams.get('viewAs')

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [viewAsProfile, setViewAsProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      setUser(session.user)

      const { data: prof } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()

      setProfile(prof)

      // admin impersonating someone, grab their profile too
      if (viewAsId && (prof?.role === 'manager' || prof?.role === 'admin')) {
        const { data: targetProf } = await supabase
          .from('users')
          .select('*')
          .eq('id', viewAsId)
          .single()
        setViewAsProfile(targetProf)
      }

      setLoading(false)
    }
    load()
  }, [router, viewAsId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="w-8 h-8 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const isManager = profile?.role === 'manager' || profile?.role === 'admin'
  const isViewingAs = isManager && viewAsProfile

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Navbar user={user} profile={profile} />

      {/* View-as banner */}
      {isViewingAs && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          borderBottom: '1px solid rgba(239,68,68,0.3)',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}>
          <span className="text-sm" style={{ color: '#F87171' }}>
            👁 Viewing as <strong>{viewAsProfile.full_name}</strong>
          </span>
          <button
            onClick={() => { window.location.href = '/dashboard' }}
            className="text-xs px-3 py-1 rounded-lg"
            style={{
              background: 'rgba(239,68,68,0.2)',
              color: '#F87171',
              border: '1px solid rgba(239,68,68,0.4)',
              cursor: 'pointer',
            }}
          >
            ✕ Exit
          </button>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {isViewingAs
          ? <DirectReportDashboard currentUser={viewAsProfile} />
          : isManager
            ? <ManagerDashboard currentUser={profile} />
            : <DirectReportDashboard currentUser={profile} />
        }
      </main>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="w-8 h-8 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
