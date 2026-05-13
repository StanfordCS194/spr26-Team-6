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
    "unspsc codes",
    "service area",
    "contractor license type",
}

# Some Cal eProcure descriptions write "Pre Bid Conference(N/A)" with no
# space before the parenthetical — treat any line that *starts with* one
# of these prefixes as a trailer too.
_TRAILER_PREFIXES = (
    "pre bid conference",
    "pre-bid conference",
)

# Field-label lines preceding the description body in Cal eProcure exports.
_HEADER_LABELS_RE = re.compile(
    r"^\s*(event\s*details|event\s*id|format/?type|published\s*date|"
    r"dept|event\s*version|event\s*end\s*date)\s*:?\s*$",
    re.IGNORECASE,
)

# Addendum / Q&A entries layered on top of Cal eProcure descriptions.
# Cal eProcure stacks update entries chronologically (newest first), each
# block beginning with a bare "MM/DD/YYYY" line, followed by content like
# "This is Addendum 4. ..." or "This is Q&A Set 2 for this RFP".
_DATE_ONLY_LINE_RE = re.compile(r"^\s*\d{1,2}/\d{1,2}/\d{2,4}\s*$")
_DATE_PREFIX_LINE_RE = re.compile(r"^\s*\d{1,2}/\d{1,2}/\d{2,4}\s*[-–—:]\s*")
_ADDENDUM_HEAD_RE = re.compile(
    r"^\s*(this\s+is\s+(addendum|q\s*&\s*a|q\s+and\s+a)|addendum\s+\d+|"
    r"q\s*&\s*a\b|amendment\s+\d+|errata\b)",
    re.IGNORECASE,
)
_ADDENDUM_KEYWORDS = (
    "addendum", "amendment", "errata", "q&a", "q & a", "q and a",
    "page count discrepancy", "summary of changes",
)


def strip_addendum_blocks(text: str) -> str:
    """Remove date-stamped addendum / Q&A entries from a description.

    Cal eProcure descriptions stack update entries on top of the original
    project announcement. This collapses the text to just the substantive
    project content by:
        * dropping blocks whose first line is a bare date followed by
          "This is Addendum/Q&A ..."
        * dropping standalone lines like "1/8/26 - Addendum 3 has been
          posted." that aren't substantive description
    """
    if not text:
        return text or ""

    blocks = re.split(r"\n\s*\n", text)
    kept_blocks: list[str] = []
    for block in blocks:
        lines = [ln for ln in block.split("\n")]
        non_empty = [ln for ln in lines if ln.strip()]
        if not non_empty:
            continue

        first = non_empty[0].strip()
        # "<date>\nThis is Addendum/Q&A ..." → drop whole block.
        if _DATE_ONLY_LINE_RE.match(first) and len(non_empty) >= 2:
            second = non_empty[1].strip()
            if _ADDENDUM_HEAD_RE.match(second):
                continue
            # Otherwise keep, but drop the bare-date line.
            lines = [ln for ln in lines if not _DATE_ONLY_LINE_RE.match(ln.strip())]

        # Strip lines like "1/7/26 - Addendum 3 has been posted." that are
        # pure update logs (only when the line clearly references addenda).
        filtered: list[str] = []
        for ln in lines:
            stripped = ln.strip()
            if _DATE_PREFIX_LINE_RE.match(stripped):
                low = stripped.lower()
                if any(kw in low for kw in _ADDENDUM_KEYWORDS):
                    continue
            filtered.append(ln)

        if not any(ln.strip() for ln in filtered):
            continue
        kept_blocks.append("\n".join(filtered).strip())

    return "\n\n".join(b for b in kept_blocks if b).strip()


