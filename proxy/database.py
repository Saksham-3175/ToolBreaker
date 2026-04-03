"""
Database layer — SQLite via aiosqlite.
"""
import os
from contextlib import asynccontextmanager

import aiosqlite

SQLITE_PATH = os.getenv("SQLITE_PATH", "./data/toolbreaker.db")

CREATE_TOOL_CALLS = """
CREATE TABLE IF NOT EXISTS tool_calls (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL,
    tool_name  TEXT    NOT NULL,
    args       TEXT    NOT NULL,
    result     TEXT    NOT NULL,
    timestamp  TEXT    NOT NULL,
    severity   TEXT    NOT NULL DEFAULT 'unknown'
)
"""

CREATE_SESSIONS = """
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'running'
)
"""


@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(SQLITE_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def init_db() -> None:
    os.makedirs(os.path.dirname(os.path.abspath(SQLITE_PATH)), exist_ok=True)
    async with aiosqlite.connect(SQLITE_PATH) as db:
        await db.execute(CREATE_TOOL_CALLS)
        await db.execute(CREATE_SESSIONS)
        await db.commit()
