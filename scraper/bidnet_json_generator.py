"""
Build the BidNet Direct (California Purchasing Group) contract JSON artifact.

Parallel to ``caleprocure_json_generator`` / ``samgov_json_generator``: consumes the
structured fields scraped from a BidNet solicitation abstract page (title, issuing
organization, dates, contact, description), the per-document Drive/source metadata, and
the NIGP/commodity category codes used for tech/IT/telecom relevance, then writes
pretty-printed JSON under ``data_raw/`` as ``bidnet_{external_id}.json``.

Unlike Cal eProcure (which only had one scraped text blob to regex over), BidNet exposes
each field as a labeled value once logged in, so this generator takes an already-parsed
``fields`` dict instead of re-parsing free text.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

# BidNet timestamps are stamped in US Eastern (e.g. "05/29/2026 03:02 PM EDT").
_EASTERN_TZ = ZoneInfo("America/New_York")
_PACIFIC_TZ = ZoneInfo("America/Los_Angeles")

_TZ_ABBREV = {
    "EDT": _EASTERN_TZ,
    "EST": _EASTERN_TZ,
    "ET": _EASTERN_TZ,
    "PDT": _PACIFIC_TZ,
    "PST": _PACIFIC_TZ,
    "PT": _PACIFIC_TZ,
}

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_RAW_DIR = os.path.join(_PROJECT_ROOT, "data_raw")


def external_id_from_detail_url(detail_url: str) -> str:
    """Pull the stable numeric solicitation id from an abstract URL.

    e.g. ``.../solicitations/statewide/444042433665/abstract?...`` -> ``444042433665``.
    Falls back to the last non-empty path segment.
    """
    if not detail_url:
        return "unknown"
    path = detail_url.split("?", 1)[0].split("#", 1)[0]
    segments = [seg for seg in path.rstrip("/").split("/") if seg]
    for seg in reversed(segments):
        if seg.isdigit():
            return seg
    return (segments[-1] if segments else "unknown") or "unknown"


def parse_bidnet_datetime(fragment: Optional[str]) -> Optional[str]:
    """Parse ``MM/DD/YYYY HH:MM AM/PM TZ`` (BidNet abstract dates) into ISO-8601.

    Handles a missing time (date only) and a missing/odd timezone suffix; defaults to
    US Eastern, which is what BidNet stamps. Returns None when nothing parses.
    """
    if not fragment:
        return None
    text = " ".join(str(fragment).split())
    m = re.search(
        r"(\d{1,2})/(\d{1,2})/(\d{4})"
        r"(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?"
        r"(?:\s*([A-Z]{2,4}))?",
        text,
        re.I,
    )
    if not m:
        return None
    month_s, day_s, year_s, hour_s, minute_s, ampm, tz_abbrev = m.groups()
    hour = 0
    minute = 0
    if hour_s is not None:
        hour = int(hour_s)
        minute = int(minute_s)
        if ampm:
            ampm_u = ampm.upper()
            if ampm_u == "PM" and hour != 12:
                hour += 12
            if ampm_u == "AM" and hour == 12:
                hour = 0
    tz = _TZ_ABBREV.get((tz_abbrev or "").upper(), _EASTERN_TZ)
    dt = datetime(
        int(year_s),
        int(month_s),
        int(day_s),
        hour,
        minute,
        tzinfo=tz,
    )
    return dt.isoformat()


def _clean(value: Optional[str]) -> Optional[str]:
    """Trim whitespace and treat BidNet's ``Locked`` placeholder as missing."""
    if value is None:
        return None
    collapsed = " ".join(str(value).split())
    if not collapsed or collapsed.lower() == "locked":
        return None
    return collapsed


def build_payload(
    fields: Dict[str, Any],
    detail_url: str,
    documents: List[Dict[str, Any]],
    category_codes: List[Dict[str, str]],
) -> Dict[str, Any]:
    """Assemble the normalized BidNet JSON object (same schema as the other sources).

    ``fields`` keys (all optional, missing values become None):
        title, issuing_organization, solicitation_number, description,
        publication_date, closing_date, contact_name, contact_email, contact_phone, source
    ``documents`` items should include ``label``, ``url``, ``type``
    (``primary_spec`` or ``attachment``).
    ``category_codes`` items should include ``code`` and ``description``.
    """
    external_id = external_id_from_detail_url(detail_url)

    title = _clean(fields.get("title")) or external_id
    dept = _clean(fields.get("issuing_organization"))
    description = _clean(fields.get("description")) or ""
    published_date = parse_bidnet_datetime(fields.get("publication_date"))
    due_date = parse_bidnet_datetime(fields.get("closing_date"))
    contact_name = _clean(fields.get("contact_name"))
    contact_email = _clean(fields.get("contact_email"))
    contact_phone = _clean(fields.get("contact_phone"))
    solicitation_number = _clean(fields.get("solicitation_number"))

    digest_seed = (external_id + "\n" + description[:8000]).encode(
        "utf-8", errors="replace"
    )
    content_hash = f"v1-{external_id}-{hashlib.sha256(digest_seed).hexdigest()[:12]}"

    return {
        "source": "BidNet Direct",
        "external_id": external_id,
        "title": title,
        "dept": dept,
        "description": description,
        "published_date": published_date,
        "due_date": due_date,
        "contact_name": contact_name,
        "contact_email": contact_email,
        "contact_phone": contact_phone,
        "status": "active",
        "is_relevant": True,
        "content_hash": content_hash,
        "metadata": {
            "event_type": _clean(fields.get("solicitation_type")) or "Solicitation / Bid",
            "solicitation_number": solicitation_number,
            "ui_link": detail_url,
            "location": _clean(fields.get("location")),
            "issuing_source": _clean(fields.get("source")),
            "mandatory_bidder_conference": {"required": False},
            "documents": documents,
            "category_codes": category_codes,
        },
    }


def write_raw_json(
    payload: Dict[str, Any],
    external_id: str,
    data_raw_dir: Optional[str] = None,
) -> str:
    """Write the payload to ``data_raw/bidnet_{external_id}.json`` (safe filename).

    Returns the absolute path written.
    """
    out_dir = os.path.abspath(data_raw_dir or DEFAULT_DATA_RAW_DIR)
    os.makedirs(out_dir, exist_ok=True)
    safe = re.sub(r"[^\w.\-]+", "_", external_id).strip("._") or "solicitation"
    path = os.path.join(out_dir, f"bidnet_{safe}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path


def run_generate_raw_json(
    fields: Dict[str, Any],
    detail_url: str,
    documents: List[Dict[str, Any]],
    category_codes: List[Dict[str, str]],
    data_raw_dir: Optional[str] = None,
) -> Tuple[Dict[str, Any], str]:
    """Build the payload and write it under ``data_raw/``. Returns ``(payload, path)``.

    Mirrors the public surface of
    :func:`caleprocure_json_generator.run_step6_generate_raw_json`.
    """
    payload = build_payload(fields, detail_url, documents, category_codes)
    path = write_raw_json(payload, payload["external_id"], data_raw_dir=data_raw_dir)
    return payload, path
