'use client'
import { useState, useMemo } from 'react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { STATUS_HEX, STATUS_LABELS } from '../lib/utils'

const STATUS_NUM = { completed: 6, on_track: 5, at_risk: 4, off_track: 3, on_hold: 2, not_started: 1 }

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
      {subtitle && <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  )
}

function fmtWeek(w) {
  return format(new Date(w + 'T00:00:00'), 'MMM d')
}

const tooltipStyle = {
  contentStyle: { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, fontSize: 12, color: '#1E293B' },
  labelStyle: { color: '#64748B', marginBottom: 4 },
}

export default function AnalyticsCharts({ data, weekOptions }) {
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedSub, setSelectedSub] = useState('')

  // submission compliance over time
  const complianceData = useMemo(() => {
    return weekOptions.map(week => {
      const usersWithSubs = data.filter(u =>
        u.objectives?.some(o => o.sub_objectives?.length > 0)
      )
      const usersWhoSubmitted = usersWithSubs.filter(u =>
        u.objectives?.some(o =>
          o.sub_objectives?.some(s =>
            s.weekly_checkins?.some(c => c.week_start === week)
          )
        )
      )
      return {
        week,
        label: fmtWeek(week),
        rate: usersWithSubs.length > 0
          ? Math.round((usersWhoSubmitted.length / usersWithSubs.length) * 100)
          : 0,
        submitted: usersWhoSubmitted.length,
        total: usersWithSubs.length,
      }
    })
  }, [data, weekOptions])

  // status distribution over time
  const statusData = useMemo(() => {
    return weekOptions.map(week => {
      const allCheckins = data.flatMap(u =>
        (u.objectives || []).flatMap(o =>
          (o.sub_objectives || []).map(s =>
            s.weekly_checkins?.find(c => c.week_start === week)
          ).filter(Boolean)
        )
      )
      return {
        week,
        label: fmtWeek(week),
        not_started: allCheckins.filter(c => c.status === 'not_started').length,
        on_track: allCheckins.filter(c => c.status === 'on_track').length,
        at_risk: allCheckins.filter(c => c.status === 'at_risk').length,
        off_track: allCheckins.filter(c => c.status === 'off_track').length,
        on_hold: allCheckins.filter(c => c.status === 'on_hold').length,
        completed: allCheckins.filter(c => c.status === 'completed').length,
      }
    })
  }, [data, weekOptions])

  // per-person heatmap data
  const heatmapData = useMemo(() => {
    return data.filter(u => u.objectives?.some(o => o.sub_objectives?.length > 0)).map(u => {
      const totalSubs = (u.objectives || []).flatMap(o => o.sub_objectives || []).length
      const weeks = weekOptions.map(week => {
        const submitted = (u.objectives || []).flatMap(o =>
          (o.sub_objectives || []).filter(s =>
            s.weekly_checkins?.some(c => c.week_start === week)
          )
        ).length
        return { week, submitted, total: totalSubs, pct: totalSubs > 0 ? submitted / totalSubs : 0 }
      })
      return { name: u.full_name, id: u.id, weeks }
    })
  }, [data, weekOptions])

  // individual initiative trend
  const allSubs = useMemo(() => {
    const subs = []
    data.forEach(u => {
      (u.objectives || []).forEach(o => {
        (o.sub_objectives || []).forEach(s => {
          subs.push({ id: s.id, title: s.title, userId: u.id, userName: u.full_name, objTitle: o.title, checkins: s.weekly_checkins || [] })
        })
      })
    })
    return subs
  }, [data])

  const userSubs = allSubs.filter(s => s.userId === selectedUser)

  const trendData = useMemo(() => {
    if (!selectedSub) return []
    const sub = allSubs.find(s => s.id === selectedSub)
    if (!sub) return []
    return weekOptions.map(week => {
      const c = sub.checkins.find(ch => ch.week_start === week)
      return { week, label: fmtWeek(week), status: c?.status || null, value: c ? STATUS_NUM[c.status] || 0 : null }
    })
  }, [selectedSub, allSubs, weekOptions])

  return (
    <div className="space-y-6">
      <ChartCard title="Weekly Submission Rate" subtitle="Percentage of team members who submitted check-ins each week">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={complianceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
            <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(0,0,0,0.1)' }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(0,0,0,0.1)' }} tickFormatter={v => `${v}%`} />
            <Tooltip {...tooltipStyle} formatter={v => [`${v}%`, 'Submission Rate']} />
            <Line type="monotone" dataKey="rate" stroke="#2563EB" strokeWidth={2.5} dot={{ fill: '#2563EB', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#2563EB' }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Status Distribution Over Time" subtitle="How many sub-objectives are in each status each week">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={statusData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
            <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(0,0,0,0.1)' }} />
            <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(0,0,0,0.1)' }} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#64748B' }} />
            <Area type="monotone" dataKey="completed" name="Completed" stackId="1" fill={STATUS_HEX.completed} fillOpacity={0.6} stroke={STATUS_HEX.completed} strokeWidth={1.5} />
            <Area type="monotone" dataKey="on_track" name="On Track" stackId="1" fill={STATUS_HEX.on_track} fillOpacity={0.6} stroke={STATUS_HEX.on_track} strokeWidth={1.5} />
            <Area type="monotone" dataKey="at_risk" name="At Risk" stackId="1" fill={STATUS_HEX.at_risk} fillOpacity={0.6} stroke={STATUS_HEX.at_risk} strokeWidth={1.5} />
            <Area type="monotone" dataKey="on_hold" name="On Hold" stackId="1" fill={STATUS_HEX.on_hold} fillOpacity={0.6} stroke={STATUS_HEX.on_hold} strokeWidth={1.5} />
            <Area type="monotone" dataKey="off_track" name="Off Track" stackId="1" fill={STATUS_HEX.off_track} fillOpacity={0.6} stroke={STATUS_HEX.off_track} strokeWidth={1.5} />
            <Area type="monotone" dataKey="not_started" name="Not Started" stackId="1" fill={STATUS_HEX.not_started} fillOpacity={0.6} stroke={STATUS_HEX.not_started} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Per-Person Submission Heatmap" subtitle="Green = all submitted, yellow = partial, gray = missed">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748B', fontWeight: 500, position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1, minWidth: 120 }}>Person</th>
                {weekOptions.map(w => (
                  <th key={w} style={{ textAlign: 'center', padding: '6px 4px', color: '#64748B', fontWeight: 400, whiteSpace: 'nowrap', minWidth: 44 }}>
                    {fmtWeek(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapData.map(row => (
                <tr key={row.id}>
                  <td style={{ padding: '6px 8px', color: '#1E293B', fontWeight: 500, position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1, whiteSpace: 'nowrap' }}>
                    {row.name?.split(' ')[0]}
                  </td>
                  {row.weeks.map(cell => (
                    <td key={cell.week} style={{ textAlign: 'center', padding: '6px 4px' }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, margin: '0 auto',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: cell.submitted === 0 ? 'rgba(0,0,0,0.03)' : cell.pct >= 1 ? 'rgba(52,211,153,0.25)' : 'rgba(245,158,11,0.25)',
                        border: `1px solid ${cell.submitted === 0 ? 'rgba(0,0,0,0.05)' : cell.pct >= 1 ? 'rgba(52,211,153,0.4)' : 'rgba(245,158,11,0.4)'}`,
                        fontSize: 9, color: cell.submitted === 0 ? 'var(--text-muted)' : cell.pct >= 1 ? '#34D399' : '#F59E0B',
                      }} title={`${cell.submitted}/${cell.total} submitted`}>
                        {cell.submitted === 0 ? '--' : cell.pct >= 1 ? '✓' : `${cell.submitted}`}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {heatmapData.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>No data available yet.</p>
        )}
      </ChartCard>

      <ChartCard title="Initiative Trend" subtitle="Track how a specific sub-objective's status changed over time">
        <div className="flex flex-wrap gap-3 mb-4">
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <select value={selectedUser} onChange={e => { setSelectedUser(e.target.value); setSelectedSub('') }}
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', minWidth: 160, paddingRight: 32, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', cursor: 'pointer' }}>
              <option value="">Select person…</option>
              {data.filter(u => u.objectives?.some(o => o.sub_objectives?.length > 0)).map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {selectedUser && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select value={selectedSub} onChange={e => setSelectedSub(e.target.value)}
                className="text-xs px-3 py-2 rounded-lg"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', minWidth: 240, paddingRight: 32, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', cursor: 'pointer' }}>
                <option value="">Select sub-objective…</option>
                {userSubs.map(s => (
                  <option key={s.id} value={s.id}>{s.objTitle} → {s.title}</option>
                ))}
              </select>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          )}
        </div>

        {selectedSub ? (
          <div>
            {/* status timeline dots */}
            <div className="flex items-end gap-1 mb-4" style={{ overflowX: 'auto', paddingBottom: 4 }}>
              {trendData.map(d => (
                <div key={d.week} className="flex flex-col items-center" style={{ minWidth: 44 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', marginBottom: 4,
                    background: d.status ? STATUS_HEX[d.status] : 'rgba(0,0,0,0.05)',
                    border: `2px solid ${d.status ? STATUS_HEX[d.status] : 'rgba(0,0,0,0.1)'}`,
                    opacity: d.status ? 1 : 0.3,
                  }} title={d.status ? STATUS_LABELS[d.status] : 'No submission'} />
                  <span style={{ fontSize: 9, color: '#64748B' }}>{d.label}</span>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-2">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_HEX[key] }} />
                  <span style={{ fontSize: 10, color: '#64748B' }}>{label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)' }} />
                <span style={{ fontSize: 10, color: '#64748B' }}>Not submitted</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
            {selectedUser ? 'Select a sub-objective to see its trend' : 'Select a person and sub-objective to see status trends over time'}
          </p>
        )}
      </ChartCard>
    </div>
  )
}
