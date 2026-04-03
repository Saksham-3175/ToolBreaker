"""
HTTP client wrapper — sends messages to the target /chat endpoint.
"""
import httpx


async def send_to_target(
    target_url: str,
    session_id: str,
    message: str,
    system_prompt: str | None = None,
) -> dict:
    payload: dict = {"session_id": session_id, "message": message}
    if system_prompt:
        payload["system_prompt"] = system_prompt

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(f"{target_url}/chat", json=payload)
        r.raise_for_status()
        return r.json()
