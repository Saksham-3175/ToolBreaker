"""
ToolBreaker target — victim LLM sandbox.
Exposes POST /chat with mock tools.
"""
import uvicorn
from fastapi import FastAPI

app = FastAPI(title="ToolBreaker Target")


@app.post("/chat")
async def chat(body: dict):
    raise NotImplementedError("target /chat not yet implemented")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
