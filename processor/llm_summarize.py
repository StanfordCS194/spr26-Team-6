"""LLM-based description + Statement of Work generation.

Replaces the deterministic heuristics in ``processor.enrich`` for the
``description`` and ``statement_of_work`` fields. Consolidates the raw JSON
metadata plus extracted PDF / DOCX text into two concise summaries via
the OpenAI Chat Completions API.

Behavior:
  * Returns ``{description, statement_of_work}`` from one OpenAI call.
  * Caches each response under ``scraper/cache/llm/<source>_<external_id>.json``
    keyed by ``content_hash`` — re-processing the same record reuses the cached
    summary instead of re-billing the API.
  * If ``OPENAI_API_KEY`` is missing or the call fails, returns ``None`` so
    the pipeline can fall back to the heuristic output.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Optional

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_CACHE_DIR = _PROJECT_ROOT / "scraper" / "cache" / "llm"

# gpt-4o-mini: low-cost, high-quality summarization model with JSON-mode support.
_DEFAULT_MODEL = "gpt-4o-mini"
_MAX_TOKENS = 1024
# Cap PDF text we pass to the model so we don't blow up the context window
# on 100-page solicitations. The first ~30k characters covers the scope /
# objectives sections in nearly every SOW PDF we've seen.
_MAX_PDF_CHARS = 30000
# Cap the raw description we forward, too — Cal eProcure dumps include long
# Q&A appendices that aren't useful for a 5-sentence summary.
_MAX_DESCRIPTION_CHARS = 8000


_SYSTEM_PROMPT = (
    "You consolidate government RFP / solicitation data into two short, "
    "factual summaries. Write in plain prose — no markdown, no bullet lists, "
    "no headers. Never invent details that are not supported by the source "
    "material; if a field is unknown, omit it rather than guessing. Each "
    "summary must be 3 to 5 complete sentences."
)


def _build_user_prompt(
    raw: dict[str, Any],
    *,
    cleaned_description: str,
    pdf_text: str,
) -> str:
    """Assemble the structured prompt sent to Claude."""
    metadata = raw.get("metadata") or {}
    dept = (raw.get("dept") or "").strip()
    title = (raw.get("title") or "").strip()
    source = (raw.get("source") or "").strip()
    event_type = (metadata.get("event_type") or "").strip()
    solicitation_number = (metadata.get("solicitation_number") or "").strip()

    pop = metadata.get("place_of_performance") or {}
    pop_parts = []
    for key in ("city", "state", "country"):
        node = pop.get(key) if isinstance(pop, dict) else None
        if isinstance(node, dict):
            name = (node.get("name") or "").strip()
            if name:
                pop_parts.append(name)
    pop_str = ", ".join(pop_parts)

    naics_codes = ", ".join(metadata.get("naics_codes") or [])
    unspsc_entries = metadata.get("unspsc_codes") or []
    unspsc_lines = []
    for entry in unspsc_entries[:10]:
        if isinstance(entry, dict):
            desc = (entry.get("description") or "").strip()
            if desc:
                unspsc_lines.append(f"- {desc}")
    unspsc_str = "\n".join(unspsc_lines)

    documents = metadata.get("documents") or []
    doc_lines = []
    for doc in documents[:25]:
        if isinstance(doc, dict):
            label = (doc.get("label") or "").strip()
            if label:
                doc_lines.append(f"- {label}")
    doc_str = "\n".join(doc_lines)

    desc_clipped = (cleaned_description or "")[:_MAX_DESCRIPTION_CHARS]
    pdf_clipped = (pdf_text or "")[:_MAX_PDF_CHARS]

    sections = [
        "You are given the raw record for a government RFP. Produce two "
        "summaries:",
        "",
        "1) `description`: a 3 to 5 sentence overview of the project. "
        "Describe the overall goals, the agency that the contractor will be "
        "working with, and the aims of this project.",
        "",
        "2) `statement_of_work`: a 3 to 5 sentence overview of the work "
        "required. Describe the requirements of the project, who the "
        "contractor will work with (such as agencies or program offices), "
        "and what work this project will require from the contractor.",
        "",
        "Return ONLY a JSON object with exactly these two string keys and "
        "no other text:",
        '{"description": "...", "statement_of_work": "..."}',
        "",
        "---",
        "RECORD METADATA",
        f"Source: {source}",
        f"Title: {title}",
        f"Issuing department / agency: {dept}",
        f"Notice / event type: {event_type}",
        f"Solicitation number: {solicitation_number}",
        f"Place of performance: {pop_str}",
        f"NAICS codes: {naics_codes}",
    ]
    if unspsc_str:
        sections += ["UNSPSC category descriptions:", unspsc_str]
    if doc_str:
        sections += ["Attached document labels:", doc_str]
    sections += [
        "",
        "---",
        "CLEANED DESCRIPTION (from website scrape):",
        desc_clipped or "(none)",
        "",
        "---",
        "ATTACHED DOCUMENT TEXT (extracted from PDFs / DOCX):",
        pdf_clipped or "(none)",
    ]
    return "\n".join(sections)


_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _parse_response_text(text: str) -> Optional[dict[str, str]]:
    """Extract the ``{description, statement_of_work}`` JSON from the model
    response. Handles plain JSON and ```json fenced``` JSON."""
    if not text:
        return None
    stripped = _JSON_FENCE_RE.sub("", text).strip()
    # If the model included extra prose, slice from the first '{' to the
    # matching closing '}'.
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start < 0 or end <= start:
        return None
    blob = stripped[start : end + 1]
    try:
        parsed = json.loads(blob)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    desc = parsed.get("description")
    sow = parsed.get("statement_of_work")
    if not isinstance(desc, str) or not isinstance(sow, str):
        return None
    desc = desc.strip()
    sow = sow.strip()
    if not desc or not sow:
        return None
    return {"description": desc, "statement_of_work": sow}


def _cache_path(raw: dict[str, Any], cache_dir: Path) -> Optional[Path]:
    """Cache key combines source + external_id; cache value is invalidated
    by content_hash so re-scrapes with updated content re-run the LLM."""
    source = (raw.get("source") or "").strip().lower().replace(" ", "_")
    external_id = (raw.get("external_id") or "").strip()
    if not source or not external_id:
        return None
    safe_id = re.sub(r"[^\w.\-]+", "_", external_id).strip("._") or "rec"
    return cache_dir / f"{source}_{safe_id}.json"


def summarize_with_llm(
    raw: dict[str, Any],
    *,
    cleaned_description: str = "",
    pdf_text: str = "",
    cache_dir: os.PathLike[str] | str = _DEFAULT_CACHE_DIR,
    model: str = _DEFAULT_MODEL,
    refresh: bool = False,
) -> Optional[dict[str, str]]:
    """Generate ``description`` and ``statement_of_work`` via Anthropic Claude.

    Returns ``None`` on any failure (missing API key, transport error, malformed
    response) so the caller can fall back to a deterministic summary.
    """
    cache_root = Path(cache_dir)
    cache_root.mkdir(parents=True, exist_ok=True)
    cache_file = _cache_path(raw, cache_root)
    content_hash = (raw.get("content_hash") or "").strip()

    if cache_file and cache_file.is_file() and not refresh:
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            cached = None
        if isinstance(cached, dict):
            if cached.get("content_hash") == content_hash and content_hash:
                desc = cached.get("description")
                sow = cached.get("statement_of_work")
                if isinstance(desc, str) and isinstance(sow, str) and desc and sow:
                    return {"description": desc, "statement_of_work": sow}

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        from openai import OpenAI  # type: ignore
    except ImportError:
        return None

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            max_tokens=_MAX_TOKENS,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": _build_user_prompt(
                        raw,
                        cleaned_description=cleaned_description,
                        pdf_text=pdf_text,
                    ),
                },
            ],
        )
    except Exception:
        return None

    choices = getattr(response, "choices", None) or []
    if not choices:
        return None
    message = getattr(choices[0], "message", None)
    text = getattr(message, "content", "") or ""
    parsed = _parse_response_text(text)
    if not parsed:
        return None

    if cache_file:
        payload = {**parsed, "content_hash": content_hash, "model": model}
        try:
            cache_file.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass

    return parsed
