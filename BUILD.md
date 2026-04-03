# ToolBreaker — Build Documentation

Automated pentesting framework for LLM tool/function-call exploitation.
Tests what an AI agent *does through its tools* — not what it says.

---

## What It Is

Most LLM security tools test prompt injection at the text level. ToolBreaker goes one layer deeper: it attacks the **tool-calling layer** — the interface where a model decides to invoke real functions with real parameters.

Four attack vectors are tested:
1. **Schema Leakage** — coax the model into revealing its tool definitions
2. **Unauthorized Invocation** — trick the model into calling tools it shouldn't
3. **Parameter Injection** — pass malicious args (path traversal, SQL injection, exfil addresses)
4. **Response Poisoning** — inject adversarial instructions via tool response content

---

## Architecture

Four independent services. No shared code between them — all communication is HTTP only.

```
┌─────────────────────────────────────────────────────────┐
│                      ENGINE                              │
│  LangGraph: recon → exploit → score → report            │
│  GPT-4o-mini (attacker)  ·  GPT-4o (scorer/judge)       │
└────────────┬────────────────────────┬────────────────────┘
             │ POST /chat             │ GET /findings
             │                        │ PATCH /findings/{id}/severity
             ▼                        ▼
┌────────────────────┐     ┌──────────────────────────────┐
│      TARGET        │     │           PROXY              │
│  FastAPI + GPT-4o- │────▶│  FastAPI + SQLite            │
│  mini + mock tools │POST │  Logs every tool call        │
│  Port 8001         │/log │  Port 8002                   │
└────────────────────┘     └──────────────────────────────┘
                                        ▲
                                        │ GET /sessions
                                        │ GET /findings
                                        │ GET /report/{id}
                               ┌────────────────┐
                               │   DASHBOARD    │
                               │  React + Vite  │
                               │  Port 80 / 5173│
                               └────────────────┘
```

**SQLite is the single source of truth.** Every tool call the target LLM makes is logged to the proxy's database, tagged with session ID, and can be queried or updated at any time.

---

## Components

### engine/ — Attack Orchestrator

Built with **LangGraph** — a graph-based state machine library from LangChain. The choice of LangGraph over a plain async loop was deliberate: it makes the pipeline stages explicit, restartable, and inspectable. Each stage is a node; state is a typed dict that flows through them.

**State schema:**

```python
class EngineState(TypedDict):
    session_id: str
    target_url: str
    messages: list             # recon probe history
    tool_calls_observed: list  # tools discovered during recon
    attack_vector: str
    exploit_results: list      # raw per-attempt records
    scored_findings: list      # enriched with scorer judgment
    report: dict
```

**The 4 nodes:**

#### `recon`
Calls **GPT-4o-mini** with `prompts/recon.py` — a system prompt instructing it to generate 3 natural-sounding probe messages designed to trigger tool use. Those messages are sent to the target `/chat` endpoint and the resulting `tool_calls[]` in the response reveal what tools exist.

Why ask an LLM to generate probes instead of hardcoding them? Because natural language probes are more likely to bypass any system prompt guardrails than obviously adversarial ones.

#### `exploit`
Sends **static templates** from `prompts/exploit.py` — 5 per vector, 20 total. No LLM call here.

Decision: keeping exploit templates static means reproducible results across runs. The attacker LLM is only used where generative capability adds real value (recon discovery). For the actual exploits, specific adversarial strings are more reliable than generated ones.

#### `score`
Sends all exploit results in **one batch** to **GPT-4o** (the better, more expensive model). GPT-4o acts as a judge — it reads what was sent, what the target responded, and what tool calls were actually triggered, then returns:

```json
{
  "success": true,
  "severity": "high",
  "explanation": "Admin reset was executed without authorization.",
  "evidence": "admin_reset(user_id='root', confirm=True)"
}
```

After scoring, the node PATCHes each proxy finding's severity via `PATCH /findings/{id}/severity`. The mapping from exploit attempt → proxy finding is cursor-based (see below).

