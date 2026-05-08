"""CLI entry point: `python -m processor`.

Examples:
    python -m processor                         # data_raw/ -> processed_data/
    python -m processor --input some/dir
    python -m processor --ingest                # also push processed files to Supabase
"""

from __future__ import annotations

import argparse
from pathlib import Path

from processor.pipeline import (
    DEFAULT_INPUT_DIR,
    DEFAULT_OUTPUT_DIR,
    process_directory,
)


def main() -> int:
    parser = argparse.ArgumentParser(prog="processor")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--ingest",
        action="store_true",
        help="After processing, ingest processed_data/ into Supabase.",
    )
    args = parser.parse_args()

    written = process_directory(args.input, args.output)
    print(f"Wrote {len(written)} processed file(s) to {args.output}")

    if args.ingest:
        from processor.ingest_supabase import ingest_directory  # local import; optional dep

        result = ingest_directory(args.output)
        print(f"Ingested {result.upserted} record(s) into Supabase "
              f"({result.skipped} skipped, {result.failed} failed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
