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
    # Drop leading numeric solicitation IDs like "75350667 Civica MultiVue ...".
    base = re.sub(r"^\s*\d{6,}\s+", "", base)
    base = re.sub(r"\s+", " ", base).strip()
    return base or (rfp.get("dept") or "Untitled RFP")


# Phrases that signal a paragraph is project-defining (not contact/admin chatter).
_PROJECT_LEAD_PATTERNS = (
    "seeking",
    "is releasing",
    "requesting",
    "request for",
    "purpose of this",
    "scope of work",
    "scope of services",
    "intent of this",
    "the contractor",
    "the bidder",
    "proposals from",
    "qualified bidders",
    "will provide",
    "shall provide",
    "this solicitation",
    "this rfp",
    "this rfq",
    "this rfi",
)

# Filler / boilerplate sentences that shouldn't be picked as the SOW lead.
_FILLER_LEAD_PATTERNS = (
    "see attached",
    "please see the attached",
    "refer to the attached",
    "bid due date",
    "final supplier quotation",
    "key action dates",
    "this is q&a",
    "this is addendum",
    "see the attached",
    "summary of changes",
    "supplier quotation due",
    "bidder conference",
    "bidders conference",
    "pre-bid conference",
    "pre bid conference",
    "site visit",
    "site walk",
    "please note",
    "please allow time",
    "sign-in",
    "submission date is",
    "addendum has been posted",
    "questions and answers",
    "proposal submission",
    "questions regarding this event",
    "submitted in writing",
    "procurement official",
    "event package cover page",
    "view event package",
    "click on the view",
    "no later than",
    "qualification statements",
    "statements of qualifications",
    "screening committee",
    "by submitting an offer",
    "agrees to the terms",
    "firms interested in responding",
    "must notify the university",
    "the offeror must hold",
    # SAM admin / certification scaffolding.
    "brand name item:",
    "essential/significant physical",
    "this notice does not constitute",
    "this is a sources sought",
    "this is a request for information",
    "this is a combined synopsis",
    "this announcement constitutes",
    "offers are being requested",
    "notice of intent to sole source",
    "notice of intent (noi)",
    "is conducting market research",
    "issued solely for information",
    "issued for market research",
    "is issuing this notice",
    "i certify",
    "per vaar",
    "per far",
    "no contract will be awarded",
    "salient characteristics listed",
    "to my knowledge",
    "approved by:",
    "name, date:",
    "distribution statement",
    "this solicitation is issued",
    "the solicitation document",
    "incorporated provisions and clauses",
    "this solicitation is set-aside",
    "this solicitation is set aside",
    "the associated north american industrial",
    "the associated naics",
    "combined synopsis/solicitation notice",
    "iaw far",
    "in accordance with far",
    "this acquisition is set aside",
    "1. solicitation number",
    "2. notice type",
    "3. classification code",
    "psc:",
    "naics:",
    "size standard:",
    "this synopsis is not a request",
    "this notice is not a solicitation",
    "as defined by far",
    "disclaimer:",
    "this is a sources sought notice only",
    "shall not be construed as a commitment",
    "is in no way binding",
    "subject to modification",
    "the government will not pay",
    "the government is requesting",
    "responsibility of the interested parties",
    "information submitted in response",
    "is preliminary as well as subject",
    "this request for information does not commit",
    "this rfi is issued solely",
    "is issued solely for information",
    "does not constitute a request",
    "promise to issue an rfp",
    "all offers are subject to all terms",
    "sealed offers in original",
    "amendment to clause",
    "the government is not at this time seeking",
    "responders are advised",
    "respondents are advised",
    "all costs associated with",
    "justification for other than full and open",
    "if this contract is covered by",
    "when the government requires supplies",
    "the contractor must provide employees",
    "secure cloud computing architecture on aws",
    "all rights reserved",
    "aws prescriptive guidance",
    "copyright ©",
    "copyright (c)",
    "fringe benefits required",
    "wage determination",
    "minimum order",
    "maximum order",
    "address the offer to",
    "address offer to",
    "issued by code",
    "name and address of contractor",
    "paid sick leave",
    "executive order minimum wage",
    "occupational listing",
    "purchase number note",
    "sealed bid solicitations",
    "rated order under the defense priorities",
    "applicable executive order minimum wage",
    "must provide employees",
)


