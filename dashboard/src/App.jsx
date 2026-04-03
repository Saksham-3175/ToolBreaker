import { useState } from 'react'
import SessionsTab    from './components/SessionsTab'
import FindingsTab    from './components/FindingsTab'
import TimelineTab    from './components/TimelineTab'
import ExploitChainTab from './components/ExploitChainTab'
import ReportTab      from './components/ReportTab'

const TABS = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'findings', label: 'Findings' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'chain',    label: 'Exploit Chain' },
  { id: 'report',   label: 'Report' },
]

export default function App() {
  const [activeTab, setActiveTab]         = useState('sessions')
  const [selectedSession, setSelectedSession] = useState(null)

  function handleSelectSession(session) {
    setSelectedSession(session)
    setActiveTab('findings')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-zinc-100">
            Tool<span className="text-violet-400">Breaker</span>
          </span>
          <span className="text-xs text-zinc-600 font-mono">attack surface scanner</span>
        </div>
        {selectedSession && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">session</span>
            <span className="font-mono text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded">
              {selectedSession.id.length > 24 ? selectedSession.id.slice(0, 24) + '…' : selectedSession.id}
            </span>
            <button
              onClick={() => { setSelectedSession(null); setActiveTab('sessions') }}
              className="text-zinc-600 hover:text-zinc-400 text-xs ml-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* Tabs */}
      <nav className="border-b border-zinc-800 px-6 flex gap-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer -mb-px ${
              activeTab === tab.id
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 px-6 py-6 max-w-7xl w-full mx-auto">
        {activeTab === 'sessions' && <SessionsTab onSelect={handleSelectSession} />}
        {activeTab === 'findings' && <FindingsTab session={selectedSession} />}
        {activeTab === 'timeline' && <TimelineTab session={selectedSession} />}
        {activeTab === 'chain'    && <ExploitChainTab session={selectedSession} />}
        {activeTab === 'report'   && <ReportTab session={selectedSession} />}
      </main>
    </div>
  )
}
