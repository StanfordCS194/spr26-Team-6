"""Deterministic structured summaries for cached dashboard display."""

from __future__ import annotations

from typing import Any


def _non_empty(value: Any, fallback: str = "Not specified") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def _amount(row: dict[str, Any]) -> str:
    lo = row.get("contract_amount_min")
    hi = row.get("contract_amount_max")
    if lo is None and hi is None:
        return "Not specified"
    if lo is not None and hi is not None and lo != hi:
        return f"${float(lo):,.0f} - ${float(hi):,.0f}"
    value = lo if lo is not None else hi
    return f"${float(value):,.0f}"


def build_structured_summary(row: dict[str, Any]) -> str:
    """Return markdown matching the dashboard Summary tab."""
    title = _non_empty(row.get("title"), "Untitled opportunity")
    agency = _non_empty(row.get("department") or row.get("dept"))
    description = _non_empty(row.get("description"))
    sow = _non_empty(row.get("statement_of_work") or description)
    deliverables = row.get("deliverables") or []
    if not isinstance(deliverables, list):
        deliverables = []
    tags = row.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    metadata = row.get("metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}
    docs = metadata.get("documents") or []
    doc_count = len(docs) if isinstance(docs, list) else 0

    deliverable_lines = "\n".join(
        f"- {str(item).strip()}" for item in deliverables if str(item).strip()
    )
    if not deliverable_lines:
        deliverable_lines = "- Review the source package and respond to the solicitation requirements."

    tag_text = ", ".join(str(tag) for tag in tags) if tags else "Not tagged"

    return "\n\n".join(
        [
            f"## {title}",
            "### Opportunity Snapshot\n"
            f"- **Agency:** {agency}\n"
            f"- **Source:** {_non_empty(row.get('source'))}\n"
            f"- **Due date:** {_non_empty(row.get('due_date'))}\n"
            f"- **Location:** {_non_empty(row.get('location'))}\n"
            f"- **Estimated value:** {_amount(row)}\n"
            f"- **Attached source documents:** {doc_count}",
            f"### Scope Summary\n{sow}",
            f"### Expected Deliverables\n{deliverable_lines}",
            f"### Keywords\n{tag_text}",
            f"### Source Context\n{description}",
        ]
    )
