import { useEffect, useState } from 'react'
import { getFindings } from '../api'
import SeverityBadge from './SeverityBadge'

const SEV_OPTIONS = ['all', 'high', 'medium', 'low', 'info', 'unknown']

function ArgCell({ args }) {
  const [open, setOpen] = useState(false)
  const text = typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args)
  const preview = text.length > 80 ? text.slice(0, 80) + '…' : text

  return (
    <div className="font-mono text-xs text-zinc-400">
      {open ? (
        <>
          <pre className="whitespace-pre-wrap break-all text-zinc-300">{text}</pre>
          <button onClick={() => setOpen(false)} className="text-violet-500 hover:text-violet-400 mt-1">collapse</button>
        </>
      ) : (
        <>
          <span className="break-all">{preview}</span>
          {text.length > 80 && (
            <button onClick={() => setOpen(true)} className="text-violet-500 hover:text-violet-400 ml-1">expand</button>
          )}
        </>
      )}
    </div>
  )
}

export default function FindingsTab({ session }) {
  const [findings, setFindings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [sevFilter, setSevFilter] = useState('all')

  useEffect(() => {
    if (!session) return
    setLoading(true)
    getFindings(session.id)
      .then(setFindings)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session])

  if (!session) return <p className="text-zinc-500 py-12 text-center">Select a session from the Sessions tab.</p>
  if (loading)  return <p className="text-zinc-500 py-12 text-center">Loading findings…</p>

  const visible = sevFilter === 'all' ? findings : findings.filter(f => f.severity === sevFilter)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-400 text-sm">
          <span className="text-zinc-200 font-medium">{visible.length}</span> of {findings.length} findings
          &nbsp;·&nbsp;session <span className="font-mono text-violet-400 text-xs">{session.id}</span>
        </span>
        <select
          value={sevFilter}
          onChange={e => setSevFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded px-3 py-1.5 outline-none focus:border-violet-500"
        >
          {SEV_OPTIONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All severities' : s}</option>)}
        </select>
      </div>

      {!visible.length
        ? <p className="text-zinc-500 py-8 text-center">No findings match this filter.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase text-xs tracking-wider">
                  <th className="py-3 px-4 font-medium">#</th>
                  <th className="py-3 px-4 font-medium">Tool</th>
                  <th className="py-3 px-4 font-medium">Args</th>
                  <th className="py-3 px-4 font-medium">Result</th>
                  <th className="py-3 px-4 font-medium">Time</th>
                  <th className="py-3 px-4 font-medium">Severity</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(f => (
                  <tr key={f.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/60 transition-colors align-top">
                    <td className="py-3 px-4 text-zinc-600 font-mono text-xs">{f.id}</td>
                    <td className="py-3 px-4 font-mono text-sm text-zinc-200 whitespace-nowrap">{f.tool_name}</td>
                    <td className="py-3 px-4 max-w-xs"><ArgCell args={f.args} /></td>
                    <td className="py-3 px-4 font-mono text-xs text-zinc-400 max-w-sm">
                      <span className="break-all">{String(f.result).slice(0, 120)}{String(f.result).length > 120 ? '…' : ''}</span>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 text-xs whitespace-nowrap">{new Date(f.timestamp).toLocaleTimeString()}</td>
                    <td className="py-3 px-4"><SeverityBadge severity={f.severity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}
