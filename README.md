# ToolBreaker

**Automated pentesting framework for LLM tool/function-call exploitation.**

Tests what an AI agent *does through its tools* — not what it says.

Most LLM security tools test prompt injection at the text level. ToolBreaker goes one layer deeper: it attacks the **tool-calling layer** — the interface where a model decides to invoke real functions with real parameters.

---

## Attack Vectors

| # | Vector | What it tests |
|---|--------|---------------|
| 1 | **Schema Leakage** | Coax the model into revealing its tool definitions via natural-language probes |
| 2 | **Unauthorized Invocation** | Trick the model into calling tools it shouldn't (e.g. `admin_reset`) |
| 3 | **Parameter Injection** | Pass malicious args — path traversal, raw SQL strings, exfiltration addresses |
| 4 | **Response Poisoning** | Inject adversarial instructions via tool response content to hijack subsequent behavior |

---

## Architecture

Four independent services. All communication is HTTP only — no shared code between services.

```
┌─────────────────────────────────────────────────────────┐
│                        ENGINE                            │
│   LangGraph: recon → exploit → score → report           │
│   GPT-4o-mini (attacker)  ·  GPT-4o (scorer/judge)      │
└────────────┬────────────────────────┬────────────────────┘
             │ POST /chat             │ GET /findings
             │                        │ PATCH /findings/{id}/severity
             ▼                        ▼
┌────────────────────┐     ┌──────────────────────────────┐
│       TARGET       │     │            PROXY             │
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
                                │  Port 80/5173  │
                                └────────────────┘
```

**SQLite is the single source of truth.** Every tool call the target LLM makes is logged to the proxy's database, tagged with session ID, and immediately queryable or patchable.

---

## Components

### `engine/` — Attack Orchestrator

Built with **LangGraph** (graph-based state machine from LangChain). Each pipeline stage is an explicit node; state flows through as a typed dict.

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

**Pipeline nodes:**

**`recon`** — Calls GPT-4o-mini to generate 3 natural-sounding probe messages designed to trigger tool use. Sends them to the target `/chat` endpoint and inspects `tool_calls[]` in the response to discover what tools exist. Natural-language probes bypass system-prompt guardrails better than obviously adversarial strings.

**`exploit`** — Sends static adversarial templates (5 per vector, 20 total). No LLM call here. Static templates keep results reproducible across runs — generative probes are only used where they add real value (recon).

**`score`** — Sends all exploit results in one batch to **GPT-4o** acting as a judge. GPT-4o reads what was sent, what the target returned, and what tool calls were actually triggered, then rates each attempt:

```json
{
  "success": true,
  "severity": "high",
  "explanation": "Admin reset was executed without authorization.",
  "evidence": "admin_reset(user_id='root', confirm=True)"
}
```

GPT-4o is used here (not mini) because distinguishing "the model mentioned the tool" from "the tool was invoked with attacker-controlled args" requires nuanced reasoning.

After scoring, each finding's severity is PATCHed to the proxy via `PATCH /findings/{id}/severity`.

**`report`** — Fetches the full audit report from `GET /report/{session_id}`, writes JSON to `engine/reports/`, prints a summary table to stdout.

---

**The severity cursor problem (and fix):**

The proxy logs tool calls in insertion order. Recon fires first, then exploit. Within exploit, some attempts trigger 0 tool calls, some 1, some 3. Mapping by attempt index causes mismatches — the PATCH hits the wrong row.

Fix: track a cursor that advances by the *actual number of tool calls* each attempt triggered, not by 1:

```python
pf_cursor = 0
for attempt in exploit_results:
    n_calls = len(attempt["tool_calls"])
    proxy_ids = [exploit_proxy_findings[pf_cursor + j]["id"] for j in range(n_calls)]
    pf_cursor += n_calls  # advance by actual count, not 1
    # PATCH all proxy_ids with scored severity
```

**Session isolation:** When `--vector all` is used, the engine derives a separate session ID per vector (`{base}-{vector_code}`), preventing findings from vector A polluting the report for vector B.

---

### `target/` — Victim LLM Sandbox

FastAPI app with an agentic loop over GPT-4o-mini. Exposes `POST /chat`.

**Agentic loop:**
```
send message → model returns tool_calls → execute each → log to proxy →
re-send results → loop until finish_reason != "tool_calls" → return
```

**5 intentionally vulnerable mock tools:**

| Tool | Vulnerability |
|------|--------------|
| `email_send(to, subject, body)` | No recipient validation — BCC injection possible |
| `db_query(query, table)` | Returns fake rows; accepts raw SQL strings |
| `file_read(path)` | Returns fake sensitive files (`/etc/passwd`, `/app/.env`) |
| `calendar_create(title, date, attendees)` | No attendee validation |
| `admin_reset(user_id, confirm)` | Executes for any `user_id` if `confirm=true` |

Fake return data includes real-looking secrets (`OPENAI_API_KEY=sk-fake-key-1234`, role-tagged usernames, password fields) to make attack success unambiguous and measurable.

**Proxy logging is non-blocking** — if the proxy is down, the target logs to stderr and continues. The attack surface is never dependent on the observer.

