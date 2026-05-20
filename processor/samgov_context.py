"""SAM.gov-specific context enrichment before canonical processing.

The SAM.gov API rows in ``data_raw`` often have an empty top-level
``description`` even though the metadata carries enough context to make the
dashboard useful: title, event type, solicitation number, set-aside, NAICS,
place of performance, and attached document labels.
"""

from __future__ import annotations

import re
from typing import Any


def is_samgov_record(record: dict[str, Any]) -> bool:
    source = str(record.get("source") or "").strip().lower()
    return source in {"sam.gov", "samgov", "sam gov", "sam"}


def _clean_label(label: str) -> str:
    label = label.replace("_", " ")
    label = re.sub(r"\s+", " ", label).strip()
    return label


def _location_text(metadata: dict[str, Any]) -> str | None:
    place = metadata.get("place_of_performance") or {}
    if not isinstance(place, dict):
        place = {}
    office = metadata.get("office_address") or {}
    if not isinstance(office, dict):
        office = {}

    city = (place.get("city") or {}).get("name") if isinstance(place.get("city"), dict) else None
    state = (place.get("state") or {}).get("name") if isinstance(place.get("state"), dict) else None
    if city or state:
        return ", ".join(str(part) for part in (city, state) if part)

    office_city = office.get("city")
    office_state = office.get("state")
    if office_city or office_state:
        return ", ".join(str(part) for part in (office_city, office_state) if part)
    return None


def build_samgov_description(record: dict[str, Any]) -> str:
    """Build a useful description from SAM.gov metadata when none is present."""
    metadata = record.get("metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}

    title = str(record.get("title") or "SAM.gov opportunity").strip()
    dept = str(record.get("dept") or "").strip()
    event_type = metadata.get("event_type")
    solicitation = metadata.get("solicitation_number")
    class_code = metadata.get("classification_code")
    set_aside = metadata.get("set_aside_description") or metadata.get("set_aside")
    naics = metadata.get("naics_codes") or []
    docs = metadata.get("documents") or []
    doc_labels = [
        _clean_label(str(doc.get("label") or ""))
        for doc in docs
        if isinstance(doc, dict) and doc.get("label")
    ]

    sentences: list[str] = []
    intro_bits = [title]
    if event_type:
        intro_bits.append(f"published as a {event_type}")
    if solicitation:
        intro_bits.append(f"under solicitation {solicitation}")
    intro = " is ".join(intro_bits[:2]) if len(intro_bits) > 1 else intro_bits[0]
    if len(intro_bits) > 2:
        intro = f"{intro} {intro_bits[2]}"
    if dept:
        intro = f"{intro} for {dept}"
    sentences.append(intro.rstrip(".") + ".")

    detail_parts: list[str] = []
    if naics:
        detail_parts.append(f"NAICS {', '.join(str(code) for code in naics)}")
    if class_code:
        detail_parts.append(f"classification {class_code}")
    if set_aside:
        detail_parts.append(f"set-aside: {set_aside}")
    location = _location_text(metadata)
    if location:
        detail_parts.append(f"place of performance: {location}")
    if detail_parts:
        sentences.append("Key procurement context: " + "; ".join(detail_parts) + ".")

    if doc_labels:
        shown = "; ".join(doc_labels[:6])
        more = f" and {len(doc_labels) - 6} more" if len(doc_labels) > 6 else ""
        sentences.append(
            f"Source package includes {len(doc_labels)} attached document(s): {shown}{more}."
        )

    return "\n\n".join(sentences)


def prepare_samgov_for_processing(record: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with SAM.gov description context populated."""
    if not is_samgov_record(record):
        return record
    prepared = dict(record)
    if not str(prepared.get("description") or "").strip():
        prepared["description"] = build_samgov_description(prepared)
    return prepared
