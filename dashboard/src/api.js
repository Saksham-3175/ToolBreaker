const BASE = import.meta.env.VITE_PROXY_URL || 'http://localhost:8002'

export const getSessions = () =>
  fetch(`${BASE}/sessions`).then(r => r.json())

export const getFindings = (sessionId) =>
  fetch(`${BASE}/findings?session_id=${encodeURIComponent(sessionId)}`).then(r => r.json())

export const getReport = (sessionId) =>
  fetch(`${BASE}/report/${encodeURIComponent(sessionId)}`).then(r => r.json())

export const patchSeverity = (id, severity) =>
  fetch(`${BASE}/findings/${id}/severity`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ severity }),
  }).then(r => r.json())