def clean_description(text: str | None) -> str | None:
    """Strip Cal eProcure event-details boilerplate from a description blob.

    The raw scraper output frequently embeds the entire event-details panel
    (Event ID, Format/Type, Published Date, Dept, Event Version, etc.) above
    and below the actual description. This pulls out just the body.
    """
    if not text:
        return text

    lines = text.split("\n")

    # Find an explicit "Description" / "N. Description" anchor; everything
    # before it is metadata (typical of SAM.gov structured notices that lead
    # with "1. Solicitation Number / 2. Notice Type / ... / 4. Description").
    body_start = 0
    desc_anchor_re = re.compile(r"^\s*(?:\d+\.\s+)?description\s*:?\s*$", re.IGNORECASE)
    for i, line in enumerate(lines):
        if desc_anchor_re.match(line):
            body_start = i + 1
            break

    body = lines[body_start:]

    # Truncate at the first trailer marker (Contact Information, etc.).
    body_end = len(body)
    for i, line in enumerate(body):
        stripped = line.strip().lower()
        if stripped in _TRAILER_MARKERS:
            body_end = i
            break
        if any(stripped.startswith(p) for p in _TRAILER_PREFIXES):
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
    result = strip_addendum_blocks(result)
    result = strip_leading_admin_sentences(result) or ""
    result = _soft_cap_description(result)
    return result or None


def _soft_cap_description(text: str, *, target: int = 1800) -> str:
    """Cap description at a paragraph boundary near ``target`` characters.

    Long PDF dumps are unreadable as a description; we keep the first few
    paragraphs up to ~1800 chars so the field reads like a project summary.
    """
    if not text or len(text) <= target:
        return text
    blocks = re.split(r"\n\s*\n", text)
    out: list[str] = []
    total = 0
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        out.append(block)
        total += len(block) + 2
        if total >= target:
            break
    return "\n\n".join(out).strip()


# Procurement-process boilerplate that often opens SAM.gov notices. We strip
# these from the head of the description so the field reads as project content,
# not a procurement-mechanics intro.
_ADMIN_LEAD_DESC_PATTERNS = (
    "this is a combined synopsis",
    "this announcement constitutes",
    "this is a sources sought",
    "this is a request for information",
    "this notice does not constitute",
    "issued solely for information",
    "issued for market research",
    "is conducting market research",
    "is issuing this notice",
    "notice of intent",
    "offers are being requested",
    "this solicitation is issued",
    "the solicitation document and incorporated",
    "the solicitation document is",
    "incorporated provisions and clauses",
    "this solicitation is set-aside",
    "this solicitation is set aside",
    "the associated north american industrial",
    "the associated naics",
    "the fsc/psc is",
    "combined synopsis/solicitation notice",
    "iaw far",
    "in accordance with far",
    "this synopsis is not a request",
    "this notice is not a solicitation",
    "as defined by far",
    "disclaimer:",
    "this is a sources sought notice only",
    "all information submitted",
    "all information contained in this rfi",
    "all responses",
    "shall not be construed as a commitment",
    "is in no way binding",
    "subject to modification",
    "the government will not pay",
    "the government is requesting",
    "responsibility of the interested parties",
    "interested parties to monitor",
    "information submitted in response",
    "is preliminary as well as subject",
    "this request for information does not commit",
    "this rfi is issued solely",
    "is issued solely for information",
    "does not constitute a request",
    "promise to issue an rfp",
)


def strip_leading_admin_sentences(text: str | None) -> str | None:
    """Drop opening sentences that are procurement-process boilerplate.

    Only strips sentences appearing *before* the first substantive sentence —
    once we keep one, all later content is preserved (admin language deeper
    in the doc may be load-bearing context).
    """
    if not text:
        return text
    paragraphs = re.split(r"\n\s*\n", text)
    out_paragraphs: list[str] = []
    kept_anything = False
    for para in paragraphs:
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z“\"'])", para)
        kept_sentences: list[str] = []
        for s in sentences:
            low = s.lower().strip()
            if not kept_anything and any(p in low for p in _ADMIN_LEAD_DESC_PATTERNS):
                continue
            kept_sentences.append(s)
            if s.strip():
                kept_anything = True
        joined = " ".join(s.strip() for s in kept_sentences if s.strip()).strip()
        if joined:
            out_paragraphs.append(joined)
    return "\n\n".join(out_paragraphs).strip() or None


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
