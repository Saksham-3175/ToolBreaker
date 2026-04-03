"""
ToolBreaker engine entry point.
Flow: Recon → Exploit → Score → Report (one LangGraph run per vector)
"""
import argparse
import asyncio
import os
import uuid

from dotenv import load_dotenv

load_dotenv()

VECTORS = [
    "schema_leakage",
    "unauthorized_invocation",
    "parameter_injection",
    "response_poisoning",
]


async def run_vector(target: str, vector: str, session_id: str) -> None:
    # Import here so .env is loaded before graph module reads env vars
    from graph import build_graph, _reset_tokens

    _reset_tokens()
    graph = build_graph()

    initial_state = {
        "session_id":          session_id,
        "target_url":          target,
        "messages":            [],
        "tool_calls_observed": [],
        "attack_vector":       vector,
        "exploit_results":     [],
        "scored_findings":     [],
        "report":              {},
    }

    await graph.ainvoke(initial_state)


async def main() -> None:
    parser = argparse.ArgumentParser(description="ToolBreaker attack engine")
    parser.add_argument(
        "--target",
        default=os.getenv("TARGET_URL", "http://localhost:8001"),
        help="Target URL (default: $TARGET_URL or http://localhost:8001)",
    )
    parser.add_argument(
        "--vector",
        default="all",
        choices=VECTORS + ["all"],
        help="Attack vector to run (default: all)",
    )
    parser.add_argument(
        "--session-id",
        default=str(uuid.uuid4()),
        help="Session ID (default: generated UUID)",
    )
    args = parser.parse_args()

    vectors = VECTORS if args.vector == "all" else [args.vector]

    print("=" * 62)
    print("  TOOLBREAKER ENGINE")
    print("=" * 62)
    print(f"  Target     : {args.target}")
    print(f"  Session    : {args.session_id}")
    print(f"  Vectors    : {vectors}")
    print("=" * 62)

    for vector in vectors:
        # Unique session ID per vector so proxy findings stay isolated
        sid = (
            f"{args.session_id[:8]}-{vector[:6]}"
            if args.vector == "all"
            else args.session_id
        )
        print(f"\n{'─'*62}")
        print(f"  Starting vector: {vector}  (session={sid})")
        print(f"{'─'*62}")
        await run_vector(args.target, vector, sid)


if __name__ == "__main__":
    asyncio.run(main())