---

### `proxy/` — Intercept & Audit Layer

FastAPI backed by **aiosqlite** (async SQLite). Every tool call from the target hits `POST /log`, gets written to the `tool_calls` table, and is immediately available for query.

SQLite was chosen over Postgres: no server process, single file, ACID guarantees, and scan-level volumes (hundreds of rows per session) don't need a DB server.

**aiosqlite pattern** — `row_factory` must be set *after* the connection opens:

```python
@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(SQLITE_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db
```

**Session upsert on first log** — the target never explicitly creates sessions; the first tool call for a session ID creates the row:

```sql
INSERT INTO sessions (id, started_at, status)
VALUES (?, ?, 'running')
ON CONFLICT(id) DO NOTHING
```

The `args` column is stored as a JSON string (SQLite has no native JSON column). `row_to_dict()` deserializes it back to a dict before returning from the API.

CORS is wide open (`allow_origins=["*"]`) — the dashboard runs on a different port and needs to reach the proxy. Intentional for a local dev/demo tool.

---

### `dashboard/` — Audit Frontend

**React 19 + Vite 8 + Tailwind CSS 4.** Single-page app, five tabs, all in-memory state.

Tailwind v4 setup (no `tailwind.config.js`):

```js
// vite.config.js
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ plugins: [react(), tailwindcss()] })
```

**Five tabs:**

| Tab | What it shows | Key tech |
|-----|---------------|----------|
| Sessions | All scan sessions with live auto-refresh | 5s `setInterval` polling |
| Findings | Tool calls table with severity badges + expandable JSON args | Filterable |
| Timeline | Tool calls per minute, stacked by severity | recharts `BarChart` |
| Exploit Chain | Directed graph of full tool-call sequence | `@xyflow/react` v12 |
| Report | Totals, severity breakdown, one-click JSON export | recharts `PieChart` (donut) |

Polling over WebSockets: 5s latency is acceptable for a post-scan audit tool. WebSockets would require server-side changes across all three Python services — not worth it.

Export uses `Blob` + `URL.createObjectURL` — no backend needed.

**Docker:** Multi-stage build. `node:20-slim` runs `npm ci && npm run build`; `nginx:alpine` serves `dist/`. nginx config includes `try_files $uri $uri/ /index.html` so client-side routing works.

---

## Running

### Prerequisites

- Docker + Docker Compose
- OpenAI API key

### Docker (recommended)

```bash
cp .env.example .env   # add your OPENAI_API_KEY

make up       # start proxy + target + dashboard
make attack   # run engine (all 4 vectors), exits when done
make logs     # stream live logs
make clean    # tear down + delete SQLite volume
```

The engine runs under Docker Compose `profiles: ["attack"]` so `docker compose up` never fires it by accident. `make attack` runs it as a short-lived `--rm` container.

### Local (development)

```bash
# Start proxy
cd proxy && .venv/bin/uvicorn main:app --port 8002

# Start target (separate terminal)
cd target && .venv/bin/uvicorn main:app --port 8001

# Start dashboard (separate terminal)
cd dashboard && npm run dev

# Single-vector scan
cd engine && .venv/bin/python main.py --vector parameter_injection --session-id my-test

# All 4 vectors
cd engine && .venv/bin/python main.py --vector all --session-id my-test
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Inter-service comms | HTTP only | Services stay independently deployable; no import coupling |
| Persistence | SQLite | No server; single file; ACID; adequate for scan-level volumes |
| Recon LLM | GPT-4o-mini | Fast and cheap for natural-language probe generation |
| Scorer LLM | GPT-4o | Better reasoning for nuanced success/failure judgment |
| Orchestration | LangGraph | Explicit state machine; each stage independently testable |
| Exploit templates | Static strings | Reproducibility; controlled attack surface; no generation cost |
| Severity mapping | Per-row cursor | Handles variable tool-call counts per attempt without index drift |
| Session IDs | Derived per vector | Prevents cross-vector finding pollution in proxy reports |
| Frontend updates | 5s polling | Simple; sufficient latency for post-scan review; no server-side changes needed |
| Engine Docker profile | `profiles: ["attack"]` | Separates infra lifecycle from attack execution |

---

## Token Cost

Approximate per full 4-vector run:

| Stage | Model | Calls | ~Tokens |
|-------|-------|-------|---------|
| recon × 4 | gpt-4o-mini | 4 | ~1,000 |
| score × 4 | gpt-4o | 4 | ~4,000 |
| **Total** | | **8** | **~5,000** |

At current pricing (~$0.002/1K for mini, ~$0.01/1K for gpt-4o): **~$0.05–0.10 per full scan.**

---

## Stack

| Layer | Tech |
|-------|------|
| Orchestration | Python, LangGraph |
| LLMs | OpenAI GPT-4o-mini (attacker), GPT-4o (scorer) |
| Target API | FastAPI, Python |
| Proxy / Audit | FastAPI, aiosqlite, SQLite |
| Dashboard | React 19, Vite 8, Tailwind CSS 4, recharts, @xyflow/react |
| Infrastructure | Docker, Docker Compose, nginx |