def _split_sentences(text: str) -> list[str]:
    """Conservative sentence split that handles abbreviations like 'No.', 'Inc.'."""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    # Split on .!? followed by whitespace + uppercase letter or digit.
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9“\"'])", text)
    return [p.strip() for p in parts if p and p.strip()]


def _is_filler(sentence: str) -> bool:
    stripped = sentence.strip()
    # Sentences that start with a code / solicitation number / date — these
    # are PDF form-value lines that got concatenated into the narrative.
    if re.match(r"^\s*\d{2,}[\-/\.]", stripped):
        return True
    if re.match(r"^\s*[A-Z]\d+[A-Z0-9\-]{3,}\b", stripped):
        return True
    low = stripped.lower()
    return any(p in low for p in _FILLER_LEAD_PATTERNS)


def _is_project_lead(sentence: str) -> bool:
    low = sentence.lower()
    return any(p in low for p in _PROJECT_LEAD_PATTERNS)


def generate_statement_of_work(rfp: dict[str, Any]) -> str:
    """Concise 1–3 sentence summary of what the contractor will do.

    Picks the first substantive, project-defining sentences from the cleaned
    description. Falls back to UNSPSC code descriptions when the description
    is too short / pointer-only ("Please see the attached RFQ for details").
    """
    desc = (rfp.get("description") or "").strip()
    sentences: list[str] = []
    for para in re.split(r"\n\s*\n", desc):
        for s in _split_sentences(para):
            if len(s) < 25 or _is_filler(s):
                continue
            sentences.append(s)
            if len(sentences) >= 6:
                break
        if len(sentences) >= 6:
            break

    # Prefer the first project-defining sentence as the lead. Keep at most two
    # substantive sentences so the SOW reads concisely.
    lead_idx = 0
    for i, s in enumerate(sentences):
        if _is_project_lead(s):
            lead_idx = i
            break

    summary_parts = sentences[lead_idx : lead_idx + 2]
    summary = " ".join(summary_parts).strip()

    # If the lead sentence already exceeds ~280 chars, just keep it solo so
    # the SOW doesn't run away with two long sentences.
    if summary_parts and len(summary_parts[0]) > 280:
        summary = summary_parts[0]

    # Fallback: synthesize from UNSPSC descriptions when the description is
    # too thin to carry a real summary.
    if len(summary) < 60:
        unspsc_phrases = _unspsc_phrases(rfp)
        name = generate_name(rfp)
        if unspsc_phrases:
            joined = ", ".join(unspsc_phrases[:3])
            summary = f"Provide {joined} in support of the {name} engagement."

    # Safety net: if the chosen SOW still reads as procurement boilerplate
    # (e.g. an SF-1449 form had no narrative scope), synthesize a one-liner
    # from the title + agency rather than emit a confusing admin sentence.
    if summary and _looks_like_pure_admin(summary):
        summary = _synthesize_sow_from_metadata(rfp)

    if not summary:
        summary = _synthesize_sow_from_metadata(rfp) or (desc or rfp.get("title") or "").strip()

    # Cap to keep it succinct.
    return summary[:500].rstrip()


_PROJECT_SIGNAL_PATTERNS = (
    "shall provide", "shall ensure", "shall perform", "shall include",
    "shall deliver", "shall supply", "shall install",
    "will provide", "will deliver", "will perform", "will supply",
    "is seeking", "seeks to procure", "seeks to", "intends to",
    "is releasing", "is requesting proposals", "is requesting quotes",
    "requirement is to", "this requirement is",
    "the system will", "the system shall", "the system must",
    "the solution will", "the solution shall",
    "the project", "this project",
    "the contractor shall", "the vendor shall",
    "to procure", "to acquire", "to purchase",
    "the platform", "the application",
    "describes the framework", "sets forth the objectives",
    "supports the", "supports naval", "supports the mission",
    "provides the framework", "provides a framework",
    "is to procure", "is to provide",
)


def _looks_like_pure_admin(text: str) -> bool:
    """True if the candidate SOW reads as pure procurement-process boilerplate
    or government form-field scaffolding rather than real project content."""
    if not text:
        return False
    low = text.lower()
    # 1. Explicit admin lead patterns immediately disqualify.
    if any(p in low for p in _FILLER_LEAD_PATTERNS):
        return True
    # 2. Form-field pattern: many ALL-CAPS tokens.
    words = re.findall(r"[A-Za-z][A-Za-z\-/]+", text)
    if len(words) < 8:
        return True
    allcaps = sum(1 for w in words if len(w) >= 3 and w.isupper())
    if allcaps / len(words) > 0.20:
        return True
    # 3. Numbered field markers ("1. X 2. Y 3. Z").
    if len(re.findall(r"\b\d+\.\s+[A-Z]", text)) >= 2:
        return True
    # 4. Short SOWs without project signals are almost certainly fragments.
    if len(text) < 120 and not any(p in low for p in _PROJECT_SIGNAL_PATTERNS):
        return True
    return False


