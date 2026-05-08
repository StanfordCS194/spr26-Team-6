"""Derived-field enrichment.

Adds the four new fields the spec calls for:
    name, statement_of_work, deliverables, tags

``name``, ``statement_of_work``, and ``deliverables`` are produced by
deterministic heuristics. Real value for these comes from an optional
``llm_callback`` argument to ``enrich`` — the callback receives the
normalized record plus the heuristic suggestion and returns the final
dict.

``tags`` come from a multi-label classifier trained on the raw corpus
(see ``processor.classifier``). The classifier emits 2–4 category tags;
the location tag from ``processor.location.detect_location`` is appended
last so every output has 3–5 total, with location guaranteed.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable, Optional

from processor.classifier import Classifier, load_or_train

# Resolve the project root locally so this module doesn't import from
# ``processor.pipeline`` (which would create a circular import — pipeline
# imports ``enrich``).
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_RAW_DIR = _PROJECT_ROOT / "data_raw"

# A process-wide default classifier so we don't load+deserialize the joblib
# artifact on every record. Set lazily by ``_get_default_classifier``.
_DEFAULT_CLASSIFIER: Classifier | None = None


def _get_default_classifier() -> Classifier:
    global _DEFAULT_CLASSIFIER
    if _DEFAULT_CLASSIFIER is None:
        _DEFAULT_CLASSIFIER = load_or_train(_DEFAULT_RAW_DIR)
    return _DEFAULT_CLASSIFIER


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

    name = generate_name(rfp)
    return [
        f"Execute scope of work described in the {name} solicitation",
        "Deliver milestones, status reporting, and acceptance documentation",
        "Provide final handoff and post-deployment support per RFP terms",
    ]


def generate_tags(
    rfp: dict[str, Any],
    location: str | None,
    *,
    classifier: Classifier | None = None,
) -> list[str]:
    """Return 3–5 tags for *rfp*, with *location* always included.

    The classifier produces 2–4 category tags; the location string is
    appended last (deduped). If no classifier is supplied the
    process-wide default is used (loaded or trained on first call).
    """
    clf = classifier or _get_default_classifier()
    category_tags = clf.predict_tags(rfp)

    tags = list(category_tags)
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
    classifier: Classifier | None = None,
) -> dict[str, Any]:
    """Apply enrichment, then optionally hand off to an LLM.

    The LLM callback signature is ``(rfp, heuristic_fields) -> final_fields``.
    It must return a dict with keys ``name``, ``statement_of_work``,
    ``deliverables``, ``tags``.
    """
    heuristic = {
        "name": generate_name(rfp),
        "statement_of_work": generate_statement_of_work(rfp),
        "deliverables": generate_deliverables(rfp),
        "tags": generate_tags(rfp, location, classifier=classifier),
    }
    final = llm_callback(rfp, heuristic) if llm_callback else heuristic
    return {
        **final,
        "location": location,
        "location_level": location_level,
    }
