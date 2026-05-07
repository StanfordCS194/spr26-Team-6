"""
Step 6: build the Cal eProcure contract JSON artifact (see project Specifications.pdf).

Consumes Step 3 scraped Event Details text, Step 4/5 attachment metadata, and Drive URLs,
then writes pretty-printed JSON under ``data_raw/``.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

_PACIFIC_TZ = ZoneInfo("America/Los_Angeles")

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_RAW_DIR = os.path.join(_PROJECT_ROOT, "data_raw")


def external_id_from_detail_url(detail_url: str) -> str:
    """Prefer the last path segment (e.g. CS269009 from .../event/4300/CS269009)."""
    tail = detail_url.rstrip("/").split("/")[-1]
    if "?" in tail:
        tail = tail.split("?", 1)[0]
    if "#" in tail:
        tail = tail.split("#", 1)[0]
    return tail or "unknown"


def _first_email(text: str) -> Optional[str]:
    m = re.search(
        r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}",
        text,
    )
    return m.group(0) if m else None


def _first_phone(text: str) -> Optional[str]:
    # Cal eProcure usually uses a labeled field, e.g. "Phone: 760/770-6242".
    # Avoid matching unlabeled 10-digit tokens like numeric event IDs.
    m = re.search(r"(?:^|\n)\s*Phone\s*:?\s*(\d{3}/\d{3}-\d{4})\b", text, re.I)
    if m:
        return m.group(1)

    # Fallback to common formatted phone patterns (separators required).
    # Examples: 916-653-8468, 916 653 8468, (916) 653-8468
    m = re.search(
        r"(?:\+?1[-.\s]?)?(?:\(\d{3}\)\s*|\d{3}[-./\s])\d{3}[-./\s]\d{4}\b",
        text,
    )
    return m.group(0) if m else None


def _first_iso_datetime(text: str) -> Optional[str]:
    m = re.search(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)?",
        text,
    )
    return m.group(0) if m else None


def _parse_mmddyyyy_ampm_pacific(fragment: str) -> Optional[str]:
    """
    Parse strings like ``04/23/2026  1:00PM PDT`` into ISO-8601 with Pacific offset.
    Uses ``America/Los_Angeles`` so DST is correct even if the suffix is missing.
    """
    m = re.search(
        r"(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*(PDT|PST|PT)?",
        fragment,
        re.I,
    )
    if not m:
        return None
    month_s, day_s, year_s, hour_s, minute_s, ampm, _tz_hint = m.groups()
    hour = int(hour_s)
    minute = int(minute_s)
    ampm_u = ampm.upper()
    if ampm_u == "PM" and hour != 12:
        hour += 12
    if ampm_u == "AM" and hour == 12:
        hour = 0
    dt = datetime(
        int(year_s),
        int(month_s),
        int(day_s),
        hour,
        minute,
        tzinfo=_PACIFIC_TZ,
    )
    return dt.isoformat()


def _cal_eprocure_title_line(text: str, external_id: str) -> Optional[str]:
    """Line like ``CS269009 Pharmacy Services`` (event id + name)."""
    if not external_id or external_id == "unknown":
        return None
    # Keep match on a single line only (avoid crossing newlines into labels like "Format/Type:").
    m = re.search(rf"(?m)^\s*{re.escape(external_id)}[ \t]+([^\n]+)$", text)
    if not m:
        return None
    tail = " ".join(m.group(1).split())
    return f"{external_id} {tail}".strip()


def _cal_eprocure_title_from_event_block(text: str, external_id: str) -> Optional[str]:
    """
    Prefer the line immediately after ``Event : <id>`` (or ``Event ID``) when present.
    """
    if not text:
        return None
    lines = [ln.strip() for ln in text.replace("\r\n", "\n").split("\n")]
    for i, line in enumerate(lines):
        low = line.lower()
        if not low:
            continue
        if low.startswith("event :") or low == "event id":
            # Skip the raw ID line and take the next meaningful non-label line as title.
            for j in range(i + 1, min(i + 8, len(lines))):
                cand = (lines[j] or "").strip()
                if not cand:
                    continue
                cand_low = cand.lower()
                if external_id and cand == external_id:
                    continue
                if cand_low in {
                    "details",
                    "event id",
                    "format/type:",
                    "published date",
                    "dept:",
                    "event version",
                    "event end date:",
                    "description:",
                }:
                    continue
                if len(cand) < 6:
                    continue
                return " ".join(cand.split())
    return None


def _cal_eprocure_dept_block(text: str) -> Optional[str]:
    """``Dept:`` on one line, full name on the next (e.g. ``Dept of Developmental Services``)."""
    m = re.search(r"(?mi)^Dept:\s*\n\s*([^\n]+)", text)
    if m:
        return " ".join(m.group(1).split())
    m2 = re.search(r"(?m)^Dept:\s*(.+)$", text)
    if m2 and m2.group(1).strip():
        return " ".join(m2.group(1).split())
    return None


def _cal_eprocure_line_after_heading(text: str, heading_pattern: str) -> Optional[str]:
    m = re.search(heading_pattern, text, re.I | re.M)
    if not m:
        return None
    return m.group(1).strip() if m.lastindex else None


def _cal_eprocure_published_date(text: str) -> Optional[str]:
    frag = _cal_eprocure_line_after_heading(
        text,
        r"(?m)^Published\s+Date\s*$\n\s*(.+)$",
    )
    return _parse_mmddyyyy_ampm_pacific(frag) if frag else None


def _cal_eprocure_due_date(text: str) -> Optional[str]:
    frag = _cal_eprocure_line_after_heading(
        text,
        r"(?m)^Event\s+End\s+Date:\s*$\n\s*(.+)$",
    )
    if not frag:
        frag = _cal_eprocure_line_after_heading(
            text,
            r"(?m)^Event\s+End\s+Date:\s*(.+)$",
        )
    return _parse_mmddyyyy_ampm_pacific(frag) if frag else None


def _cal_eprocure_contact_name(text: str) -> Optional[str]:
    m = re.search(
        r"(?is)Contact\s+Information\s*\n\s*([^\n]+)",
        text,
    )
    if m:
        name = m.group(1).strip()
        if name and name.lower() != "phone:":
            return name
    return None


def parse_baseline_fields_from_details_text(
    scraped_text: str,
    detail_url: str,
) -> Dict[str, Any]:
    """
    Best-effort extraction of top-level JSON fields from the Step 3 string.
    Missing values are returned as None where the spec allows.
    """
    external_id = external_id_from_detail_url(detail_url)
    text = scraped_text.replace("\r\n", "\n").strip()
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

    title: Optional[str] = _cal_eprocure_title_from_event_block(text, external_id)
    if not title:
        title = _cal_eprocure_title_line(text, external_id)
    dept: Optional[str] = _cal_eprocure_dept_block(text)
    published_date: Optional[str] = _cal_eprocure_published_date(text)
    due_date: Optional[str] = _cal_eprocure_due_date(text)
    contact_name: Optional[str] = _cal_eprocure_contact_name(text)

    # Generic "Label: value" lines (avoid ``dept\.?`` — it matches ``Dept of …`` as label+value).
    label_re = re.compile(
        r"^(event name|title|department|dept\s*:|agency|published|posted|due|closing|"
        r"deadline|contact|buyer name)\s*[:]?\s*(.*)$",
        re.I,
    )
    for i, line in enumerate(lines):
        low_line = line.lower()
        if "contact information" in low_line and line.lower().strip() == "contact information":
            continue
        m = label_re.match(line)
        if m:
            label, rest = m.group(1).lower(), m.group(2).strip()
            val = rest if rest else (lines[i + 1] if i + 1 < len(lines) else "")
            if "event name" in label or label == "title":
                title = val or title
            elif "department" in label or "dept" in label or "agency" in label:
                dept = val or dept
            elif "published" in label or "posted" in label:
                iso = _parse_mmddyyyy_ampm_pacific(val) or _first_iso_datetime(val) or _first_iso_datetime(text)
                published_date = iso or published_date
            elif "due" in label or "closing" in label or "deadline" in label:
                iso = _parse_mmddyyyy_ampm_pacific(val) or _first_iso_datetime(val)
                due_date = iso or due_date
            elif ("contact" in label or "buyer" in label) and "information" not in label:
                contact_name = val or contact_name

    if not title and lines:
        skip_prefixes = (
            "event details",
            "details",
            "event id",
            "format/",
            "event version",
            "description:",
            "unspsc",
            "view event",
            "view vendor",
        )
        for ln in lines:
            low = ln.lower()
            if len(ln) < 6:
                continue
            if any(low.startswith(p) for p in skip_prefixes):
                continue
            if low.startswith("event ") and external_id and external_id not in ln:
                continue
            if external_id and ln.strip() == external_id:
                continue
            title = ln
            break
    if not published_date:
        published_date = _first_iso_datetime(text)
    if not due_date:
        all_iso = re.findall(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)?",
            text,
        )
        if len(all_iso) > 1:
            due_date = all_iso[1]

    description_blurb = text[:2000].strip() if text else ""
    if not contact_name:
        em = _first_email(text)
        if em:
            idx = text.find(em)
            prefix = text[max(0, idx - 80) : idx].split("\n")[-1].strip()
            low_pre = prefix.lower()
            if (
                2 < len(prefix) < 80
                and not low_pre.startswith("phone:")
                and "information" not in low_pre
            ):
                contact_name = prefix

    return {
        "external_id": external_id,
        "title": title or external_id,
        "dept": dept,
        "description": description_blurb,
        "published_date": published_date,
        "due_date": due_date,
        "contact_name": contact_name,
        "contact_email": _first_email(text),
        "contact_phone": _first_phone(text),
    }


def build_step6_payload(
    scraped_event_details_text: str,
    detail_url: str,
    documents: List[Dict[str, Any]],
    unspsc_codes: List[Dict[str, str]],
) -> Dict[str, Any]:
    """
    Assemble the Step 6 JSON object per Specifications.pdf.

    ``documents`` items should include at least ``label``, ``url``, and ``type``
    (e.g. ``primary_spec`` or ``attachment``).
    """
    base = parse_baseline_fields_from_details_text(
        scraped_event_details_text, detail_url
    )
    external_id = base["external_id"]
    digest = hashlib.sha256(
        (external_id + "\n" + scraped_event_details_text[:8000]).encode("utf-8", errors="replace")
    ).hexdigest()[:12]
    content_hash = f"v1-{external_id}-{digest}"

    return {
        "source": "Cal eProcure",
        "external_id": external_id,
        "title": base["title"],
        "dept": base["dept"],
        "description": base["description"],
        "published_date": base["published_date"],
        "due_date": base["due_date"],
        "contact_name": base["contact_name"],
        "contact_email": base["contact_email"],
        "contact_phone": base["contact_phone"],
        "status": "active",
        "is_relevant": True,
        "content_hash": content_hash,
        "metadata": {
            "event_type": "Sell Event / RFx",
            "event_version": 1,
            "mandatory_bidder_conference": {"required": False},
            "documents": documents,
            "unspsc_codes": unspsc_codes,
        },
    }


def write_step6_raw_json(
    payload: Dict[str, Any],
    external_id: str,
    data_raw_dir: Optional[str] = None,
) -> str:
    """
    Write the Step 6 payload to ``data_raw/caleprocure_{external_id}.json`` (safe filename).
    Returns the absolute path written.
    """
    out_dir = os.path.abspath(data_raw_dir or DEFAULT_DATA_RAW_DIR)
    os.makedirs(out_dir, exist_ok=True)
    safe = re.sub(r"[^\w.\-]+", "_", external_id).strip("._") or "event"
    path = os.path.join(out_dir, f"caleprocure_{safe}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path


def run_step6_generate_raw_json(
    scraped_event_details_text: str,
    detail_url: str,
    documents: List[Dict[str, Any]],
    unspsc_codes: List[Dict[str, str]],
    data_raw_dir: Optional[str] = None,
) -> Tuple[Dict[str, Any], str]:
    """
    Build the Step 6 dict and write it under ``data_raw/``.
    Returns ``(payload, path)``.
    """
    ext = external_id_from_detail_url(detail_url)
    payload = build_step6_payload(
        scraped_event_details_text, detail_url, documents, unspsc_codes
    )
    path = write_step6_raw_json(payload, ext, data_raw_dir=data_raw_dir)
    return payload, path