def _synthesize_sow_from_metadata(rfp: dict[str, Any]) -> str:
    """Build a one-sentence SOW from title / dept / event_type / solicitation #.

    Used as a last-resort fallback for SAM notices whose attached docs contain
    no extractable narrative (SF-1449 / SF-30 form-only PDFs).
    """
    name = generate_name(rfp)
    dept = (rfp.get("dept") or "").strip()
    metadata = rfp.get("metadata") or {}
    event_type = (metadata.get("event_type") or "Solicitation").strip()
    sol_num = (metadata.get("solicitation_number") or "").strip()

    # Format the dept chain into something readable (DEPT OF X.DEPT OF Y.Z → Z).
    dept_pretty = dept.split(".")[-1].strip() if dept else ""

    parts = [f"{event_type} for {name}"]
    if sol_num:
        parts.append(f"(solicitation {sol_num})")
    if dept_pretty:
        parts.append(f"issued by {dept_pretty}")
    return " ".join(parts).strip() + "."


# ---------------------------------------------------------------------------
# Deliverables extraction
# ---------------------------------------------------------------------------

_DELIVERABLE_SECTION_HEADERS = (
    "deliverables",
    "key deliverables",
    "scope of work",
    "scope of services",
    "statement of work",
    "tasks",
    "key tasks",
    "services to be provided",
    "services provided",
    "required services",
    "work to be performed",
)

_OBLIGATION_VERBS = (
    "shall ",
    "must ",
    "will provide",
    "will deliver",
    "will perform",
    "will supply",
    "will install",
    "will furnish",
    "to be provided",
    "to be delivered",
    "to provide",
    "to deliver",
    "to furnish",
    "to install",
    "to supply",
    "responsible for",
)

# Submission / proposal-process language to exclude from deliverables.
_SUBMISSION_FILTERS = (
    "statement of qualifications",
    "statements of qualifications",
    "qualification statements",
    "submitted electronically",
    "submitted in writing",
    "submit",
    "no later than",
    "screening criteria",
    "screening committee",
    "reference checks",
    "interviews",
    "proposal due",
    "questions regarding",
    "procurement official",
    "event package cover page",
    "responding to this rf",
    "respond to this rf",
    "agrees to the terms",
    "by submitting an offer",
    # SAM.gov administrative / disclaimer language that masquerades as
    # "shall"/"will" obligations but is really about the procurement process.
    "this notice does not constitute",
    "this announcement constitutes",
    "this is a sources sought",
    "this is a request for information",
    "no contract will be awarded",
    "issued for market research",
    "issued solely for information",
    "respondents are responsible for",
    "respondents should",
    "interested parties should",
    "i certify",
    "per vaar",
    "per far",
    "salient characteristics listed",
    "the government will not",
    "the government does not",
    "anticipated period of performance",
    "period of performance shall be",
    "to my knowledge",
)

# Trim noise that often hides in extracted bullets.
_NOISE_TRIM_RE = re.compile(r"^[\s\-\*•\d\.\)\(\:]+|[\s:.;]+$")

# Words that signal a phrase is a deliverable / action item, not a heading.
_BULLET_ACTION_TOKENS = frozenset({
    "shall", "must", "will", "provide", "deliver", "perform", "install",
    "supply", "support", "develop", "implement", "configure", "integrate",
    "design", "manage", "maintain", "operate", "execute", "address",
    "create", "build", "produce", "track", "report", "monitor", "ensure",
    "submit", "include", "process", "review",
})
_BULLET_STOPWORDS = frozenset({
    "the", "of", "a", "an", "to", "in", "for", "and", "or", "with",
    "from", "on", "by", "as", "that", "this", "are", "is", "be", "all",
})


