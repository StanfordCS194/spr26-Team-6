"""Deterministic normalization of raw scraper fields.

These transforms run before any LLM-based enrichment. The goal is to make
identical-but-spelled-differently values converge to a single canonical
form so the database, classifier, and matcher all see the same string.
"""

from __future__ import annotations

import difflib
import re
from typing import Any

from processor.department_aliases import (
    ABBREVIATION_EXPANSIONS,
    DEPARTMENT_ALIASES,
)

# Canonical source values accepted by the rfps.source check constraint
# (see supabase/migrations/20260428000008_full_schema.sql).
_SOURCE_CANON: dict[str, str] = {
    "sam.gov": "sam.gov",
    "sam": "sam.gov",
    "cal eprocure": "Cal eProcure",
    "caleprocure": "Cal eProcure",
    "calprocure": "Cal eProcure",
    "planetbids": "PlanetBids",
    "planet bids": "PlanetBids",
}

_ALLOWED_STATUSES = {"active", "closed", "cancelled", "awarded", "amended"}


def canonicalize_source(source: str | None) -> str:
    if not source:
        return "other"
    return _SOURCE_CANON.get(source.strip().lower(), "other")


def canonicalize_status(status: str | None) -> str:
    if not status:
        return "active"
    s = status.strip().lower()
    return s if s in _ALLOWED_STATUSES else "active"


def canonicalize_phone(phone: str | None) -> str | None:
    """Strip formatting and return ###-###-#### (US) or +<digits> (intl)."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return f"{digits[0:3]}-{digits[3:6]}-{digits[6:10]}"
    if len(digits) == 11 and digits.startswith("1"):
        d = digits[1:]
        return f"{d[0:3]}-{d[3:6]}-{d[6:10]}"
    if not digits:
        return None
    return f"+{digits}"


def canonicalize_email(email: str | None) -> str | None:
    if not email:
        return None
    e = email.strip()
    if "@" not in e:
        return e
    local, domain = e.rsplit("@", 1)
    return f"{local}@{domain.lower()}"


def _expand_abbreviations(text: str) -> str:
    tokens = text.split()
    out: list[str] = []
    for tok in tokens:
        # Preserve trailing punctuation when looking up
        m = re.match(r"^([A-Za-z][A-Za-z\.]*)([,;:]?)$", tok)
        if not m:
            out.append(tok)
            continue
        word, trailing = m.group(1), m.group(2)
        replacement = ABBREVIATION_EXPANSIONS.get(word) or ABBREVIATION_EXPANSIONS.get(word.rstrip("."))
        out.append((replacement or word) + trailing)
    return " ".join(out)


def canonicalize_department(name: str | None) -> str | None:
    """Map alias → canonical full name. Falls back to abbreviation expansion
    plus a difflib fuzzy match against the alias table."""
    if not name:
        return None
    cleaned = re.sub(r"\s+", " ", name).strip()
    if not cleaned:
        return None

    # 1. Exact alias hit (case-insensitive).
    lower_map = {k.lower(): v for k, v in DEPARTMENT_ALIASES.items()}
    if cleaned.lower() in lower_map:
        return lower_map[cleaned.lower()]

    # 2. Expand obvious abbreviations and re-check.
    expanded = _expand_abbreviations(cleaned)
    if expanded.lower() in lower_map:
        return lower_map[expanded.lower()]

    # 3. Fuzzy match against the alias table.
    candidates = list(lower_map.keys())
    match = difflib.get_close_matches(cleaned.lower(), candidates, n=1, cutoff=0.85)
    if match:
        return lower_map[match[0]]
    match = difflib.get_close_matches(expanded.lower(), candidates, n=1, cutoff=0.8)
    if match:
        return lower_map[match[0]]

    # 4. Give up and return the expanded form.
    return expanded


# ---------------------------------------------------------------------------
# Description cleaning
# ---------------------------------------------------------------------------

# Lines whose stripped form (case-insensitive) matches one of these are
# treated as start-of-trailer markers when cleaning event-detail boilerplate.
_TRAILER_MARKERS = {
    "view event package",
    "view vendor ads",
    "contact information",
    "pre bid conference",
    "pre-bid conference",
}

# Field-label lines preceding the description body in Cal eProcure exports.
_HEADER_LABELS_RE = re.compile(
    r"^\s*(event\s*details|event\s*id|format/?type|published\s*date|"
    r"dept|event\s*version|event\s*end\s*date)\s*:?\s*$",
    re.IGNORECASE,
)


def clean_description(text: str | None) -> str | None:
    """Strip Cal eProcure event-details boilerplate from a description blob.

    The raw scraper output frequently embeds the entire event-details panel
    (Event ID, Format/Type, Published Date, Dept, Event Version, etc.) above
    and below the actual description. This pulls out just the body.
    """
    if not text:
        return text

    lines = text.split("\n")

    # Find an explicit "Description:" anchor; everything before it is metadata.
    body_start = 0
    for i, line in enumerate(lines):
        if line.strip().rstrip(":").lower() == "description":
            body_start = i + 1
            break

    body = lines[body_start:]

    # Truncate at the first trailer marker (Contact Information, etc.).
    body_end = len(body)
    for i, line in enumerate(body):
        if line.strip().lower() in _TRAILER_MARKERS:
            body_end = i
            break
    body = body[:body_end]

    # Drop residual header-label lines that snuck through and collapse blanks.
    cleaned: list[str] = []
    prev_blank = True
    for line in body:
        stripped = line.strip()
        if _HEADER_LABELS_RE.match(stripped):
            continue
        # Skip "Event : 0000036719" style anchors.
        if re.match(r"^event\s*:\s*\S+\s*$", stripped, re.IGNORECASE):
            continue
        if not stripped:
            if prev_blank:
                continue
            cleaned.append("")
            prev_blank = True
        else:
            cleaned.append(stripped)
            prev_blank = False

    while cleaned and not cleaned[-1]:
        cleaned.pop()

    result = "\n".join(cleaned).strip()
    return result or None


def clean_title(text: str | None) -> str | None:
    if not text:
        return text
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------------------
# Top-level entry point
# ---------------------------------------------------------------------------

def normalize_record(raw: dict[str, Any]) -> dict[str, Any]:
    """Return a shallow-copied record with deterministic fields normalized."""
    rec = dict(raw)
    rec["source"] = canonicalize_source(rec.get("source"))
    rec["status"] = canonicalize_status(rec.get("status"))
    rec["dept"] = canonicalize_department(rec.get("dept"))
    rec["title"] = clean_title(rec.get("title"))
    rec["description"] = clean_description(rec.get("description"))
    rec["contact_phone"] = canonicalize_phone(rec.get("contact_phone"))
    rec["contact_email"] = canonicalize_email(rec.get("contact_email"))
    rec["contact_name"] = (rec.get("contact_name") or "").strip() or None
    return rec
