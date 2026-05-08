"""Derived-field enrichment.

Adds the four new fields the spec calls for:
    name, statement_of_work, deliverables, tags

A pure-heuristic baseline is provided so the pipeline runs without external
services. Pass a `llm_callback` to `enrich` to override fields with
LLM-generated values once the model integration is wired up — the callback
receives the normalized record and the heuristic suggestion and returns the
final dict.
"""

from __future__ import annotations

import re
from typing import Any, Callable, Optional

# Maps a substring (case-insensitive) found anywhere in the title/description
# to a canonical category tag. Order is unimportant; multiple matches are
# de-duplicated downstream.
_KEYWORD_TAGS: list[tuple[str, str]] = [
    ("transformer", "Electrical"),
    ("electrical", "Electrical"),
    ("wiring", "Electrical"),
    ("conduit", "Electrical"),
    ("medi-cal", "Health Services"),
    ("medicaid", "Health Services"),
    ("healthcare", "Health Services"),
    ("health care", "Health Services"),
    ("eligibility", "Health Services"),
    ("calheers", "Health Services"),
    ("hospital", "Health Services"),
    ("clinical", "Health Services"),
    ("server", "Hardware"),
    ("hardware", "Hardware"),
    ("freight", "Logistics"),
    ("software", "IT Systems"),
    ("information technology", "IT Systems"),
    ("system development", "System Development"),
    ("maintenance & operations", "Operations"),
    ("maintenance and operations", "Operations"),
    ("cyber", "Cybersecurity"),
    ("security", "Security"),
    ("forestry", "Forestry"),
    ("fire protection", "Fire Services"),
    ("cal fire", "Fire Services"),
    ("construction", "Construction"),
    ("install", "Construction"),
    ("transportation", "Transportation"),
    ("highway", "Infrastructure"),
    ("bridge", "Infrastructure"),
    ("water", "Infrastructure"),
    ("pipeline", "Infrastructure"),
    ("infrastructure", "Infrastructure"),
    ("cloud", "Cloud"),
    ("data center", "Data Center"),
    ("consulting", "Consulting"),
    ("training", "Training"),
    ("research", "Research"),
]


def _haystack(rfp: dict[str, Any]) -> str:
    return " ".join(
        str(rfp.get(k) or "") for k in ("title", "name", "description", "dept")
    ).lower()


def generate_name(rfp: dict[str, Any]) -> str:
    """Short descriptive name (Title Case-ish) — strips RFP/RFQ numbers."""
    base = (rfp.get("title") or rfp.get("name") or "").strip()
    # Drop trailing solicitation numbers like "RFP #73040873" or "(RFQ ...)".
    base = re.sub(r"\s*\(?(RFP|RFQ|RFx|IFB)\s*#?\S*\)?\s*$", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\s+", " ", base).strip()
    return base or (rfp.get("dept") or "Untitled RFP")


def generate_statement_of_work(rfp: dict[str, Any]) -> str:
    """First substantive paragraph from the cleaned description."""
    desc = (rfp.get("description") or "").strip()
    if not desc:
        return ""
    # First non-trivial paragraph, capped at ~600 chars.
    for para in re.split(r"\n\s*\n", desc):
        p = para.strip()
        if len(p) >= 40:
            return p[:600]
    return desc[:600]


def generate_deliverables(rfp: dict[str, Any]) -> list[str]:
    """Heuristic 3-item deliverables list.

    Real value comes from an LLM that reads the linked PDFs; this fallback
    just emits sensible shape-of-answer placeholders so downstream code
    always sees a populated list.
    """
    desc = (rfp.get("description") or "").strip()
    bullets: list[str] = []

    # Pull existing bullet/numbered items if present.
    for line in desc.splitlines():
        m = re.match(r"^\s*(?:[-*•]|\d+[.)])\s+(.{15,})$", line)
        if m:
            bullets.append(m.group(1).strip())
        if len(bullets) >= 4:
            break

    if bullets:
        return bullets[:4]

    # Fallback: synthesize from the project name.
    name = generate_name(rfp)
    return [
        f"Execute scope of work described in the {name} solicitation",
        "Deliver milestones, status reporting, and acceptance documentation",
        "Provide final handoff and post-deployment support per RFP terms",
    ]


def generate_tags(rfp: dict[str, Any], location: str | None) -> list[str]:
    """3–5 tags, including a location tag and category tags."""
    text = _haystack(rfp)
    seen: set[str] = set()
    category_tags: list[str] = []
    for needle, tag in _KEYWORD_TAGS:
        if needle in text and tag not in seen:
            category_tags.append(tag)
            seen.add(tag)
        if len(category_tags) >= 4:
            break

    # Always make sure we have at least 2 category tags so the location tag
    # doesn't dominate.
    if len(category_tags) < 2:
        category_tags.extend(t for t in ("Government", "Procurement") if t not in seen)

    tags = category_tags[:4]
    if location and location not in tags:
        tags.append(location)
    return tags[:5]


# ---------------------------------------------------------------------------
# Top-level entry point
# ---------------------------------------------------------------------------

EnrichmentCallback = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]


def enrich(
    rfp: dict[str, Any],
    *,
    location: str,
    location_level: str,
    llm_callback: Optional[EnrichmentCallback] = None,
) -> dict[str, Any]:
    """Apply heuristic enrichment, then optionally hand off to an LLM.

    The LLM callback signature is `(rfp, heuristic_fields) -> final_fields`.
    It must return a dict with keys `name`, `statement_of_work`,
    `deliverables`, `tags`.
    """
    heuristic = {
        "name": generate_name(rfp),
        "statement_of_work": generate_statement_of_work(rfp),
        "deliverables": generate_deliverables(rfp),
        "tags": generate_tags(rfp, location),
    }
    final = llm_callback(rfp, heuristic) if llm_callback else heuristic
    return {
        **final,
        "location": location,
        "location_level": location_level,
    }
