# ToolBreaker

Automated pentesting tool for LLM tool/function-call exploitation.
Tests what LLMs **do** through their tools — not what they say.

## Repo structure
toolbreaker/
├── engine/          # Attack orchestration (LangGraph, Python 3.11)
├── target/          # Victim LLM sandbox (FastAPI + mock tools)
├── proxy/           # Intercept layer (FastAPI middleware + SQLite)
├── dashboard/       # Frontend (React + Vite + Tailwind)
├── docker-compose.yml
├── .env.example
└── CLAUDE.md

## Components

### engine/
- Python 3.11, LangGraph, OpenAI SDK
- Flow: Recon → Exploit → Score → Report
- Attacker: GPT-4o-mini (stateless per call)
- Scorer: GPT-4o
- Entry: `engine/main.py`
- Output: POSTs findings to proxy API

### target/
- FastAPI app exposing a chat endpoint
- Mock tools: email_send, db_query, file_read, calendar_create, admin_reset
- System prompt is configurable via env or request param
- Target LLM: GPT-4o-mini
- Port: 8001

### proxy/
- FastAPI middleware
- Intercepts all tool calls between target LLM and mock tools
- Logs: function_name, params, response, timestamp, session_id → SQLite
- Exposes REST API for dashboard + engine to query findings
- Port: 8002

### dashboard/
- React 18 + Vite + Tailwind CSS
- recharts: attack timeline
- react-flow: exploit chain graph
- Reads from proxy API (port 8002)
- Port: 5173 (dev), 80 (prod via Nginx)

## Environment variables

Copy `.env.example` → `.env`. Never commit `.env`.
OPENAI_API_KEY=
TARGET_URL=http://target:8001
PROXY_URL=http://proxy:8002
SQLITE_PATH=./data/toolbreaker.db

## Tech stack versions

- Python: 3.11
- LangGraph: latest stable
- FastAPI: 0.110+
- React: 18
- Vite: 5
- Tailwind: 3

## Conventions

- Commits: conventional commits only (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)
- No AI authorship in commit messages
- One PR per component feature
- All inter-service communication via HTTP (no shared imports between engine/target/proxy)
- SQLite is the single source of truth for all findings

## Attack vectors

1. **Tool schema leakage** — extract tool definitions through conversation
2. **Unauthorized tool invocation** — trick LLM into calling out-of-scope tools
3. **Parameter injection** — manipulate function args to exfiltrate/escalate
4. **Tool-response poisoning** — inject adversarial content in tool responses

## API contracts

### Target (port 8001)
POST /chat — { session_id, message, system_prompt? } → { response, tool_calls[] }

### Proxy (port 8002)
POST /log — internal tool call logging
GET /findings — { session_id? } → findings[]
GET /sessions — list all scan sessions
GET /report/{session_id} — full audit report JSON

### Engine
Triggered via: `python engine/main.py --target http://target:8001 --session-id <uuid>`
