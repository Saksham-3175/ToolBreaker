import { useEffect, useState } from 'react'
import { getSessions } from '../api'

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

export default function SessionsTab({ onSelect }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    let alive = true
    const load = () => getSessions().then(d => alive && setSessions(d)).catch(console.error).finally(() => alive && setLoading(false))
    load()
    const id = setInterval(load, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (loading) return <p className="text-zinc-500 py-12 text-center">Loading sessions…</p>
  if (!sessions.length) return <p className="text-zinc-500 py-12 text-center">No scan sessions found. Run the engine to start.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500 uppercase text-xs tracking-wider">
            <th className="py-3 px-4 font-medium">Session ID</th>
            <th className="py-3 px-4 font-medium">Started</th>
            <th className="py-3 px-4 font-medium">Status</th>
            <th className="py-3 px-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/60 transition-colors">
              <td className="py-3 px-4 font-mono text-zinc-300 text-xs">
                {s.id.length > 36 ? s.id.slice(0, 20) + '…' : s.id}
              </td>
              <td className="py-3 px-4 text-zinc-400">{fmt(s.started_at)}</td>
              <td className="py-3 px-4">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${s.status === 'running' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-700/40 text-zinc-400 border border-zinc-600/40'}`}>
                  {s.status}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <button
                  onClick={() => onSelect(s)}
                  className="px-3 py-1.5 text-xs font-medium bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 border border-violet-500/30 rounded transition-colors cursor-pointer"
                >
                  View →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
