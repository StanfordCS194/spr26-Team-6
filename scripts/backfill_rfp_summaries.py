"""Generate cached structured summaries for Supabase RFP rows."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from processor.ingest_supabase import get_client
from processor.summary import build_structured_summary


PROMPT_VERSION = "structured-v1"
SUMMARY_TYPE = "general"
MODEL = "deterministic-processor"


def _normalize_env() -> None:
    if not os.environ.get("SUPABASE_URL"):
        public_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        if public_url:
            os.environ["SUPABASE_URL"] = public_url
    if not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        secret_key = os.environ.get("SUPABASE_SECRET_KEY")
        if secret_key:
            os.environ["SUPABASE_SERVICE_ROLE_KEY"] = secret_key


def _fetch_rfps(client: Any, source: str | None, limit: int | None) -> list[dict[str, Any]]:
    query = (
        client.table("rfps")
        .select("*")
        .eq("status", "active")
        .eq("is_relevant", True)
        .order("due_date")
    )
    if source:
        query = query.eq("source", source)
    if limit:
        query = query.limit(limit)
    response = query.execute()
    return list(getattr(response, "data", None) or [])


def main() -> int:
    parser = argparse.ArgumentParser(prog="backfill_rfp_summaries")
    parser.add_argument("--source", help="Optional rfps.source filter, e.g. sam.gov")
    parser.add_argument("--limit", type=int, help="Optional max row count")
    args = parser.parse_args()

    _normalize_env()
    client = get_client()
    rows = _fetch_rfps(client, args.source, args.limit)
    payload = [
        {
            "rfp_id": row["id"],
            "summary": build_structured_summary(row),
            "summary_type": SUMMARY_TYPE,
            "prompt_version": PROMPT_VERSION,
            "model": MODEL,
        }
        for row in rows
    ]
    if not payload:
        print("No matching RFP rows found.")
        return 0

    response = (
        client.table("rfp_summaries")
        .upsert(payload, on_conflict="rfp_id,summary_type,prompt_version")
        .execute()
    )
    written = len(getattr(response, "data", None) or payload)
    print(f"Backfilled {written} structured summarie(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
