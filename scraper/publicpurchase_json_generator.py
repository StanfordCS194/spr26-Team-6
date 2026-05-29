"""Build Public Purchase raw JSON artifacts for ``data_raw/publicpurchase_*.json``."""

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


def external_id_from_parts(agency_slug: str, bid_id: str) -> str:
    slug = re.sub(r"[^\w.\-]+", "_", agency_slug).strip("._") or "agency"
    bid = re.sub(r"[^\w.\-]+", "_", str(bid_id)).strip("._") or "bid"
    return f"{slug}__{bid}"


def _first_email(text: str) -> Optional[str]:
    m = re.search(
        r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}",
        text,
    )
    return m.group(0) if m else None


def _first_phone(text: str) -> Optional[str]:
    m = re.search(
        r"(?:\+?1[-.\s]?)?(?:\(\d{3}\)\s*|\d{3}[-./\s])\d{3}[-./\s]\d{4}\b",
        text,
    )
    return m.group(0) if m else None


def _parse_mmddyyyy(text: str) -> Optional[str]:
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if not m:
        return None
    month, day, year = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    try:
        dt = datetime(year, month, day, tzinfo=_PACIFIC_TZ)
    except ValueError:
        return None
    return dt.isoformat()


def _extract_naics_codes(text: str) -> List[str]:
    codes: List[str] = []
    seen = set()
    for m in re.finditer(r"\bNAICS[:\s#]*(\d{6})\b", text, re.I):
        code = m.group(1)
        if code not in seen:
            seen.add(code)
            codes.append(code)
    for m in re.finditer(r"\b(\d{6})\b", text):
        code = m.group(1)
        if code.startswith(("54", "51", "81")) and code not in seen:
            seen.add(code)
            codes.append(code)
    return codes[:12]


def _extract_unspsc_codes(text: str) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    seen = set()
    for m in re.finditer(r"\bUNSPSC[:\s#]*(\d{8})\b", text, re.I):
        code = m.group(1)
        if code in seen:
            continue
        seen.add(code)
        out.append({"code": code, "description": ""})
    return out


def parse_baseline_fields_from_detail_text(
    scraped_text: str,
    *,
    agency_slug: str,
    bid_id: str,
    detail_url: str,
    agency_name: Optional[str] = None,
    listing_title: Optional[str] = None,
) -> Dict[str, Any]:
    text = (scraped_text or "").replace("\r\n", "\n").strip()
    external_id = external_id_from_parts(agency_slug, bid_id)

    title = (listing_title or "").strip()
    if not title:
        m = re.search(r"(?m)^Title\s*:?\s*(.+)$", text, re.I)
        if m:
            title = m.group(1).strip()
    if not title:
        for line in text.split("\n"):
            line = line.strip()
            if len(line) >= 8 and not line.lower().startswith(("start date", "end date", "description")):
                title = line
                break
    if not title:
        title = external_id

    published = _parse_mmddyyyy(text)
    due = None
    for label in ("End Date", "Closing Date", "Due Date", "Bid Close"):
        m = re.search(rf"(?m)^{re.escape(label)}\s*:?\s*(.+)$", text, re.I)
        if m:
            due = _parse_mmddyyyy(m.group(1)) or due

    dept = agency_name or agency_slug.split(",")[0].replace("_", " ").title()

    return {
        "external_id": external_id,
        "title": title,
        "dept": dept,
        "description": text[:4000].strip() if text else "",
        "published_date": published,
        "due_date": due,
        "contact_name": None,
        "contact_email": _first_email(text),
        "contact_phone": _first_phone(text),
        "detail_url": detail_url,
    }


def build_payload(
    scraped_detail_text: str,
    *,
    agency_slug: str,
    bid_id: str,
    detail_url: str,
    documents: List[Dict[str, Any]],
    agency_name: Optional[str] = None,
    listing_title: Optional[str] = None,
) -> Dict[str, Any]:
    base = parse_baseline_fields_from_detail_text(
        scraped_detail_text,
        agency_slug=agency_slug,
        bid_id=bid_id,
        detail_url=detail_url,
        agency_name=agency_name,
        listing_title=listing_title,
    )
    external_id = base["external_id"]
    digest = hashlib.sha256(
        (external_id + "\n" + scraped_detail_text[:8000]).encode("utf-8", errors="replace")
    ).hexdigest()[:12]
    naics = _extract_naics_codes(scraped_detail_text)
    unspsc = _extract_unspsc_codes(scraped_detail_text)

    return {
        "source": "Public Purchase",
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
        "content_hash": f"v1-{external_id}-{digest}",
        "metadata": {
            "agency_slug": agency_slug,
            "bid_id": str(bid_id),
            "detail_url": detail_url,
            "event_type": "Public Purchase bid",
            "mandatory_bidder_conference": {"required": False},
            "documents": documents,
            "naics_codes": naics,
            "unspsc_codes": unspsc,
        },
    }


def write_raw_json(
    payload: Dict[str, Any],
    external_id: str,
    data_raw_dir: Optional[str] = None,
) -> str:
    out_dir = os.path.abspath(data_raw_dir or DEFAULT_DATA_RAW_DIR)
    os.makedirs(out_dir, exist_ok=True)
    safe = re.sub(r"[^\w.\-]+", "_", external_id).strip("._") or "bid"
    path = os.path.join(out_dir, f"publicpurchase_{safe}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path


def run_generate_raw_json(
    scraped_detail_text: str,
    *,
    agency_slug: str,
    bid_id: str,
    detail_url: str,
    documents: List[Dict[str, Any]],
    agency_name: Optional[str] = None,
    listing_title: Optional[str] = None,
    data_raw_dir: Optional[str] = None,
) -> Tuple[Dict[str, Any], str]:
    payload = build_payload(
        scraped_detail_text,
        agency_slug=agency_slug,
        bid_id=bid_id,
        detail_url=detail_url,
        documents=documents,
        agency_name=agency_name,
        listing_title=listing_title,
    )
    path = write_raw_json(payload, payload["external_id"], data_raw_dir=data_raw_dir)
    return payload, path
