"""Weak labeling — bootstraps training labels for the tag classifier.

Two signals combined as a union:

1. **Keyword rules.** Substring scan over a concatenation of the
   normalized title, dept, description, and PDF document labels.
2. **UNSPSC family.** 8-digit codes are pulled out of the description body
   with a regex (``metadata.unspsc_codes`` is currently broken upstream —
   every scraped record carries a single ``01012001`` placeholder so it's
   ignored). The 2-digit prefix maps to a tag via
   ``UNSPSC_FAMILY_TAGS``.

Used at training time only; at inference we ask the trained classifier.
"""

from __future__ import annotations

import re
from typing import Any

from processor.tag_vocab import KEYWORD_TAG_RULES, UNSPSC_FAMILY_TAGS

_UNSPSC_CODE_RE = re.compile(r"\b\d{8}\b")
# Codes that should never count — the upstream scraper writes 01012001 as
# a placeholder when the real UNSPSC table can't be parsed.
_UNSPSC_PLACEHOLDERS = {"01012001"}


def extract_unspsc_codes(text: str) -> list[str]:
    """Return 8-digit UNSPSC codes found in *text* near a UNSPSC marker.

    To avoid mis-matching arbitrary 8-digit RFP / event numbers as if they
    were UNSPSC codes, we only accept matches whose preceding context
    (within ~120 chars) contains the literal "UNSPSC". The scraped raw
    descriptions present codes inside a "UNSPSC Codes" table; any 8-digit
    string outside that context is almost certainly a solicitation
    number, date, or placeholder.

    Note: ``processor.normalize.clean_description`` truncates the
    description at the "UNSPSC Codes" trailer marker. As a result this
    function returns ``[]`` on cleaned descriptions and is only useful
    when called on raw text (e.g. once ``metadata.unspsc_codes`` is fixed
    upstream).
    """
    if not text:
        return []
    seen: list[str] = []
    seen_set: set[str] = set()
    for match in _UNSPSC_CODE_RE.finditer(text):
        code = match.group(0)
        if code in _UNSPSC_PLACEHOLDERS or code in seen_set:
            continue
        # Reject obviously-not-UNSPSC long numeric strings like dates
        # (e.g. 20260514 — eight digits but a date).
        if 19000000 <= int(code) <= 21000000:
            continue
        # Require a "UNSPSC" marker within the preceding window.
        window_start = max(0, match.start() - 120)
        if "unspsc" not in text[window_start : match.start()].lower():
            continue
        seen.append(code)
        seen_set.add(code)
    return seen


def feature_text(rfp: dict[str, Any]) -> str:
    """Concatenate every text field that carries classification signal.

    The description is repeated once so it carries roughly twice the TF
    weight of any single other field — it's where the bulk of the project
    information lives.
    """
    parts: list[str] = []
    description = rfp.get("description") or ""
    if description:
        parts.append(description)
        parts.append(description)  # weight ~2x
    title = rfp.get("title") or ""
    if title:
        parts.append(title)
    dept = rfp.get("dept") or ""
    if dept:
        parts.append(dept)
    metadata = rfp.get("metadata") or {}
    docs = metadata.get("documents") or []
    for doc in docs:
        label = (doc or {}).get("label") or ""
        if label:
            # Underscores in PDF filenames break tokenization; replace.
            parts.append(label.replace("_", " "))
    return "\n".join(parts)


def label_record(rfp: dict[str, Any]) -> set[str]:
    """Return the set of tags suggested by keyword + UNSPSC rules."""
    text = feature_text(rfp).lower()
    tags: set[str] = set()

    for needle, tag in KEYWORD_TAG_RULES:
        if needle in text:
            tags.add(tag)

    description = rfp.get("description") or ""
    for code in extract_unspsc_codes(description):
        family_tag = UNSPSC_FAMILY_TAGS.get(code[:2])
        if family_tag:
            tags.add(family_tag)

    return tags
