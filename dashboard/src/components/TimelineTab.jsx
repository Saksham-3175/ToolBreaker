import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { getFindings } from '../api'

const SEV_COLORS = {
  high:    '#ef4444',
  medium:  '#f97316',
  low:     '#eab308',
  info:    '#3b82f6',
  unknown: '#71717a',
}

function bucketByMinute(findings) {
  const map = {}
  for (const f of findings) {
    const d    = new Date(f.timestamp)
    const key  = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
    if (!map[key]) map[key] = { time: key, high: 0, medium: 0, low: 0, info: 0, unknown: 0 }
    const sev = f.severity || 'unknown'
    map[key][sev] = (map[key][sev] || 0) + 1
  }
  return Object.values(map).sort((a, b) => a.time.localeCompare(b.time))
}

const TooltipStyle = { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 6 }

export default function TimelineTab({ session }) {
  const [data, setData]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    getFindings(session.id)
      .then(findings => setData(bucketByMinute(findings)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session])

  if (!session) return <p className="text-zinc-500 py-12 text-center">Select a session from the Sessions tab.</p>
  if (loading)  return <p className="text-zinc-500 py-12 text-center">Loading…</p>
  if (!data.length) return <p className="text-zinc-500 py-12 text-center">No tool calls recorded for this session.</p>

  return (
    <div>
      <p className="text-zinc-500 text-sm mb-6">
        Tool calls per minute — session <span className="font-mono text-violet-400">{session.id}</span>
      </p>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={{ stroke: '#3f3f46' }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TooltipStyle} labelStyle={{ color: '#e4e4e7' }} itemStyle={{ color: '#a1a1aa' }} />
          <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12, color: '#a1a1aa' }} />
          {Object.entries(SEV_COLORS).map(([sev, color]) => (
            <Bar key={sev} dataKey={sev} stackId="a" fill={color} radius={sev === 'unknown' ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
