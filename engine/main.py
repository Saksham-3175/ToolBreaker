"""
ToolBreaker engine entry point.
Flow: Recon -> Exploit -> Score -> Report
"""
import argparse


def main():
    parser = argparse.ArgumentParser(description="ToolBreaker attack engine")
    parser.add_argument("--target", required=True, help="Target URL (e.g. http://target:8001)")
    parser.add_argument("--session-id", required=True, help="Unique scan session ID")
    args = parser.parse_args()

    print(f"[engine] Starting scan — target={args.target}, session={args.session_id}")


if __name__ == "__main__":
    main()
