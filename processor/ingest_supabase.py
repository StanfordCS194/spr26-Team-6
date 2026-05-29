"""Scaffolding to ingest processed JSON files into Supabase.

This module is intentionally not wired into any HTTP endpoint or scheduler.
It provides the building blocks (row mapping + upsert) so a worker, cron,
or one-off CLI can drive it later.

Usage (after `pip install supabase`):

    from processor.ingest_supabase import ingest_directory
    ingest_directory()  # reads ./data_processed, upserts into public.rfps

Required env vars:
    SUPABASE_URL              — project URL (e.g. https://xxxx.supabase.co)
    SUPABASE_SERVICE_ROLE_KEY — service-role key (NEVER expose client-side)
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from processor.pipeline import DEFAULT_OUTPUT_DIR

RFPS_TABLE = "rfps"

# Number of pdf_url_N columns on the rfps table (see migrations 000009 /
# 20260429100000_rfps_pdf_urls.sql).
_PDF_URL_SLOTS = 10


@dataclass
class IngestResult:
    upserted: int = 0
    skipped: int = 0
    failed: int = 0
    errors: list[str] | None = None

    def __post_init__(self) -> None:
        if self.errors is None:
            self.errors = []


# ---------------------------------------------------------------------------
# Client construction
# ---------------------------------------------------------------------------

def get_client():  # type: ignore[no-untyped-def]
    """Build a service-role Supabase client from env.

    Imported lazily so the rest of the processor package works without the
    `supabase` dependency installed.
    """
    try:
        from supabase import create_client  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - dependency check
        raise RuntimeError(
            "supabase package is not installed. Run `pip install supabase` first."
        ) from exc

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment."
        )
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Row mapping
# ---------------------------------------------------------------------------

def _extract_pdf_urls(processed: dict[str, Any]) -> dict[str, str | None]:
    """Map metadata.documents[*].url into pdf_url_1 .. pdf_url_10."""
    docs = ((processed.get("metadata") or {}).get("documents")) or []
    urls: list[str] = []
    for doc in docs:
        url = (doc or {}).get("url")
        if isinstance(url, str) and url:
            urls.append(url)
        if len(urls) >= _PDF_URL_SLOTS:
            break

    out: dict[str, str | None] = {}
    for i in range(_PDF_URL_SLOTS):
        out[f"pdf_url_{i + 1}"] = urls[i] if i < len(urls) else None
    return out


def record_has_pdf_url(processed: dict[str, Any]) -> bool:
    """True when at least one document URL maps into pdf_url_1..pdf_url_10."""
    return any(_extract_pdf_urls(processed).get(f"pdf_url_{i}") for i in range(1, _PDF_URL_SLOTS + 1))


def to_rfp_row(processed: dict[str, Any]) -> dict[str, Any]:
    """Translate a processed JSON record into a row for `public.rfps`.

    Column names follow `supabase/migrations/20260428000002_schema.sql` and
    the additions in `20260428000008_full_schema.sql` /
    `20260428000009_pdf_url_columns.sql`.
    """
    location = processed.get("location")
    location_level = processed.get("location_level")
    state = "California" if (location_level == "state" or location == "California") else None

    row: dict[str, Any] = {
        # provenance
        "source": processed.get("source"),
        "external_id": processed.get("external_id"),

        # core
        "title": processed.get("title"),
        "name": processed.get("name"),
        "statement_of_work": processed.get("statement_of_work"),
        "deliverables": processed.get("deliverables") or [],
        "description": processed.get("description"),
        "location": location,
        "location_level": location_level,
        "state": state,
        "department": processed.get("dept"),
        "due_date": processed.get("due_date"),
        "posted_date": processed.get("published_date"),

        # classifier
        "tags": processed.get("tags") or [],
        "is_relevant": processed.get("is_relevant"),

        # contact
        "contact_name": processed.get("contact_name"),
        "contact_email": processed.get("contact_email"),
        "contact_phone": processed.get("contact_phone"),

        # raw + change detection
        "raw_data": processed,
        "metadata": processed.get("metadata") or {},
        "content_hash": processed.get("content_hash"),

        # lifecycle
        "status": processed.get("status") or "active",
    }
    row.update(_extract_pdf_urls(processed))
    return {k: v for k, v in row.items() if v is not None or k in {"deliverables", "tags", "metadata"}}


# ---------------------------------------------------------------------------
# Upserts
# ---------------------------------------------------------------------------

def upsert_record(client, processed: dict[str, Any]) -> dict[str, Any]:
    """Upsert a single processed RFP into `public.rfps`."""
    row = to_rfp_row(processed)
    if not row.get("source") or not row.get("external_id"):
        raise ValueError(
            f"Cannot upsert RFP without source+external_id: "
            f"got source={row.get('source')!r}, external_id={row.get('external_id')!r}"
        )
    response = (
        client.table(RFPS_TABLE)
        .upsert(row, on_conflict="source,external_id")
        .execute()
    )
    return response.data[0] if getattr(response, "data", None) else {}


def ingest_records(
    client,
    records: Iterable[dict[str, Any]],
    *,
    require_pdf_url: bool = True,
) -> IngestResult:
    result = IngestResult()
    for processed in records:
        if require_pdf_url and not record_has_pdf_url(processed):
            result.skipped += 1
            continue
        try:
            upsert_record(client, processed)
            result.upserted += 1
        except Exception as exc:  # pragma: no cover - network / runtime
            result.failed += 1
            assert result.errors is not None
            result.errors.append(f"{processed.get('external_id', '?')}: {exc}")
    return result


def ingest_directory(
    input_dir: os.PathLike[str] | str = DEFAULT_OUTPUT_DIR,
    *,
    client: Any | None = None,
    filename_prefix: str | None = None,
    require_pdf_url: bool = True,
) -> IngestResult:
    """Read every processed JSON in `input_dir` and upsert it into Supabase.

    When ``filename_prefix`` is set, only files whose name starts with that
    prefix are ingested (e.g. ``"samgov_"`` or ``"caleprocure_"``). Pass a
    pre-built ``client`` (e.g. for tests) or omit to construct one from env
    vars via :func:`get_client`.
    """
    in_path = Path(input_dir)
    if not in_path.is_dir():
        raise FileNotFoundError(f"data_processed directory does not exist: {in_path}")

    if client is None:
        client = get_client()

    glob_pattern = f"{filename_prefix}*.json" if filename_prefix else "*.json"
    result = IngestResult()
    for src in sorted(in_path.glob(glob_pattern)):
        try:
            with src.open("r", encoding="utf-8") as fh:
                processed = json.load(fh)
        except Exception as exc:
            result.failed += 1
            assert result.errors is not None
            result.errors.append(f"{src.name}: failed to read ({exc})")
            continue
        if not processed.get("source") or not processed.get("external_id"):
            result.skipped += 1
            continue
        if require_pdf_url and not record_has_pdf_url(processed):
            result.skipped += 1
            continue
        try:
            upsert_record(client, processed)
            result.upserted += 1
        except Exception as exc:  # pragma: no cover - network / runtime
            result.failed += 1
            assert result.errors is not None
            result.errors.append(f"{src.name}: {exc}")
    return result
