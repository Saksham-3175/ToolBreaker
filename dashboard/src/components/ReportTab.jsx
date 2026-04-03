import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getReport } from '../api'

const SEV_COLORS = {
  high:    '#ef4444',
  medium:  '#f97316',
  low:     '#eab308',
  info:    '#3b82f6',
  unknown: '#71717a',
}

const TooltipStyle = { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 6 }

function Stat({ label, value }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-5 py-4">
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500 mt-1 uppercase tracking-wide">{label}</div>
    </div>
  )
}

export default function ReportTab({ session }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    setError(null)
    getReport(session.id)
      .then(setReport)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [session])

  if (!session) return <p className="text-zinc-500 py-12 text-center">Select a session from the Sessions tab.</p>
  if (loading)  return <p className="text-zinc-500 py-12 text-center">Loading report…</p>
  if (error)    return <p className="text-red-400 py-12 text-center">Error: {error}</p>
  if (!report)  return null

  const sevCounts = report.severity_counts || {}
  const pieData   = Object.entries(SEV_COLORS)
    .map(([sev, color]) => ({ name: sev, value: sevCounts[sev] || 0, color }))
    .filter(d => d.value > 0)

  function exportJSON() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `toolbreaker-report-${session.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-zinc-200 font-semibold text-base">Audit Report</h3>
          <p className="text-zinc-500 text-sm font-mono mt-0.5">{session.id}</p>
        </div>
        <button
          onClick={exportJSON}
          className="px-4 py-2 text-sm font-medium bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 border border-violet-500/30 rounded transition-colors cursor-pointer"
        >
          Export JSON ↓
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total calls"   value={report.total_calls} />
        <Stat label="Unique tools"  value={report.unique_tools?.length ?? 0} />
        <Stat label="High severity" value={sevCounts.high    || 0} />
        <Stat label="Medium"        value={sevCounts.medium  || 0} />
      </div>

      {/* Tools discovered */}
      {report.unique_tools?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-5 py-4">
          <h4 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Tools Invoked</h4>
          <div className="flex flex-wrap gap-2">
            {report.unique_tools.map(t => (
              <span key={t} className="font-mono text-xs px-2 py-1 bg-zinc-800 text-zinc-300 rounded border border-zinc-700">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Severity donut */}
      {pieData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-5 py-4">
          <h4 className="text-xs uppercase tracking-wide text-zinc-500 mb-4">Severity Breakdown</h4>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                labelLine={false}
              >
                {pieData.map(entry => (
                  <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TooltipStyle}
                formatter={(val, name) => [val, name]}
                itemStyle={{ color: '#a1a1aa' }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }}
                formatter={v => v}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
