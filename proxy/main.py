"""
ToolBreaker proxy — intercepts and logs tool calls, exposes findings API.
"""
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import get_db, init_db

load_dotenv()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="ToolBreaker Proxy", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class LogRequest(BaseModel):
    session_id: str
    tool_name:  str
    args:       dict
    result:     str
    timestamp:  str | None = None


class SeverityUpdate(BaseModel):
    severity: Literal["high", "medium", "low", "info"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def row_to_dict(row) -> dict:
    d = dict(row)
    # args is stored as JSON string — deserialise for API consumers
    try:
        d["args"] = json.loads(d["args"])
    except (ValueError, TypeError):
        pass
    return d


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/log", status_code=201)
async def log_tool_call(req: LogRequest):
    timestamp = req.timestamp or datetime.now(timezone.utc).isoformat()

    async with get_db() as db:
        # Upsert session
        await db.execute(
            """
            INSERT INTO sessions (id, started_at, status)
            VALUES (?, ?, 'running')
            ON CONFLICT(id) DO NOTHING
            """,
            (req.session_id, timestamp),
        )

        # Insert tool call
        cursor = await db.execute(
            """
            INSERT INTO tool_calls (session_id, tool_name, args, result, timestamp)
            VALUES (?, ?, ?, ?, ?)
            """,
            (req.session_id, req.tool_name, json.dumps(req.args), req.result, timestamp),
        )
        await db.commit()
        row_id = cursor.lastrowid

    return {"id": row_id, "status": "logged"}


@app.get("/findings")
async def get_findings(session_id: str | None = None):
    async with get_db() as db:
        if session_id:
            cursor = await db.execute(
                "SELECT * FROM tool_calls WHERE session_id = ? ORDER BY id ASC",
                (session_id,),
            )
        else:
            cursor = await db.execute("SELECT * FROM tool_calls ORDER BY id ASC")
        rows = await cursor.fetchall()

    return [row_to_dict(r) for r in rows]


@app.get("/sessions")
async def list_sessions():
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM sessions ORDER BY started_at DESC")
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@app.get("/report/{session_id}")
async def get_report(session_id: str):
    async with get_db() as db:
        # Check session exists
        cursor = await db.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        )
        session = await cursor.fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")

        cursor = await db.execute(
            "SELECT * FROM tool_calls WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        )
        rows = await cursor.fetchall()

    calls = [row_to_dict(r) for r in rows]
    unique_tools = list({c["tool_name"] for c in calls})

    severity_counts: dict[str, int] = {"high": 0, "medium": 0, "low": 0, "unknown": 0}
    for c in calls:
        key = c.get("severity", "unknown")
        severity_counts[key] = severity_counts.get(key, 0) + 1

    return {
        "session_id":    session_id,
        "total_calls":   len(calls),
        "unique_tools":  unique_tools,
        "calls":         calls,
        "severity_counts": severity_counts,
    }


@app.patch("/findings/{finding_id}/severity")
async def update_severity(finding_id: int, body: SeverityUpdate):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id FROM tool_calls WHERE id = ?", (finding_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Finding not found")

        await db.execute(
            "UPDATE tool_calls SET severity = ? WHERE id = ?",
            (body.severity, finding_id),
        )
        await db.commit()

    return {"id": finding_id, "severity": body.severity}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