def _normalize_bullet(text: str) -> str:
    cleaned = _NOISE_TRIM_RE.sub("", text).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def _is_real_bullet(item: str) -> bool:
    """Reject section headings, form-fill labels, and certifications that
    show up as bullet-shaped lines in PDFs."""
    if not item or len(item) < 25 or len(item) > 280:
        return False
    low = item.lower()
    # Form fields like "Manufacturer name – N/A" / "Catalog number: N/A".
    if re.search(r"[–—\-:]\s*N/?A\s*$", item, re.IGNORECASE):
        return False
    if "n/a" == low or low.endswith(" n/a"):
        return False
    # Certification / admin scaffolding.
    if any(p in low for p in _SUBMISSION_FILTERS):
        return False
    # Form-field labels like "ISSUED BY CODE 6. ADDRESS THE OFFER TO" /
    # "ACKNOWLEDGEMENT OF AMENDMENTS AMENDMENT NO. DATE".
    tokens = re.findall(r"[A-Za-z][A-Za-z\-/']*", item)
    if len(tokens) < 5:
        return False
    allcaps = sum(1 for t in tokens if len(t) >= 2 and t.isupper())
    if allcaps / len(tokens) > 0.35:
        return False
    has_stop = any(t.lower() in _BULLET_STOPWORDS for t in tokens)
    has_action = any(t.lower() in _BULLET_ACTION_TOKENS for t in tokens)
    # Require natural English structure: either a clear action verb, or
    # enough stop-word glue that this looks like a sentence (not a header).
    if not (has_action or has_stop):
        return False
    # Reject phrases where every alphabetic token is title-cased — those are
    # almost always section subheadings ("Flexible and Adaptive").
    title_cased = sum(1 for t in tokens if t[0].isupper() and t[1:].islower())
    if title_cased / max(len(tokens), 1) > 0.75 and not has_action:
        return False
    return True


def _extract_bulleted_items(text: str) -> list[str]:
    """Pull explicit bullet/numbered list items out of a description."""
    items: list[str] = []
    bullet_re = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+(.{10,})$")
    for line in text.splitlines():
        m = bullet_re.match(line)
        if not m:
            continue
        cleaned = _normalize_bullet(m.group(1))
        if cleaned and cleaned not in items and _is_real_bullet(cleaned):
            items.append(cleaned)
    return items


def _extract_section_bullets(text: str) -> list[str]:
    """Find a deliverables-style section and pull its list items / sentences."""
    if not text:
        return []
    lines = text.splitlines()
    header_re = re.compile(
        r"^\s*(?:" + "|".join(re.escape(h) for h in _DELIVERABLE_SECTION_HEADERS) + r")\s*:?\s*$",
        re.IGNORECASE,
    )
    for i, line in enumerate(lines):
        if not header_re.match(line):
            continue
        # Collect following lines until we hit a likely new section / blank gap.
        captured: list[str] = []
        blanks = 0
        for follow in lines[i + 1 :]:
            stripped = follow.strip()
            if not stripped:
                blanks += 1
                if blanks >= 2 and captured:
                    break
                continue
            blanks = 0
            # Stop if we hit what looks like another section header.
            if re.match(r"^[A-Z][A-Z0-9 ,/&-]{4,}\s*:?\s*$", stripped):
                break
            bm = re.match(r"^\s*(?:[-*•]|\d+[.)])\s+(.{10,})$", follow)
            if bm:
                captured.append(_normalize_bullet(bm.group(1)))
            else:
                captured.append(_normalize_bullet(stripped))
            if len(captured) >= 8:
                break
        captured = [c for c in captured if c and _is_real_bullet(c)]
        if len(captured) >= 2:
            return captured
    return []


def _extract_obligation_sentences(text: str) -> list[str]:
    """Pull 'contractor shall ...' / 'will provide ...' style sentences,
    skipping anything about how to submit the proposal itself or RFI
    questionnaire prompts asking respondents to fill in answers."""
    found: list[str] = []
    questionnaire_markers = (
        " if yes", " if no", "if \"yes\"", "if \"no\"", "draft pws",
        "encompass the requirement", "more accurate proposal",
        "technical and functional comments", "please provide your",
    )
    for para in re.split(r"\n\s*\n", text or ""):
        for s in _split_sentences(para):
            low = s.lower()
            if not any(v in low for v in _OBLIGATION_VERBS):
                continue
            if any(f in low for f in _SUBMISSION_FILTERS):
                continue
            if any(q in low for q in questionnaire_markers):
                continue
            if "?" in s:  # questionnaire prompt, not a deliverable
                continue
            cleaned = _normalize_bullet(s)
            if 20 <= len(cleaned) <= 280 and cleaned not in found:
                found.append(cleaned)
            if len(found) >= 5:
                return found
    return found


