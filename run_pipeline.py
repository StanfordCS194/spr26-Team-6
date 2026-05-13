"""End-to-end RFP ingestion pipeline.

Single-command orchestrator that runs both scrapers, processes the raw output,
and uploads the processed records to Supabase.

Stage 1: scrape SAM.gov            -> data_raw/samgov_<noticeId>.json
Stage 2: scrape Cal eProcure       -> data_raw/caleprocure_<externalId>.json
Stage 3: normalize + tag           -> data_processed/<source>_<id>.json
Stage 4: upsert into Supabase      -> public.rfps

Dedup guarantees:
  * Each scraper skips opportunities/events whose raw JSON already exists in
    data_raw/ (filenames are keyed by the source's external id).
  * Each raw file maps 1:1 to a processed file by filename — no duplicates.
  * Supabase upsert is keyed on (source, external_id) so re-runs never insert
    duplicate rows; existing rows are refreshed in place.

Usage:
    python run_pipeline.py                       # full pipeline (default)
    python run_pipeline.py --skip-samgov         # skip SAM.gov scrape
    python run_pipeline.py --skip-caleprocure    # skip Cal eProcure scrape
    python run_pipeline.py --skip-process        # skip normalization stage
    python run_pipeline.py --skip-ingest         # skip Supabase upload
    python run_pipeline.py --rescrape            # disable scraper dedup
    python run_pipeline.py --no-drive            # write source URLs into SAM JSON
                                                 #   instead of uploading to Drive
"""

from __future__ import annotations

import argparse
import sys
import time
import traceback
from pathlib import Path
from typing import List
from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _banner(title: str) -> None:
    bar = "=" * 72
    print(f"\n{bar}\n  {title}\n{bar}", flush=True)


def _run_stage(name: str, fn) -> bool:
    """Run a pipeline stage, log timing, and return True on success."""
    _banner(name)
    start = time.monotonic()
    try:
        fn()
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
        if code != 0:
            print(f"[{name}] exited with code {code}", flush=True)
            return False
    except Exception:
        print(f"[{name}] failed:", flush=True)
        traceback.print_exc()
        return False
    elapsed = time.monotonic() - start
    print(f"[{name}] done in {elapsed:.1f}s", flush=True)
    return True


def _scrape_samgov(rescrape: bool, no_drive: bool, extra: List[str]) -> None:
    from scraper import samgov_interface

    argv: List[str] = []
    if rescrape:
        argv.append("--no-skip-existing")
    if no_drive:
        argv.append("--no-drive")
    argv.extend(extra)
    rc = samgov_interface.main(argv)
    if rc != 0:
        raise RuntimeError(f"samgov_interface.main returned {rc}")


def _scrape_caleprocure(rescrape: bool, extra: List[str]) -> None:
    from scraper import caleprocure_interface

    argv: List[str] = []
    if rescrape:
        argv.append("--no-skip-existing")
    argv.extend(extra)
    rc = caleprocure_interface.main(argv)
    if rc != 0:
        raise RuntimeError(f"caleprocure_interface.main returned {rc}")


def _process_raw() -> None:
    from processor.pipeline import (
        DEFAULT_INPUT_DIR,
        DEFAULT_OUTPUT_DIR,
        process_directory,
    )

    written = process_directory(DEFAULT_INPUT_DIR, DEFAULT_OUTPUT_DIR)
    print(
        f"Processed {len(written)} raw file(s) from {DEFAULT_INPUT_DIR} "
        f"-> {DEFAULT_OUTPUT_DIR}",
        flush=True,
    )


def _ingest_to_supabase() -> None:
    from processor.ingest_supabase import ingest_directory
    from processor.pipeline import DEFAULT_OUTPUT_DIR

    result = ingest_directory(DEFAULT_OUTPUT_DIR)
    print(
        f"Supabase ingest: {result.upserted} upserted, "
        f"{result.skipped} skipped, {result.failed} failed",
        flush=True,
    )
    if result.errors:
        print("First few errors:", flush=True)
        for err in result.errors[:5]:
            print(f"  - {err}", flush=True)
    if result.failed:
        raise RuntimeError(f"Supabase ingest had {result.failed} failure(s)")


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="run_pipeline",
        description="Run the full RFP ingestion pipeline: scrape -> process -> upload.",
    )
    parser.add_argument(
        "--skip-samgov", action="store_true",
        help="Skip the SAM.gov scrape stage.",
    )
    parser.add_argument(
        "--skip-caleprocure", action="store_true",
        help="Skip the Cal eProcure scrape stage.",
    )
    parser.add_argument(
        "--skip-process", action="store_true",
        help="Skip the data_raw/ -> data_processed/ normalization stage.",
    )
    parser.add_argument(
        "--skip-ingest", action="store_true",
        help="Skip the Supabase upload stage.",
    )
    parser.add_argument(
        "--rescrape", action="store_true",
        help="Re-scrape every opportunity, even if a raw JSON already exists.",
    )
    parser.add_argument(
        "--no-drive", action="store_true",
        help="SAM.gov only: record original SAM.gov resource URLs instead of "
             "uploading attachments to Google Drive.",
    )
    parser.add_argument(
        "--samgov-arg", action="append", default=[],
        help="Pass an extra raw argument through to samgov_interface "
             "(repeatable). Example: --samgov-arg=--max-per-naics --samgov-arg=25",
    )
    parser.add_argument(
        "--caleprocure-arg", action="append", default=[],
        help="Pass an extra raw argument through to caleprocure_interface (repeatable).",
    )
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv)

    failures: List[str] = []

    if not args.skip_samgov:
        ok = _run_stage(
            "Stage 1/4 — SAM.gov scrape",
            lambda: _scrape_samgov(args.rescrape, args.no_drive, args.samgov_arg),
        )
        if not ok:
            failures.append("samgov")
    else:
        print("\n[Stage 1/4] SAM.gov scrape skipped (--skip-samgov)", flush=True)

    if not args.skip_caleprocure:
        ok = _run_stage(
            "Stage 2/4 — Cal eProcure scrape",
            lambda: _scrape_caleprocure(args.rescrape, args.caleprocure_arg),
        )
        if not ok:
            failures.append("caleprocure")
    else:
        print("\n[Stage 2/4] Cal eProcure scrape skipped (--skip-caleprocure)", flush=True)

    if not args.skip_process:
        ok = _run_stage("Stage 3/4 — Normalize + tag", _process_raw)
        if not ok:
            failures.append("process")
            print(
                "\nAborting pipeline: cannot ingest into Supabase without processed files.",
                flush=True,
            )
            return 1
    else:
        print("\n[Stage 3/4] Processing skipped (--skip-process)", flush=True)

    if not args.skip_ingest:
        ok = _run_stage("Stage 4/4 — Supabase upload", _ingest_to_supabase)
        if not ok:
            failures.append("ingest")
    else:
        print("\n[Stage 4/4] Supabase upload skipped (--skip-ingest)", flush=True)

    _banner("Pipeline complete")
    if failures:
        print(f"Pipeline finished with failures in: {', '.join(failures)}", flush=True)
        return 1
    print("All stages succeeded.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
