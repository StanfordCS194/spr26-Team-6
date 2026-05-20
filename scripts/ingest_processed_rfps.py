"""Upsert processed RFP JSON into Supabase.

Default inputs:
  - data_processed/
  - data_processed_sam_gov/

Required environment:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from processor.ingest_supabase import ingest_directory

DEFAULT_INPUTS = (
    PROJECT_ROOT / "data_processed",
    PROJECT_ROOT / "data_processed_sam_gov",
)


def _normalize_env() -> None:
    if not os.environ.get("SUPABASE_URL"):
        public_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        if public_url:
            os.environ["SUPABASE_URL"] = public_url
    if not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        secret_key = os.environ.get("SUPABASE_SECRET_KEY")
        if secret_key:
            os.environ["SUPABASE_SERVICE_ROLE_KEY"] = secret_key


def main() -> int:
    parser = argparse.ArgumentParser(prog="ingest_processed_rfps")
    parser.add_argument(
        "inputs",
        nargs="*",
        type=Path,
        default=list(DEFAULT_INPUTS),
        help="Processed JSON directories to ingest.",
    )
    args = parser.parse_args()

    _normalize_env()

    total_upserted = total_skipped = total_failed = 0
    errors: list[str] = []
    for input_dir in args.inputs:
        if not input_dir.is_dir():
            print(f"Skipping missing directory: {input_dir}")
            continue
        result = ingest_directory(input_dir)
        total_upserted += result.upserted
        total_skipped += result.skipped
        total_failed += result.failed
        errors.extend(result.errors or [])
        print(
            f"{input_dir}: {result.upserted} upserted, "
            f"{result.skipped} skipped, {result.failed} failed"
        )

    if errors:
        print("First few errors:")
        for err in errors[:5]:
            print(f"  - {err}")

    print(
        f"Total: {total_upserted} upserted, {total_skipped} skipped, "
        f"{total_failed} failed"
    )
    return 1 if total_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