def _unspsc_phrases(rfp: dict[str, Any]) -> list[str]:
    """Convert UNSPSC code descriptions into short deliverable noun phrases.

    Cal eProcure UNSPSC descriptions look like:
        "Information Technology Service Delivery - Cloud-based software as a srvc"
    We take the most specific (last) segment, expand 'srvc' / 'srvcs', and
    deduplicate.
    """
    out: list[str] = []
    seen: set[str] = set()
    metadata = rfp.get("metadata") or {}
    codes = metadata.get("unspsc_codes") or []
    for entry in codes:
        if not isinstance(entry, dict):
            continue
        desc = (entry.get("description") or "").strip()
        if not desc or "<" in desc:  # skip scraping artifacts like HTML fragments
            continue
        # Take the most specific level after " - ".
        segments = [seg.strip() for seg in desc.split(" - ") if seg.strip()]
        if not segments:
            continue
        phrase = segments[-1]
        # Normalise common Cal eProcure abbreviations.
        phrase = re.sub(r"\bsrvcs?\b", "services", phrase, flags=re.IGNORECASE)
        phrase = re.sub(r"\bmaint\b", "maintenance", phrase, flags=re.IGNORECASE)
        phrase = re.sub(r"\bmgmt\b", "management", phrase, flags=re.IGNORECASE)
        phrase = re.sub(r"\s+", " ", phrase).strip(" -")
        phrase_lc = phrase.lower()
        if not phrase or phrase_lc in seen or len(phrase) < 6:
            continue
        seen.add(phrase_lc)
        out.append(phrase[0].upper() + phrase[1:] if phrase else phrase)
    return out


def _deliverables_from_unspsc(rfp: dict[str, Any]) -> list[str]:
    phrases = _unspsc_phrases(rfp)
    if not phrases:
        return []
    items: list[str] = []
    for p in phrases[:4]:
        p = p.rstrip(".")
        # Phrase already action-ish? Otherwise prefix with "Provide".
        low = p.lower()
        if low.startswith(("provide", "deliver", "supply", "install", "perform", "furnish")):
            items.append(p)
        else:
            items.append(f"Provide {p[0].lower() + p[1:]}")
    return items


_DOC_LABEL_EXCLUDES = (
    "bidder", "conference", "attendance", "presentation", "sign-in",
    "q&a", "q and a", "question", "addendum", "amendment", "errata",
    "notice to", "instructions to bidders", "vendor ads",
)
_DOC_LABEL_SPEC_HINTS = (
    "rfp", "rfq", "rfi", "sow", "scope", "spec", "specification",
    "exhibit", "statement of work", "requirement",
)


def _deliverables_from_documents(rfp: dict[str, Any]) -> list[str]:
    """Last-ditch: derive an item from each linked specification PDF.

    Only used when nothing else fired; helps short / pointer-only RFPs that
    say things like "see attached RFQ for details" but have real attachments.
    Filters out clearly-administrative attachments (bidder conference rolls,
    Q&A responses, addenda) so they don't masquerade as deliverables.
    """
    metadata = rfp.get("metadata") or {}
    docs = metadata.get("documents") or []
    items: list[str] = []
    for d in docs:
        if not isinstance(d, dict):
            continue
        label = (d.get("label") or "").strip()
        if not label:
            continue
        low = label.lower()
        if any(bad in low for bad in _DOC_LABEL_EXCLUDES):
            continue
        # Prefer documents that look like the actual spec / SOW. If none of
        # the docs match, still emit the first non-excluded one.
        is_spec = (d.get("type") == "primary_spec") or any(h in low for h in _DOC_LABEL_SPEC_HINTS)
        if not is_spec and items:
            continue
        nice = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", label)
        nice = re.sub(r"[_\-]+", " ", nice).strip()
        nice = re.sub(r"\s+", " ", nice)
        if not nice:
            continue
        items.append(f"Address requirements in '{nice}'")
        if len(items) >= 3:
            break
    return items


# Sentences like "CalHEERS supports account creation, consumer application,
# eligibility rules, and health plan selection ..." expose deliverable-shaped
# noun lists that we can lift even when the description has no bullets.
_LIST_LEAD_RE = re.compile(
    r"(?:supports?|includes?|including|provides?|will\s+provide|shall\s+provide|"
    r"such\s+as|consist(?:s|ing)?\s+of|covers?)\s+(?P<items>[^.]+)",
    re.IGNORECASE,
)