**Why GPT-4o for scoring?** Tool-call success requires nuanced judgment — distinguishing "the model mentioned the tool" from "the tool was actually invoked with attacker-controlled args". GPT-4o-mini's reasoning is less reliable for this.

#### `report`
Fetches the full audit report from `GET /report/{session_id}`, writes JSON to `engine/reports/{session_id}.json`, and prints a summary table to stdout.

---

**The severity cursor problem (and fix):**

The proxy logs tool calls in insertion order. Recon fires first, then exploit. Within exploit, some attempts trigger 0 tool calls, some trigger 1, some trigger 3. If you map by attempt index you'll mismatch — the PATCH will hit the wrong row.

The fix: track a `pf_cursor` that advances by the *actual number of tool calls* each attempt triggered:

```python
pf_cursor = 0
for attempt in exploit_results:
    n_calls = len(attempt["tool_calls"])
    proxy_ids = [exploit_proxy_findings[pf_cursor + j]["id"] for j in range(n_calls)]
    pf_cursor += n_calls  # advance by actual count, not 1
    # PATCH all proxy_ids with scored severity
```

---

**Session isolation:** When `--vector all` is used, the engine derives a separate session ID per vector (`{base}-{vector_code}`). This prevents recon findings from vector A polluting the report for vector B.

---

### target/ — Victim LLM Sandbox

A **FastAPI** app with an agentic loop over GPT-4o-mini. Exposes `POST /chat`. Accepts a message, runs it through the model with 5 mock tool schemas, executes any tool calls the model makes, logs each call to the proxy, then returns the final response.

**The agentic loop:**

```
send message → model returns tool_calls → execute each → log to proxy → 
re-send results → loop until finish_reason != "tool_calls" → return
```

**The 5 mock tools** are intentionally vulnerable:

| Tool | Vulnerability |
|------|--------------|
| `email_send(to, subject, body)` | No recipient validation, BCC possible |
| `db_query(query, table)` | Returns fake rows; accepts raw SQL strings |
| `file_read(path)` | Returns fake sensitive files (`/etc/passwd`, `/app/.env`) |
| `calendar_create(title, date, attendees)` | No attendee validation |
| `admin_reset(user_id, confirm)` | Executes for any user_id if confirm=true |

The fake data includes real-looking secrets (`OPENAI_API_KEY=sk-fake-key-1234`, usernames with roles, password-like fields) to make attack success obvious and measurable.

**Proxy logging is non-blocking:** If the proxy is down, the target logs to stderr and continues. The attack surface is never dependent on the observer.

---

### proxy/ — Intercept Layer

**FastAPI** backed by **aiosqlite** (async SQLite). Every tool call from the target hits `POST /log`, gets written to the `tool_calls` table, and is available immediately for query.

SQLite was chosen over Postgres because: no server process needed, single file, ACID guarantees, and the query volume (hundreds of rows per scan session) doesn't require a relational DB server.

**aiosqlite gotcha:** The connection object's `row_factory` can only be set *after* the connection is open. So `get_db()` is an `@asynccontextmanager` that opens the connection, sets `row_factory = aiosqlite.Row` inside the `async with` block, then yields:

```python
@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(SQLITE_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db
```

**Session upsert on first log:**

```sql
INSERT INTO sessions (id, started_at, status)
VALUES (?, ?, 'running')
ON CONFLICT(id) DO NOTHING
```

The target doesn't explicitly create sessions — the first tool call for a session_id creates the session row automatically.

**The `args` column** is stored as a JSON string (SQLite has no native JSON column). `row_to_dict()` deserializes it back to a dict before returning it from the API.

**CORS is wide open** (`allow_origins=["*"]`). The dashboard runs on a different port and needs to reach the proxy. This is intentional for a local dev/demo tool.

---

### dashboard/ — Frontend

