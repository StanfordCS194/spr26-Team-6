"""Process raw scraper JSONs into the canonical processed format.

Reads every `*.json` under `data_raw/`, applies normalization plus derived
fields, and writes one matching file under `data_processed/`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

from processor.classifier import Classifier, load_or_train
from processor.enrich import EnrichmentCallback, enrich
from processor.location import detect_location
from processor.normalize import normalize_record

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_DIR = PROJECT_ROOT / "data_raw"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data_processed"


# Order the output keys land in. Mirrors the sample_data files so diffs
# against hand-curated fixtures stay readable.
_OUTPUT_FIELD_ORDER: tuple[str, ...] = (
    "source",
    "external_id",
    "title",
    "name",
    "statement_of_work",
    "deliverables",
    "location_level",
    "location",
    "tags",
    "dept",
    "description",
    "published_date",
    "due_date",
    "contact_name",
    "contact_email",
    "contact_phone",
    "status",
    "is_relevant",
    "content_hash",
    "metadata",
)


def _ordered(record: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in _OUTPUT_FIELD_ORDER:
        if key in record:
            out[key] = record[key]
    # Keep any unknown keys at the tail so we don't lose data.
    for key, value in record.items():
        if key not in out:
            out[key] = value
    return out


def process_one(
    raw: dict[str, Any],
    *,
    llm_callback: Optional[EnrichmentCallback] = None,
    classifier: Classifier | None = None,
) -> dict[str, Any]:
    """Apply normalization + enrichment to a single raw RFP record."""
    normalized = normalize_record(raw)
    location, level = detect_location(normalized)
    enriched = enrich(
        normalized,
        location=location,
        location_level=level,
        llm_callback=llm_callback,
        classifier=classifier,
    )
    merged = {**normalized, **enriched}
    return _ordered(merged)


def process_directory(
    input_dir: os.PathLike[str] | str = DEFAULT_INPUT_DIR,
    output_dir: os.PathLike[str] | str = DEFAULT_OUTPUT_DIR,
    *,
    llm_callback: Optional[EnrichmentCallback] = None,
    classifier: Classifier | None = None,
    filename_prefix: Optional[str] = None,
) -> list[Path]:
    """Process every `*.json` in `input_dir` into `output_dir`.

    When ``filename_prefix`` is set, only files whose name starts with that
    prefix are processed (e.g. ``"samgov_"`` or ``"caleprocure_"``). Returns
    the list of files written. Loads (or trains) the tag classifier once and
    reuses it across every record.
    """
    in_path = Path(input_dir)
    out_path = Path(output_dir)
    if not in_path.is_dir():
        raise FileNotFoundError(f"Input directory does not exist: {in_path}")
    out_path.mkdir(parents=True, exist_ok=True)

    if classifier is None:
        classifier = load_or_train(in_path)

    glob_pattern = f"{filename_prefix}*.json" if filename_prefix else "*.json"
    written: list[Path] = []
    for src in sorted(in_path.glob(glob_pattern)):
        with src.open("r", encoding="utf-8") as fh:
            raw = json.load(fh)
        processed = process_one(raw, llm_callback=llm_callback, classifier=classifier)
        dst = out_path / src.name
        with dst.open("w", encoding="utf-8") as fh:
            json.dump(processed, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        written.append(dst)
    return written
