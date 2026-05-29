"""End-to-end RFP ingestion pipeline, one source at a time.

Single-command orchestrator scoped to a single data source. Runs that
source's scraper, processes only that source's raw files, and uploads only
those records to Supabase.

Usage:
    python run_pipeline.py sam              # SAM.gov pipeline only
    python run_pipeline.py eProcure         # Cal eProcure pipeline only
    python run_pipeline.py publicPurchase   # Public Purchase pipeline only

Stage 1: scrape <source>           -> data_raw/<prefix>_<id>.json
Stage 2: normalize + tag           -> data_processed/<prefix>_<id>.json
Stage 3: upsert into Supabase      -> public.rfps

Source flag mapping:
    sam       -> SAM.gov scraper        + data_raw/samgov_*.json
    eProcure        -> Cal eProcure scraper        + data_raw/caleprocure_*.json
    publicPurchase  -> Public Purchase scraper     + data_raw/publicpurchase_*.json

Dedup guarantees:
  * Each scraper skips opportunities/events whose raw JSON already exists in
    data_raw/ (filenames are keyed by the source's external id).
  * Each raw file maps 1:1 to a processed file by filename — no duplicates.
  * Supabase upsert is keyed on (source, external_id) so re-runs never insert
    duplicate rows; existing rows are refreshed in place.
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


# source flag -> (scraper module name, data_raw filename prefix, human label)
SOURCES: dict[str, dict[str, str]] = {
    "sam": {
        "scraper": "scraper.samgov_interface",
        "prefix": "samgov_",
        "label": "SAM.gov",
    },
    "eProcure": {
        "scraper": "scraper.caleprocure_interface",
        "prefix": "caleprocure_",
        "label": "Cal eProcure",
    },
    "publicPurchase": {
        "scraper": "scraper.publicpurchase_interface",
        "prefix": "publicpurchase_",
        "label": "Public Purchase",
    },
}


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


def _scrape_publicpurchase(rescrape: bool, extra: List[str]) -> None:
    from scraper import publicpurchase_interface

    argv: List[str] = []
    if rescrape:
        argv.append("--no-skip-existing")
    argv.extend(extra)
    rc = publicpurchase_interface.main(argv)
    if rc != 0:
        raise RuntimeError(f"publicpurchase_interface.main returned {rc}")


def _process_raw(prefix: str) -> None:
    from processor.pipeline import (
        DEFAULT_INPUT_DIR,
        DEFAULT_OUTPUT_DIR,
        process_directory,
    )

    written = process_directory(
        DEFAULT_INPUT_DIR,
        DEFAULT_OUTPUT_DIR,
        filename_prefix=prefix,
    )
    print(
        f"Processed {len(written)} '{prefix}*.json' file(s) from "
        f"{DEFAULT_INPUT_DIR} -> {DEFAULT_OUTPUT_DIR}",
        flush=True,
    )


def _ingest_to_supabase(prefix: str) -> None:
    from processor.ingest_supabase import ingest_directory
    from processor.pipeline import DEFAULT_OUTPUT_DIR

    result = ingest_directory(DEFAULT_OUTPUT_DIR, filename_prefix=prefix)
    print(
        f"Supabase ingest ({prefix}*): {result.upserted} upserted, "
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
        description="Run the full RFP ingestion pipeline for one data source.",
    )
    parser.add_argument(
        "source",
        choices=sorted(SOURCES.keys()),
        help="Which source to run the pipeline for ('sam', 'eProcure', or 'publicPurchase').",
    )
    parser.add_argument(
        "--skip-scrape", action="store_true",
        help="Skip the scrape stage; just (re)process and upload existing raw files.",
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
        "--scraper-arg", action="append", default=[],
        help="Pass an extra raw argument through to the chosen scraper "
             "(repeatable). Example: --scraper-arg=--max-per-naics --scraper-arg=25",
    )
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv)
    source = args.source
    cfg = SOURCES[source]
    prefix = cfg["prefix"]
    label = cfg["label"]

    failures: List[str] = []

    if not args.skip_scrape:
        if source == "sam":
            ok = _run_stage(
                f"Stage 1/3 — {label} scrape",
                lambda: _scrape_samgov(args.rescrape, args.no_drive, args.scraper_arg),
            )
        elif source == "eProcure":
            ok = _run_stage(
                f"Stage 1/3 — {label} scrape",
                lambda: _scrape_caleprocure(args.rescrape, args.scraper_arg),
            )
        else:  # publicPurchase
            ok = _run_stage(
                f"Stage 1/3 — {label} scrape",
                lambda: _scrape_publicpurchase(args.rescrape, args.scraper_arg),
            )
        if not ok:
            failures.append("scrape")
    else:
        print(f"\n[Stage 1/3] {label} scrape skipped (--skip-scrape)", flush=True)

    if not args.skip_process:
        ok = _run_stage(
            f"Stage 2/3 — Normalize + tag ({prefix}*)",
            lambda: _process_raw(prefix),
        )
        if not ok:
            failures.append("process")
            print(
                "\nAborting pipeline: cannot ingest into Supabase without processed files.",
                flush=True,
            )
            return 1
    else:
        print("\n[Stage 2/3] Processing skipped (--skip-process)", flush=True)

    if not args.skip_ingest:
        ok = _run_stage(
            f"Stage 3/3 — Supabase upload ({prefix}*)",
            lambda: _ingest_to_supabase(prefix),
        )
        if not ok:
            failures.append("ingest")
    else:
        print("\n[Stage 3/3] Supabase upload skipped (--skip-ingest)", flush=True)

    _banner(f"{label} pipeline complete")
    if failures:
        print(f"Pipeline finished with failures in: {', '.join(failures)}", flush=True)
        return 1
    print("All stages succeeded.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
