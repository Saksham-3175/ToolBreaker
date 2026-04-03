"""
ToolBreaker proxy — intercepts and logs tool calls, exposes findings API.
"""
import uvicorn
from fastapi import FastAPI

app = FastAPI(title="ToolBreaker Proxy")


@app.post("/log")
async def log_tool_call(body: dict):
    raise NotImplementedError("proxy /log not yet implemented")


@app.get("/findings")
async def get_findings(session_id: str | None = None):
    raise NotImplementedError("proxy /findings not yet implemented")


@app.get("/sessions")
async def list_sessions():
    raise NotImplementedError("proxy /sessions not yet implemented")


@app.get("/report/{session_id}")
async def get_report(session_id: str):
    raise NotImplementedError("proxy /report not yet implemented")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