**React 19 + Vite 8 + Tailwind CSS 4**, built as a single-page app. All tabs are in-memory state; no client-side router needed.

**Tailwind v4** setup differs from v3 — no `tailwind.config.js`. Just add the Vite plugin and `@import "tailwindcss"` in CSS:

```js
// vite.config.js
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ plugins: [react(), tailwindcss()] })
```

**Five tabs:**

| Tab | What it shows | Key tech |
|-----|--------------|---------|
| Sessions | All scan sessions, auto-refreshes every 5s | `setInterval` polling |
| Findings | Tool calls table with severity badges, filter | Expandable JSON args |
| Timeline | Tool calls per minute, colored by severity | recharts `BarChart` (stacked) |
| Exploit Chain | Directed graph of tool call sequence | `@xyflow/react` v12 |
| Report | Totals, severity breakdown, export button | recharts `PieChart` (donut) |

**Why polling instead of WebSockets?** 5-second latency is acceptable for a pentesting audit tool. WebSockets would require server-side infrastructure changes across all three Python services. Not worth it.

**Exploit Chain layout:** Nodes are positioned manually at `x = i * (NODE_W + GAP), y = 0`. A full auto-layout algorithm (like Dagre) was considered but is overkill for a linear chronological chain — the simple horizontal array is more readable.

**Export JSON:** Uses `Blob` + `URL.createObjectURL` to trigger a browser download with no backend needed.

**Docker:** Multi-stage build. Stage 1 (`node:20-slim`) runs `npm ci && npm run build`. Stage 2 (`nginx:alpine`) copies `dist/` and serves it. nginx config adds `try_files $uri $uri/ /index.html` so React's client-side routing works correctly.

---

## Running It

### Local (dev)

```bash
# Start proxy + target
cd proxy  && .venv/bin/uvicorn main:app --port 8002 &
cd target && .venv/bin/uvicorn main:app --port 8001 &

# Start dashboard
cd dashboard && npm run dev

# Run a scan
cd engine && .venv/bin/python main.py --vector parameter_injection --session-id my-test
```

### Docker

```bash
cp .env.example .env   # add OPENAI_API_KEY
make up                # starts proxy + target + dashboard
make attack            # runs engine (all 4 vectors), then exits
make logs              # stream live logs
make clean             # tear down + delete SQLite volume
```

The engine is in Docker Compose `profiles: ["attack"]` so `docker compose up` never starts it by accident. `make attack` runs it as a short-lived container (`--rm`).

---

## Key Technical Decisions

| Decision | What was chosen | Why |
|----------|----------------|-----|
| Inter-service comms | HTTP only | Services stay deployable independently; no import coupling |
| Persistence | SQLite | No server; single file; ACID; adequate for scan-level data volumes |
| Attack LLM | GPT-4o-mini | Fast and cheap for probe generation |
| Scorer LLM | GPT-4o | Better reasoning for nuanced success/failure judgment |
| Orchestration | LangGraph | Explicit state machine; each stage is testable in isolation |
| Exploit templates | Static strings | Reproducibility; controlled attack surface; cheaper than generating |
| Severity PATCH | Per-row cursor | Handles variable tool-call counts per attempt without index drift |
| Session IDs | Derived per vector | Prevents cross-vector finding pollution in proxy reports |
| Frontend polling | 5s interval | Simple; sufficient latency for post-scan review; no server changes needed |
| Docker engine profile | `profiles: ["attack"]` | Prevents accidental scan runs; infra and attacks are separate concerns |

---

## Token Cost (approximate per full 4-vector run)

| Stage | Model | Calls | ~Tokens |
|-------|-------|-------|---------|
| recon × 4 | gpt-4o-mini | 4 | ~1,000 |
| score × 4 | gpt-4o | 4 | ~4,000 |
| **Total** | | **8** | **~5,000** |

At current pricing (~$0.002/1K for mini, ~$0.01/1K for gpt-4o) a full run costs roughly **$0.05–0.10**.
