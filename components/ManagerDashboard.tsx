'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import Spinner from './Spinner'
import HistoryModal from './HistoryModal'
import { getCurrentWeekStart, formatWeekLabel } from '../lib/utils'
import { calcWeeksNoProgress } from '../lib/dashboard'
import { startOfWeek, format } from 'date-fns'

// recharts is heavy and only used on the analytics view, so load it on demand
// to keep it out of the initial dashboard bundle.
const AnalyticsCharts = dynamic(() => import('./AnalyticsCharts'), {
  ssr: false,
  loading: () => <Spinner />,
})
import WeeklyBriefing from './WeeklyBriefing'
import SnapshotTiles from './dashboard/SnapshotTiles'
import WeekFilterBar from './dashboard/WeekFilterBar'
import SummaryCards from './dashboard/SummaryCards'
import DirectReportCard from './dashboard/DirectReportCard'

export default function ManagerDashboard({ currentUser }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeView = searchParams.get('view') || 'overview'
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeekStart())
  const [expandedUsers, setExpandedUsers] = useState(new Set())
  const [filterStatus, setFilterStatus] = useState('all')
  const [historyModal, setHistoryModal] = useState(null)
  const [expandedModalSubs, setExpandedModalSubs] = useState(new Set())
  const [highlightedSub, setHighlightedSub] = useState(null)

  function applyFilter(val) {
    setFilterStatus(val)
    if (val !== 'all') {
      // expand everyone matching the filter
      const matching = data.filter(u => {
        if (val === 'not_submitted') return u.submitted < u.totalSubs
        if (val === 'at_risk') return u.atRisk > 0
        if (val === 'needs_support') return u.needsSupport > 0
        if (val === 'stale') return (u.objectives || []).flatMap(o => o.sub_objectives).some(sub => calcWeeksNoProgress(sub, weekOptions, selectedWeek) >= 2)
        return true
      }).map(u => u.id)
      setExpandedUsers(new Set(matching))
    }
  }

  const thisWeek = getCurrentWeekStart()

  // earliest week comes from the check-in data so the range covers all real
  // history. Memoized so it only recomputes when the data changes.
  const weekOptions = useMemo(() => {
    const weeks = []
    const cur = startOfWeek(new Date(), { weekStartsOn: 1 })

    let earliest = null
    for (const u of data) {
      for (const o of (u.objectives || [])) {
        for (const s of (o.sub_objectives || [])) {
          for (const c of (s.weekly_checkins || [])) {
            if (c.week_start && (!earliest || c.week_start < earliest)) earliest = c.week_start
          }
        }
      }
    }

    const start = earliest ? new Date(earliest + 'T00:00:00') : cur
    let w = start
    while (w <= cur) {
      weeks.push(format(w, 'yyyy-MM-dd'))
      w = new Date(w.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
    return weeks
  }, [data])
  const weekIdx = weekOptions.indexOf(selectedWeek)
  const goBack = () => { if (weekIdx > 0) setSelectedWeek(weekOptions[weekIdx - 1]) }
  const goForward = () => { if (weekIdx < weekOptions.length - 1) setSelectedWeek(weekOptions[weekIdx + 1]) }

  useEffect(() => {
    loadData()
    const interval = setInterval(() => { loadData(true) }, 60000)
    return () => clearInterval(interval)
  }, [selectedWeek])

  async function loadData(silent = false) {
    if (!silent) setLoading(true)

    const { data: users } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'direct_report')
      .order('full_name')

    if (!users) { setLoading(false); return }

    // pull objectives + subs + checkins per user for the selected week
    const enriched = await Promise.all(users.map(async (u) => {
      const { data: objectives } = await supabase
        .from('strategic_objectives')
        .select(`
          *,
          sub_objectives (
            *,
            weekly_checkins (*)
          ),
          objective_opportunities (*)
        `)
        .eq('owner_id', u.id)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at')

      const objWithCheckins = (objectives || []).map(obj => ({
        ...obj,
        sub_objectives: (obj.sub_objectives || [])
          .filter(s => s.is_active)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.created_at || '').localeCompare(b.created_at || ''))
          .map(sub => ({
            ...sub,
            thisWeekCheckin: sub.weekly_checkins?.find(c => c.week_start === selectedWeek) || null,
          }))
      }))


      const allCheckins = objWithCheckins.flatMap(o => o.sub_objectives.map(s => s.thisWeekCheckin)).filter(Boolean)
      const totalSubs = objWithCheckins.flatMap(o => o.sub_objectives).length
      const submitted = allCheckins.length
      const atRisk = allCheckins.filter(c => c.status === 'at_risk').length
      const offTrack = allCheckins.filter(c => c.status === 'off_track').length
      const onHold = allCheckins.filter(c => c.status === 'on_hold').length
      const notStarted = allCheckins.filter(c => c.status === 'not_started').length
      const needsSupport = allCheckins.filter(c => c.support_needed && c.support_needed.trim()).length

      return { ...u, objectives: objWithCheckins, totalSubs, submitted, atRisk, offTrack, onHold, notStarted, needsSupport }
    }))

    setData(enriched)
    setLoading(false)
  }

  const filteredData = data.filter(u => {
    if (filterStatus === 'not_submitted') return u.submitted < u.totalSubs
    if (filterStatus === 'at_risk') return u.atRisk > 0
    if (filterStatus === 'needs_support') return u.needsSupport > 0
    if (filterStatus === 'stale') return (u.objectives || []).flatMap(o => o.sub_objectives).some(sub => calcWeeksNoProgress(sub, weekOptions, selectedWeek) >= 2)
    return true
  })

  const totalAtRisk = data.reduce((sum, u) => sum + u.atRisk, 0)
  const totalNeedsSupport = data.reduce((sum, u) => sum + u.needsSupport, 0)
  const totalNotSubmitted = data.filter(u => u.submitted < u.totalSubs).length
  const staleCount = data.flatMap(u => (u.objectives || []).flatMap(o => o.sub_objectives)).filter(sub => calcWeeksNoProgress(sub, weekOptions, selectedWeek) >= 2).length

  if (loading) return <Spinner />

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-3xl text-slate-800">
            {activeView === 'overview' ? 'Team Overview' : 'Analytics'}
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {activeView === 'overview' ? `${formatWeekLabel(selectedWeek)} · ${data.length} direct reports` : `Week 0 to present · ${data.length} direct reports`}
        </p>
      </div>

      {activeView === 'analytics' ? (
        <AnalyticsCharts data={data} weekOptions={weekOptions} />
      ) : (<>
      {/* weekly briefing */}
      <WeeklyBriefing selectedWeek={selectedWeek} currentUser={currentUser} />

      {/* snapshot tiles */}
      <SnapshotTiles data={data} weekOptions={weekOptions} selectedWeek={selectedWeek}
        setExpandedUsers={setExpandedUsers} setHighlightedSub={setHighlightedSub} />

      {/* Week selector + filters */}
      <WeekFilterBar
        selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} weekOptions={weekOptions}
        thisWeek={thisWeek} weekIdx={weekIdx} goBack={goBack} goForward={goForward}
        filterStatus={filterStatus} applyFilter={applyFilter}
        totalNotSubmitted={totalNotSubmitted} totalAtRisk={totalAtRisk}
        totalNeedsSupport={totalNeedsSupport} staleCount={staleCount} />

      {/* Summary cards */}
      <SummaryCards totalAtRisk={totalAtRisk} totalNeedsSupport={totalNeedsSupport}
        totalNotSubmitted={totalNotSubmitted} staleCount={staleCount} />

      {/* Direct report cards */}
      <div className="space-y-3">
        {filteredData.map(u => (
          <DirectReportCard key={u.id} u={u}
            expandedUsers={expandedUsers} setExpandedUsers={setExpandedUsers} router={router}
            filterStatus={filterStatus} weekOptions={weekOptions} selectedWeek={selectedWeek}
            highlightedSub={highlightedSub} setHistoryModal={setHistoryModal} setExpandedModalSubs={setExpandedModalSubs} />
        ))}
      </div>

      {filteredData.length === 0 && (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <div className="text-4xl mb-3">✅</div>
          <div className="text-sm">No issues match this filter.</div>
        </div>
      )}
      </>)}

      {historyModal && (
        <HistoryModal
          modal={historyModal}
          onClose={() => setHistoryModal(null)}
          weekOptions={weekOptions}
          expandedSubs={expandedModalSubs}
          setExpandedSubs={setExpandedModalSubs}
        />
      )}

    </div>
  )
}
