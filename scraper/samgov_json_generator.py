"""
Build the SAM.gov contract JSON artifact (parallel to caleprocure_json_generator).

Consumes the raw search-result dict returned by the SAM.gov Get Opportunities Public API,
the cleaned-up full description text fetched from ``noticedesc``, and the per-attachment
Drive metadata, then writes pretty-printed JSON under ``data_raw/`` as
``samgov_{noticeId}.json``.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_RAW_DIR = os.path.join(_PROJECT_ROOT, "data_raw")


def notice_id_from_opportunity(opportunity: Dict[str, Any]) -> str:
    """Pull the stable ``noticeId`` (used as ``external_id``)."""
    nid = (opportunity or {}).get("noticeId") or ""
    return str(nid).strip() or "unknown"


class _HtmlToText(HTMLParser):
    """
    Minimal HTML stripper that preserves paragraph and list structure

    Block tags (p, div, br, li, headings) become newlines so that
    downstream regex parsers and LLM prompts see a sensible text shape
    """

    _BLOCK_TAGS = {
        "p", "br", "div", "li", "tr", "ul", "ol",
        "h1", "h2", "h3", "h4", "h5", "h6", "table",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: List[str] = []

    def handle_starttag(self, tag, attrs):  # type: ignore[override]
        if tag.lower() in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag):  # type: ignore[override]
        if tag.lower() in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data):  # type: ignore[override]
        if data:
            self._parts.append(data)

    def get_text(self) -> str:
        raw = "".join(self._parts)
        # Decode lingering entities (e.g. &nbsp;) and collapse whitespace.
        raw = unescape(raw).replace("\xa0", " ")
        # Normalise runs of blank lines to at most two newlines.
        raw = re.sub(r"[ \t]+\n", "\n", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def html_to_clean_text(html_body: str) -> str:
    """Convert a SAM.gov ``noticedesc`` HTML body to readable plain text."""
    if not html_body:
        return ""
    parser = _HtmlToText()
    parser.feed(html_body)
    parser.close()
    return parser.get_text()


def _first_pointofcontact(opportunity: Dict[str, Any]) -> Dict[str, Any]:
    pocs = opportunity.get("pointOfContact") or []
    if not pocs:
        return {}
    primary = next((p for p in pocs if (p or {}).get("type") == "primary"), None)
    return primary or pocs[0] or {}


def _office_dept(opportunity: Dict[str, Any]) -> Optional[str]:
    """Prefer the structured org chain, fall back to the deprecated ``department`` field."""
    full_path = opportunity.get("fullParentPathName")
    if isinstance(full_path, str) and full_path.strip():
        return full_path.strip()
    dept = opportunity.get("department")
    return dept.strip() if isinstance(dept, str) and dept.strip() else None


def _coerce_naics_list(opportunity: Dict[str, Any]) -> List[str]:
    """Some records ship ``naicsCodes`` as a list, others only have ``naicsCode``."""
    out: List[str] = []
    seen = set()
    for code in opportunity.get("naicsCodes") or []:
        if isinstance(code, str) and code.strip() and code not in seen:
            out.append(code.strip())
            seen.add(code)
    primary = opportunity.get("naicsCode")
    if isinstance(primary, str) and primary.strip() and primary not in seen:
        out.append(primary.strip())
    return out


def _detect_bidder_conference(text: str) -> Dict[str, Any]:
    """
    Heuristic check for a bidder conference / site visit clause in the description text.
    Conservative — flags ``required=True`` only when language explicitly says mandatory.
    """
    if not text:
        return {"required": False}
    lower = text.lower()
    has_event = any(
        token in lower
        for token in ("bidder conference", "bidders conference",
                      "pre-bid conference", "pre bid conference",
                      "site visit", "site walk", "industry day")
    )
    if not has_event:
        return {"required": False}
    is_mandatory = any(
        token in lower
        for token in ("mandatory site visit", "mandatory bidder",
                      "mandatory bidders", "mandatory pre-bid",
                      "mandatory pre bid", "mandatory industry day",
                      "attendance is mandatory", "attendance is required")
    )
    return {"required": bool(is_mandatory), "detected_by": "description_heuristic"}


def build_payload(
    opportunity: Dict[str, Any],
    description_text: str,
    documents: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Assemble the normalized SAM.gov JSON object.

    ``documents`` items should include ``label``, ``url``, ``type``
    (``primary_spec`` or ``attachment``), and may include ``original_extension``
    and ``attachment_description``.
    """
    notice_id = notice_id_from_opportunity(opportunity)
    poc = _first_pointofcontact(opportunity)
    naics_codes = _coerce_naics_list(opportunity)

    digest_seed = (notice_id + "\n" + (description_text or "")[:8000]).encode(
        "utf-8", errors="replace"
    )
    content_hash = f"v1-{notice_id}-{hashlib.sha256(digest_seed).hexdigest()[:12]}"

    place_of_performance = opportunity.get("placeOfPerformance") or None
    office_address = opportunity.get("officeAddress") or None

    payload: Dict[str, Any] = {
        "source": "SAM.gov",
        "external_id": notice_id,
        "title": (opportunity.get("title") or "").strip() or notice_id,
        "dept": _office_dept(opportunity),
        "description": description_text or "",
        "published_date": opportunity.get("postedDate") or None,
        "due_date": opportunity.get("responseDeadLine") or None,
        "contact_name": (poc.get("fullName") or None),
        "contact_email": (poc.get("email") or None),
        "contact_phone": (poc.get("phone") or None),
        "status": "active" if (opportunity.get("active") or "").lower() == "yes" else "inactive",
        "is_relevant": True,
        "content_hash": content_hash,
        "metadata": {
            "event_type": opportunity.get("type") or opportunity.get("baseType") or None,
            "solicitation_number": (opportunity.get("solicitationNumber") or None),
            "ui_link": opportunity.get("uiLink") or None,
            "naics_codes": naics_codes,
            "classification_code": opportunity.get("classificationCode") or None,
            "set_aside": opportunity.get("typeOfSetAside") or None,
            "set_aside_description": opportunity.get("typeOfSetAsideDescription") or None,
            "place_of_performance": place_of_performance,
            "office_address": office_address,
            "additional_info_link": opportunity.get("additionalInfoLink") or None,
            "mandatory_bidder_conference": _detect_bidder_conference(description_text),
            "documents": documents,
            "all_points_of_contact": opportunity.get("pointOfContact") or [],
        },
    }
    return payload


def write_raw_json(
    payload: Dict[str, Any],
    notice_id: str,
    data_raw_dir: Optional[str] = None,
) -> str:
    """
    Write the payload to ``data_raw/samgov_{notice_id}.json`` (safe filename).
    Returns the absolute path written.
    """
    out_dir = os.path.abspath(data_raw_dir or DEFAULT_DATA_RAW_DIR)
    os.makedirs(out_dir, exist_ok=True)
    safe = re.sub(r"[^\w.\-]+", "_", notice_id).strip("._") or "notice"
    path = os.path.join(out_dir, f"samgov_{safe}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path


def run_generate_raw_json(
    opportunity: Dict[str, Any],
    description_text: str,
    documents: List[Dict[str, Any]],
    data_raw_dir: Optional[str] = None,
) -> Tuple[Dict[str, Any], str]:
    """
    Build the payload and write it under ``data_raw/``. Returns ``(payload, path)``.
    Mirrors the public surface of :func:`caleprocure_json_generator.run_step6_generate_raw_json`.
    """
    payload = build_payload(opportunity, description_text, documents)
    path = write_raw_json(payload, payload["external_id"], data_raw_dir=data_raw_dir)
    return payload, path