def _extract_inline_lists(text: str) -> list[str]:
    """Extract deliverable-shaped items from comma-separated lists in prose.

    Only fires for high-quality, multi-word chunks — short fragments like
    "design" or "the enhancement" are dropped to avoid spammy deliverables.
    """
    if not text:
        return []
    items: list[str] = []
    seen: set[str] = set()
    for match in _LIST_LEAD_RE.finditer(text):
        chunk = match.group("items").strip()
        # Need at least two commas to look like a real list.
        if chunk.count(",") < 2:
            continue
        # Skip RFI questionnaire prompts and form-fill instructions.
        low_chunk = chunk.lower()
        if any(q in low_chunk for q in (
            "draft pws", "encompass the requirement", "more accurate proposal",
            "technical and functional comments", "please provide your",
            "if yes", "if no", "if \"yes\"", "if \"no\"",
        )):
            continue
        # Skip "such as ... but not limited to ..." example lists — those are
        # parenthetical examples, not project deliverables.
        if "but not limited to" in low_chunk or "such as" in match.group(0).lower():
            continue
        # Question marks anywhere in the chunk = questionnaire content.
        if "?" in chunk:
            continue
        # Split on commas only (preserving "X and Y" as one chunk).
        parts = chunk.split(",")
        verb = match.group(0).split()[0].lower()
        prefix_map = {
            "supports": "Support",
            "support": "Support",
            "includes": "Deliver",
            "include": "Deliver",
            "including": "Deliver",
            "provides": "Provide",
            "provide": "Provide",
            "shall": "Provide",
            "will": "Provide",
            "such": "Deliver",
            "consists": "Deliver",
            "consisting": "Deliver",
            "covers": "Cover",
            "cover": "Cover",
        }
        prefix = prefix_map.get(verb, "Deliver")
        accepted: list[str] = []
        for p in parts:
            p = p.strip().rstrip(".;:")
            # Strip leading conjunctions / determiners so each item reads
            # cleanly when prefixed.
            p = re.sub(r"^(?:and|or|the)\s+", "", p, flags=re.IGNORECASE).strip()
            if not p or len(p) < 18 or len(p) > 120:
                continue
            # Drop nested fragments like "including X" / "etc" / "every other item".
            low = p.lower()
            if low.startswith(("including ", "etc", "every other ", "but not limited to", "limited to")):
                continue
            # Drop items starting with a bare verb that would conflict with
            # an action-verb prefix (e.g. "Support check their eligibility").
            if low.startswith((
                "check ", "compare ", "research ", "purchase ",
                "review ", "monitor ", "calibrate ", "repair ",
            )):
                continue
            # Require at least two non-stopword tokens.
            tokens = re.findall(r"[A-Za-z]+", p)
            if len(tokens) < 2:
                continue
            if low in seen:
                continue
            seen.add(low)
            accepted.append(p)
        # Only fire if the section yielded ≥ 3 quality items.
        if len(accepted) < 3:
            continue
        for p in accepted[:4]:
            items.append(f"{prefix} {p[0].lower() + p[1:]}" if p[0].isalpha() else f"{prefix} {p}")
        if items:
            return items
    return items


def generate_deliverables(rfp: dict[str, Any]) -> list[str]:
    """Multi-strategy extraction of concrete deliverables.

    Tries, in order:
      1. Explicit bullets/numbers in the description.
      2. Bullets under a "Deliverables" / "Scope of Work" section.
      3. "shall/will/must provide ..." obligation sentences.
      4. UNSPSC code descriptions reshaped as "Provide <thing>".
      5. Linked document labels reshaped as "Address requirements in '<label>'".
      6. Generic boilerplate so the field is never empty.
    """
    desc = (rfp.get("description") or "").strip()

    for extractor in (
        _extract_bulleted_items,
        _extract_section_bullets,
        _extract_obligation_sentences,
        _extract_inline_lists,
    ):
        items = extractor(desc)
        items = [
            i for i in items
            if 10 < len(i) < 280 and not _looks_like_pure_admin(i)
        ]
        if len(items) >= 2:
            return items[:4]

    items = _deliverables_from_unspsc(rfp)
    if len(items) >= 2:
        return items[:4]

    items = _deliverables_from_documents(rfp)
    if len(items) >= 2:
        return items[:4]

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
