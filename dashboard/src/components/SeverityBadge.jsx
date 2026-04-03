const STYLES = {
  high:    'bg-red-500/15 text-red-400 border border-red-500/30',
  medium:  'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  low:     'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  info:    'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  unknown: 'bg-zinc-700/40 text-zinc-400 border border-zinc-600/40',
}

export default function SeverityBadge({ severity }) {
  const s = (severity || 'unknown').toLowerCase()
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${STYLES[s] || STYLES.unknown}`}>
      {s}
    </span>
  )
}
