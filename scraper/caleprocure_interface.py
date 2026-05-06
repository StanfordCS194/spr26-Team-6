"""
This file provides a interface for interacting with CaleProcure.
It is used to search for technology-related contracts.

Step 1: search events by technology keywords and fuzzy-match against Event Name.
Step 2: open each candidate result and scrape only those whose UNSPSC codes look technology-related.
Step 3: scrape Event Details page text (browser; see ``scrape_event_details_text``).
Step 4: View Event Package and download up to 10 attachments (see ``download_event_package_attachments`` or ``run_steps_3_and_4``).

See tests/test_caleprocure.py for unit tests.
Alternative: run the following in terminal
conda run -n cs194w python -c "
from scraper.caleprocure_interface import CalEProcureInterface
client = CalEProcureInterface(timeout_seconds=30)

candidates = client.fuzzy_search_candidates(keywords=['software'], allow_browser_fallback=True)
filtered = client.unspsc_filter_search(candidates, include_probe_metadata=True)

print('Step1 candidates:', len(candidates))
print('Step2 filtered:', len(filtered))
for e in filtered[:10]:
    print('-', e.result.event_name, '|', e.extraction_strategy, '|', len(e.unspsc_codes), 'unspsc')
"
"""

from __future__ import annotations
from contextlib import contextmanager
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import unquote, urljoin
import os
import time
import requests
import re
import json

SEARCH_URL = "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx"
EVENT_BASE_URL = "https://caleprocure.ca.gov/"
DEFAULT_SEARCH_BUSINESS_UNIT = "BS3"

# Event Package / View Attachments — NLX clones PS controls (see data-if-label + id PV_ATTACH_WRK_SCM_DOWNLOAD$n).
PS_VIEW_ATTACH_DOWNLOAD_BTN = 'button[data-if-label="ViewAttachmentsView"]:not(.if-hide)'
PS_VIEW_ATTACH_DOWNLOAD_CTRLS = (
    f'{PS_VIEW_ATTACH_DOWNLOAD_BTN}, '
    '[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"], '
    'input[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"], '
    'a[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"], '
    'button:has(.fa-download)'
)

# Default folder for Step 4 saved attachments before Google Drive upload (created on demand).
DEFAULT_PDFS_FOR_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "pdfs_for_upload"
)

# Tech/IT/telecommunications keywords (heuristics) for fuzzy search
DEFAULT_TECH_KEYWORDS = [
    "software",
    "hardware",
    "computer",
    "server",
    "cloud",
    "cybersecurity",
    "network",
    "telecommunications",
    "data center",
    "it support",
    "database",
    "ai",
    "machine learning",
    "laptop",
    "desktop",
    "devops",
    "mainframe",
    "encryption",
    "firewall",
    "data",
    "firmware",
    "microservices"
]

# Conservative UNSPSC families frequently used for technology procurement
# See: https://www.ungm.org/public/unspsc 
# For pruning the results of the fuzzy/heuristic-based search
TECH_UNSPSC_PREFIXES = (
    "43",       # Information technology broadcasting and telecommunications
    "8111",     # Profession engineering services: computer services
    "8116",     # Profession engineering services: information technology service delivery
    "8311",     # Telecommunications media services   
    "831216",   # Information services: information centers
    "831217",   # Information services: mass communication services
                # Note: 831215 is Information services: libraries
)

# Fallback for fuzzy search pruning
# It's possible a contract doesn't have a "valid" UNSPSC code but is still tech-related
TECH_UNSPSC_DESCRIPTION_HINTS = (
    "software",
    "computer",
    "server",
    "network",
    "telecom",
    "telecommunication",
    "internet",
    "cyber",
    "data",
    "cloud",
    "storage",
    "database",
    "information technology",
)

# Data classes for CaleProcure search results, UNSPSC codes, and events that satisfy both 
# the fuzzy search and the UNSPSC code pruning
@dataclass(frozen=True)
class SearchResult:
    external_id: Optional[str]
    event_name: str
    detail_url: str

@dataclass(frozen=True)
class UnspscCode:
    code: str
    description: str

@dataclass
class FilteredEvent:
    result: SearchResult
    unspsc_codes: List[UnspscCode] = field(default_factory=list)
    extraction_strategy: str = "text_fallback"


@dataclass
class DownloadedAttachment:
    """Step 4: one file saved from the Event Package attachments grid."""

    local_path: str
    attached_file_name: str
    attachment_description: str


# Class that walks anchor tags in search result HTML and looks for events (contracts) or links
class _SearchResultsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._capture_text = False
        self._current_href: Optional[str] = None
        self._text_parts: List[str] = []
        self.rows: List[SearchResult] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag.lower() != "a":
            return

        attr_map = dict(attrs)
        href = attr_map.get("href")
        if not href:
            return

        lowered = href.lower()
        # The header/nav can include many links containing "event"
        # (e.g. the search page itself) --> we only want actual event details
        if ("/event/" not in lowered) and ("auc_id" not in lowered):
            return

        self._capture_text = True
        self._current_href = href
        self._text_parts = []

    def handle_data(self, data: str) -> None:
        if self._capture_text:
            self._text_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or not self._capture_text:
            return

        event_name = " ".join(part.strip() for part in self._text_parts if part.strip())
        href = self._current_href or ""
        self._capture_text = False
        self._current_href = None
        self._text_parts = []

        if not event_name or not href:
            return

        detail_url = urljoin(EVENT_BASE_URL, href)
        self.rows.append(
            SearchResult(
                external_id=_extract_external_id(event_name, detail_url),
                event_name=unescape(event_name),
                detail_url=detail_url,
            )
        )

# Extracts likely UNSPSC code + description pairs from event detail HTML
class _UnspscParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._buffer: List[str] = []

    def handle_data(self, data: str) -> None:
        cleaned = data.strip()
        if cleaned:
            self._buffer.append(cleaned)

    @property
    def text(self) -> str:
        return " ".join(self._buffer)

# Lowercase a string and change all whitespace to single spaces for consistency
def _normalize(value: str) -> str:
    return " ".join(value.lower().split())

# Extracts the event ID from the event name or URL
def _extract_external_id(event_name: str, detail_url: str) -> Optional[str]:
    for token in event_name.split():
        if token.isdigit() and len(token) >= 6:
            return token

    digits = "".join(ch for ch in detail_url if ch.isdigit())
    if len(digits) >= 6:
        return digits[-10:]

    return None


def _filename_from_content_disposition(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    m = re.search(r"filename\*=UTF-8''([^;\s]+)", value, re.I)
    if m:
        return unquote(m.group(1).strip().strip('"'))
    m = re.search(r'filename\s*=\s*"([^"]+)"', value, re.I)
    if m:
        return m.group(1)
    m = re.search(r"filename\s*=\s*([^;\s]+)", value, re.I)
    if m:
        return m.group(1).strip('"')
    return None


# Scores how well an event name matches any keyword in the list of keywords
# Default list of keywords is DEFAULT_TECH_KEYWORDS
# Returns 1.0 for an exact match, otherwise uses python SequenceMatcher
def _best_keyword_similarity(event_name: str, keywords: Iterable[str]) -> float:
    normalized_name = _normalize(event_name)
    if not normalized_name:
        return 0.0

    best = 0.0
    for keyword in keywords:
        normalized_keyword = _normalize(keyword)
        if not normalized_keyword:
            continue
        if normalized_keyword in normalized_name:
            return 1.0
        score = SequenceMatcher(None, normalized_name, normalized_keyword).ratio()
        best = max(best, score)
    return best

# Determines if a UNSPSC code is relevant by checking against TECH_UNSPSC_PREFIXES
def is_tech_unspsc(code: str, description: str) -> bool:
    compact = "".join(ch for ch in code if ch.isdigit())
    normalized_desc = _normalize(description)

    if any(compact.startswith(prefix) for prefix in TECH_UNSPSC_PREFIXES):
        return True
    if any(hint in normalized_desc for hint in TECH_UNSPSC_DESCRIPTION_HINTS):
        return True
    return False

# Start parsing search result HTML via _SearchResultsParser
# But if that fails, uses _parse_search_results_from_grid
def parse_search_results(html: str) -> List[SearchResult]:
    parser = _SearchResultsParser()
    parser.feed(html)

    # Deduplicate by URL while preserving order
    seen = set()
    deduped: List[SearchResult] = []
    for row in parser.rows:
        if row.detail_url in seen:
            continue
        seen.add(row.detail_url)
        deduped.append(row)

    # The event search page often renders results into a PeopleSoft grid
    # where event IDs/names are present but detail links don't have real hrefs
    # If anchor-based parsing found nothing, try grid-cell parsing
    if deduped:
        return deduped

    return _parse_search_results_from_grid(html)

# Handles PeopleSoft grid HTML where results are in clickable rows
# Looks for Event IDs and Event Names
class _EventGridParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_clickable_tbody = False
        self.capture: Optional[str] = None  # "id" | "name"
        self._cell_text_parts: List[str] = []
        self._current_event_id_text: Optional[str] = None
        self.rows: List[SearchResult] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag.lower() == "tbody":
            attr_map = dict(attrs)
            classes = (attr_map.get("class") or "").lower()
            self.in_clickable_tbody = "clickable" in classes
            return

        if not self.in_clickable_tbody:
            return

        if tag.lower() == "td":
            attr_map = dict(attrs)
            label = (attr_map.get("data-if-label") or "").strip()
            if label == "tdEventId":
                self.capture = "id"
                self._cell_text_parts = []
            elif label == "tdEventName":
                self.capture = "name"
                self._cell_text_parts = []

    def handle_data(self, data: str) -> None:
        if not self.capture:
            return
        cleaned = unescape(data).strip()
        if cleaned:
            self._cell_text_parts.append(cleaned)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "tbody":
            self.in_clickable_tbody = False
            self.capture = None
            self._cell_text_parts = []
            self._current_event_id_text = None
            return

        if not self.in_clickable_tbody:
            return

        if tag.lower() != "td" or not self.capture:
            return

        cell_text = " ".join(self._cell_text_parts).strip()

        if self.capture == "id":
            self._current_event_id_text = cell_text
        elif self.capture == "name":
            event_name = cell_text
            event_id_text = self._current_event_id_text or ""
            auc_id_digits = "".join(ch for ch in event_id_text if ch.isdigit())
            if event_name and len(auc_id_digits) >= 6:
                detail_url = urljoin(
                    EVENT_BASE_URL,
                    f"event/{DEFAULT_SEARCH_BUSINESS_UNIT}/{auc_id_digits}",
                )
                self.rows.append(
                    SearchResult(
                        external_id=auc_id_digits,
                        event_name=event_name,
                        detail_url=detail_url,
                    )
                )

        # Reset capture for the current td
        self.capture = None
        self._cell_text_parts = []


class _UnspscDetailTableParser(HTMLParser):
    """Reads UNSPSC rows from Event Details table cells."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: List[UnspscCode] = []
        self._pending_code: Optional[str] = None
        self._capture: Optional[str] = None
        self._parts: List[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag.lower() != "td":
            return
        am = dict(attrs)
        lab = (am.get("data-if-label") or "").strip()
        if lab == "unspscClassification":
            self._capture = "code"
            self._parts = []
        elif lab == "unspscDescription":
            self._capture = "desc"
            self._parts = []

    def handle_data(self, data: str) -> None:
        if self._capture and data.strip():
            self._parts.append(unescape(data).strip())

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "td" or not self._capture:
            return
        text = " ".join(self._parts).strip()
        if self._capture == "code":
            digits = "".join(ch for ch in text if ch.isdigit())
            self._pending_code = digits if len(digits) == 8 else None
        elif self._capture == "desc":
            if self._pending_code:
                self.rows.append(UnspscCode(code=self._pending_code, description=text))
            self._pending_code = None
        self._capture = None
        self._parts = []


def extract_unspsc_codes_from_unspsc_table(detail_html: str) -> List[UnspscCode]:
    parser = _UnspscDetailTableParser()
    parser.feed(detail_html)
    seen = set()
    out: List[UnspscCode] = []
    for row in parser.rows:
        key = (row.code, row.description)
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def _merge_unspsc_lists(*lists: List[UnspscCode]) -> List[UnspscCode]:
    seen = set()
    out: List[UnspscCode] = []
    for lst in lists:
        for item in lst:
            key = (item.code, item.description)
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
    return out


# Naively tries to extract an UNSPSC code by scanning for 8-digit codes
def extract_unspsc_codes(detail_html: str) -> List[UnspscCode]:
    parser = _UnspscParser()
    parser.feed(detail_html)
    text = parser.text

    # Lightweight extraction: scan tokens and pair 8-digit codes with nearby text
    tokens = text.split()
    out: List[UnspscCode] = []
    seen = set()
    for idx, token in enumerate(tokens):
        digits = "".join(ch for ch in token if ch.isdigit())
        if len(digits) != 8:
            continue

        # Use a short right context as description candidate
        right = tokens[idx + 1 : idx + 9]
        description = " ".join(right).strip(" -:;,")
        description = description[:120].strip()
        key = (digits, description)
        if key in seen:
            continue
        seen.add(key)
        out.append(UnspscCode(code=digits, description=description))

    return out

# Fallback parser using _EventGridParser for PeopleSoft-style grid layouts
# where event links don't carry real hrefs
def _parse_search_results_from_grid(html: str) -> List[SearchResult]:
    parser = _EventGridParser()
    parser.feed(html)

    # Deduplicate by detail_url while preserving order
    seen = set()
    deduped: List[SearchResult] = []
    for row in parser.rows:
        if row.detail_url in seen:
            continue
        seen.add(row.detail_url)
        deduped.append(row)
    return deduped

# Parses a JSON payload to find UNSPSC codes and their descriptions from PeopleSoft format
def _extract_unspsc_from_capture_results(capture_results: Dict[str, Any]) -> List[UnspscCode]:
    rows = capture_results.get("unspscCodeBody", [])
    out: List[UnspscCode] = []
    seen = set()

    for row in rows:
        children = row.get("Children", {})
        code_entries = children.get("unspscClassification", [])
        desc_entries = children.get("unspscDescription", [])
        code = _first_capture_text(code_entries)
        description = _first_capture_text(desc_entries)
        if not code:
            continue
        digits = "".join(ch for ch in code if ch.isdigit())
        if len(digits) != 8:
            continue
        key = (digits, description)
        if key in seen:
            continue
        seen.add(key)
        out.append(UnspscCode(code=digits, description=description))

    return out

# Pulls the first non-empty text property from a list of capture entry objects
# Helper function for _extract_unspsc_from_capture_results
def _first_capture_text(entries: Any) -> str:
    if not isinstance(entries, list):
        return ""
    for entry in entries:
        props = entry.get("Properties", {})
        text = props.get("text", "")
        if isinstance(text, str) and text.strip():
            return text.strip()
    return ""

# Finds a JSON object containing some key within raw JS strings
def _extract_json_object_after_key(raw: str, key: str) -> Optional[Dict[str, Any]]:
    needle = f'"{key}"'
    idx = raw.find(needle)
    if idx == -1:
        return None

    start = raw.rfind("{", 0, idx)
    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(raw)):
        ch = raw[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                candidate = raw[start : i + 1]
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    return None
    return None

# Parse embedded script payloads and return CaptureResults when present
def _extract_embedded_capture_results_from_html(detail_html: str) -> Optional[Dict[str, Any]]:
    script_chunks = re.findall(
        r"<script[^>]*>(.*?)</script>",
        detail_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    for chunk in script_chunks:
        if "CaptureResults" not in chunk:
            continue
        parsed = _extract_json_object_after_key(chunk, "CaptureResults")
        if parsed and isinstance(parsed.get("CaptureResults"), dict):
            return parsed["CaptureResults"]
    return None

# HTTP-backed class that interfaces with CaleProcure to scrape events (contracts)
# that satisfy both a fuzzy search of tech-related keywords and have tech-related UNSPSC codes
class CalEProcureInterface:
    def __init__(
        self,
        timeout_seconds: int = 30,
        *,
        playwright_headless: bool = True,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.playwright_headless = playwright_headless
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": (
                    "text/html,application/xhtml+xml,application/xml;q=0.9,"
                    "image/avif,image/webp,*/*;q=0.8"
                ),
                "Accept-Language": "en-US,en;q=0.9",
                "Connection": "keep-alive",
                "Referer": SEARCH_URL,
            }
        )
        self._session_primed = False

    # Warm up anti-bot/cookies before search requests
    def _prime_session(self) -> None:
        if self._session_primed:
            return
        bootstrap_urls = [
            "https://caleprocure.ca.gov/pages/",
            "https://caleprocure.ca.gov/pages/Events-BS3/",
            SEARCH_URL,
        ]
        for url in bootstrap_urls:
            try:
                self.session.get(url, timeout=self.timeout_seconds)
            except requests.RequestException:
                # Best effort only; if one bootstrap URL fails, try next.
                continue
        self._session_primed = True

    # This typically won't work because CaleProcure uses dynamic loading
    # But good to have in case the website ever changes structure
    # See the next function (search_with_browser_html) for the fallback approach
    def search_raw_html(self, keyword: str) -> str:
        self._prime_session()
        attempts = [
            {"params": {"eventName": keyword}},
            {"params": {"EventName": keyword}},
            {"params": {"searchText": keyword}},
            {
                "data": {"eventName": keyword, "search": "Search"},
                "headers": {"Content-Type": "application/x-www-form-urlencoded"},
                "method": "post",
            },
        ]

        last_error: Optional[Exception] = None
        for attempt in attempts:
            method = attempt.get("method", "get")
            req_kwargs = {
                "timeout": self.timeout_seconds,
            }
            if "params" in attempt:
                req_kwargs["params"] = attempt["params"]
            if "data" in attempt:
                req_kwargs["data"] = attempt["data"]
            if "headers" in attempt:
                req_kwargs["headers"] = attempt["headers"]

            try:
                response = self.session.request(method, SEARCH_URL, **req_kwargs)
                if response.status_code == 403:
                    continue
                response.raise_for_status()
                return response.text
            except requests.RequestException as exc:
                last_error = exc
                continue

        if last_error:
            raise last_error
        raise requests.HTTPError(
            f"Unable to query Cal eProcure search endpoint for keyword '{keyword}'."
        )

    # Browser fallback for JS-render pages, using playwright
    def _search_with_browser_html(self, keyword: str) -> str:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError(
                "Playwright is required for browser fallback. "
                "Install with `pip install playwright` and `python -m playwright install chromium`."
            ) from exc

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=self.playwright_headless,
                args=["--disable-blink-features=AutomationControlled"],
                ignore_default_args=["--enable-automation"],
            )
            context = browser.new_context(
                user_agent=self.session.headers.get("User-Agent", ""),
                locale="en-US",
            )
            page = context.new_page()
            page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=45_000)
            page.wait_for_timeout(2_000)

            # If we landed on the generic portal, click through to the CSCR app
            # ("Find Bid Opportunities (CSCR)") before trying to locate search inputs
            try:
                cscr_link = page.locator("a:has-text('Find Bid Opportunities (CSCR)')").first
                if cscr_link.count() == 0:
                    # Fallback: any link pointing to the event-search page
                    cscr_link = page.locator("a[href*='event-search.aspx']").first
                if cscr_link.count() > 0:
                    cscr_link.click(timeout=10_000)
                    try:
                        page.wait_for_selector("#RESP_INQA_WK_ZZ_AUC_NAME", timeout=25_000)
                    except Exception:
                        pass
                    page.wait_for_timeout(1_000)
            except Exception:
                # If this navigation step fails, we still try to proceed; the
                # worst case is we stay on the landing page and no rows are found
                pass

            # Try known Cal eProcure search input/button first
            frames = [page.main_frame] + [f for f in page.frames if f != page.main_frame]
            specific_input_id = "#RESP_INQA_WK_ZZ_AUC_NAME"
            specific_search_button_id = "#RESP_INQA_WK_INQ_AUC_GO_PB"

            filled = False
            for frame in frames:
                try:
                    if frame.locator(specific_input_id).count() > 0:
                        # Some templates render the field as temporarily readonly/disabled
                        # Set the value via JS and dispatch input/change events
                        frame.evaluate(
                            """(sel, val) => {
                                const el = document.querySelector(sel);
                                if (!el) return false;
                                // If the field is disabled/readonly in the template,
                                // clear those attributes so the app can use the value.
                                try {
                                  el.disabled = false;
                                  el.removeAttribute('disabled');
                                } catch (e) {}
                                try {
                                  el.readOnly = false;
                                  el.removeAttribute('readonly');
                                } catch (e) {}

                                el.value = val;
                                el.focus?.();
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('keyup', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.blur?.();
                                return true;
                            }""",
                            specific_input_id,
                            keyword,
                        )
                        filled = True
                        break
                except Exception:
                    continue

            # If we couldn't set the known field, fall back to generic heuristics
            if not filled:
                # Try likely search input selectors across all frames
                # Cal eProcure can render controls inside PeopleSoft/NLX frames
                input_selectors = [
                    "input[name*='eventName' i]",
                    "input[id*='eventName' i]",
                    "input[name*='AUC_NAME' i]",
                    "input[id*='AUC_NAME' i]",
                    "input[name*='keyword' i]",
                    "input[id*='keyword' i]",
                    "input[name*='search' i]",
                    "input[id*='search' i]",
                    "input[type='search']",
                    "input[type='text']",
                ]

                for frame in frames:
                    for selector in input_selectors:
                        try:
                            locator = frame.locator(selector).first
                            if locator.count() == 0:
                                continue
                            locator.fill("")
                            locator.fill(keyword)
                            filled = True
                            break
                        except Exception:
                            continue
                    if filled:
                        break

            if not filled:
                browser.close()
                raise RuntimeError("Could not find a search input field on Cal eProcure page.")

            # Try clicking a likely search button in any frame; fall back to Enter
            clicked = False
            for frame in frames:
                try:
                    if frame.locator(specific_search_button_id).count() > 0:
                        # Click via JS to bypass cases where the element is disabled during template render
                        frame.evaluate(
                            """(sel) => {
                                const btn = document.querySelector(sel);
                                if (!btn) return false;
                                try { btn.disabled = false; btn.removeAttribute('disabled'); } catch (e) {}
                                btn.click();
                                return true;
                            }""",
                            specific_search_button_id,
                        )
                        # Also attempt a normal click as a fallback
                        frame.locator(specific_search_button_id).first.click(timeout=10_000)
                        clicked = True
                        break
                except Exception:
                    continue

            if not clicked:
                button_selectors = [
                    "button:has-text('Search')",
                    "input[type='submit'][value*='Search' i]",
                    "button[id*='search' i]",
                    "input[id*='search' i]",
                    "a:has-text('Search')",
                ]
                for frame in frames:
                    for selector in button_selectors:
                        try:
                            locator = frame.locator(selector).first
                            if locator.count() == 0:
                                continue
                            locator.click(timeout=8_000)
                            clicked = True
                            break
                        except Exception:
                            continue
                    if clicked:
                        break

            if not clicked:
                for frame in frames:
                    try:
                        frame.keyboard.press("Enter")
                        clicked = True
                        break
                    except Exception:
                        continue

            # Avoid networkidle (often waits full timeout on this site)
            try:
                page.wait_for_selector("table tbody tr, tbody.clickable tr", timeout=20_000)
            except Exception:
                pass
            page.wait_for_timeout(1_500)
            content = page.content()
            # Include frame content because results may render inside an iframe
            for frame in frames[1:]:
                try:
                    content += "\n<!-- FRAME CONTENT -->\n" + frame.content()
                except Exception:
                    continue
            browser.close()
            return content

    def fetch_event_detail_html(self, detail_url: str) -> str:
        response = self.session.get(detail_url, timeout=self.timeout_seconds)
        response.raise_for_status()
        return response.text

    @staticmethod
    def _require_playwright():
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError(
                "Playwright is required for Steps 3 and 4. "
                "Install with `pip install playwright` and `python -m playwright install chromium`."
            ) from exc
        return sync_playwright

    @staticmethod
    def _playwright_frames(page: Any) -> List[Any]:
        return [page.main_frame] + [f for f in page.frames if f != page.main_frame]

    @contextmanager
    def _playwright_page(self, accept_downloads: bool = False):
        sync_playwright = self._require_playwright()
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=self.playwright_headless,
                args=["--disable-blink-features=AutomationControlled"],
                ignore_default_args=["--enable-automation"],
            )
            context = browser.new_context(
                user_agent=self.session.headers.get("User-Agent", ""),
                locale="en-US",
                accept_downloads=accept_downloads,
            )
            page = context.new_page()
            try:
                yield page
            finally:
                browser.close()

    def _goto_event_detail(self, page: Any, detail_url: str) -> None:
        """
        Load event details without ``networkidle`` — SPAs often never go idle and
        Playwright will sit until the timeout (feels stuck).
        """
        nav_timeout = max(15_000, min(90_000, self.timeout_seconds * 1000))
        page.goto(detail_url, wait_until="domcontentloaded", timeout=nav_timeout)
        page.wait_for_timeout(500)
        try:
            page.wait_for_selector("#main", timeout=min(20_000, nav_timeout))
        except Exception:
            pass
        # NLX/InFlight paints after #main exists; brief pause beats networkidle.
        page.wait_for_timeout(1_200)

    def _wait_for_detail_content_ready(self, page: Any) -> None:
        """
        Wait until NLX has filled real event data (not the template placeholders).
        Without this, #main often has only ~100–200 chars and buttons are missing.
        """
        deadline = min(45_000, max(12_000, int(self.timeout_seconds * 1000)))
        try:
            page.wait_for_function(
                """
                () => {
                    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
                    const nameEl = document.querySelector('[data-if-label="eventName"]');
                    const name = norm(nameEl ? nameEl.textContent : '');
                    if (name.length > 2 && name !== '[Event Title]') return true;
                    const main = document.querySelector('#main');
                    const mainText = norm(main ? main.innerText : '');
                    if (mainText.length > 200) return true;
                    return false;
                }
                """,
                timeout=deadline,
            )
        except Exception:
            pass
        page.wait_for_timeout(600)

    def _settle_after_view_event_package(self, page: Any) -> None:
        """Wait for Event Bid / View Attachments grid (not UNSPSC or other tables)."""
        page.wait_for_timeout(500)
        deadline = min(30_000, max(10_000, int(self.timeout_seconds * 1000)))
        try:
            page.wait_for_function(
                """
                () => {
                    const t = (document.body && document.body.innerText) || '';
                    if (/view(ing)? attachments|attached file/i.test(t)) return true;
                    const dl = document.querySelector('[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"]');
                    return !!(dl && dl.offsetParent !== null);
                }
                """,
                timeout=deadline,
            )
        except Exception:
            pass
        try:
            page.wait_for_selector(
                '[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"], tr[data-if-label="ViewAttachmentsTableRow"]',
                timeout=12_000,
            )
        except Exception:
            pass
        page.wait_for_timeout(800)

    def _wait_attachment_grid_hydrated(self, page: Any) -> None:
        """
        NLX fills the View Attachments grid asynchronously. View Source will not show
        row icons; Playwright only sees controls after this hydration (live DOM).
        Wait until at least one PS download control exists and is visible in any frame.
        """
        deadline = time.monotonic() + min(
            60_000, max(15_000, int(self.timeout_seconds * 1_500))
        ) / 1000
        sel = f'{PS_VIEW_ATTACH_DOWNLOAD_CTRLS}, table.table-results button:has(.fa-download)'
        while time.monotonic() < deadline:
            for frame in self._playwright_frames(page):
                try:
                    loc = frame.locator(sel)
                    n = loc.count()
                    for k in range(min(n, 32)):
                        try:
                            if loc.nth(k).is_visible():
                                return
                        except Exception:
                            continue
                except Exception:
                    pass
            try:
                page.wait_for_timeout(200)
            except Exception:
                break

    def _expand_attachment_pager_show_all(self, page: Any) -> None:
        """
        View Attachments uses a PeopleSoft grid pager (e.g. "1 of 7", "View All").
        Only the current page rows may exist until **View All** is clicked.
        """
        va_re = re.compile(r"^\s*view\s+all\s*$", re.I)
        for frame in self._playwright_frames(page):
            try:
                section = frame.locator('[data-if-label="viewEventAttachmentTable"]')
                if section.count() > 0:
                    root = section.first
                    try:
                        if root.is_visible():
                            link = root.locator("a").filter(has_text=va_re)
                            if link.count() > 0:
                                cand = link.first
                                if cand.is_visible():
                                    cand.click(timeout=12_000)
                                    page.wait_for_timeout(1_200)
                                    return
                    except Exception:
                        pass
                link = frame.locator("a[id*='AUC_ATTCH_HD_VW']").filter(has_text=va_re)
                if link.count() > 0:
                    cand = link.first
                    if cand.is_visible():
                        cand.click(timeout=12_000)
                        page.wait_for_timeout(1_200)
                        return
            except Exception:
                continue

    def _best_attachment_row_locator(self, frame: Any) -> Any:
        """
        Pick the row locator that actually contains view-grid download controls.
        The first non-empty ``tbody tr`` on the page is often the wrong table (or templates),
        which makes it look like "buttons are visible but none are clicked."
        """
        candidates = (
            frame.locator(
                '[data-if-label="viewEventAttachmentTable"] table.table-results tbody tr'
            ),
            frame.locator('table[id^="AUC_ATTCH_HD_VW"] tbody tr'),
            frame.locator('tr[id^="trAUC_ATTCH_HD_VW"]'),
            frame.locator('tr[data-if-label="ViewAttachmentsTableRow"]'),
            frame.locator("table.table-results tbody tr"),
        )
        ctrl_sel = PS_VIEW_ATTACH_DOWNLOAD_CTRLS
        best_loc: Any = None
        best_score = -1
        for loc in candidates:
            try:
                n = loc.count()
            except Exception:
                continue
            if n == 0:
                continue
            score = 0
            for i in range(min(n, 40)):
                try:
                    row = loc.nth(i)
                    if row.locator(ctrl_sel).count() > 0:
                        score += 1
                except Exception:
                    continue
            if score > best_score:
                best_score = score
                best_loc = loc
        if best_loc is not None and best_score > 0:
            return best_loc
        return frame.locator("table.table-results tbody tr")

    def _attachment_download_triggers_in_view_table(self, frame: Any) -> Any:
        """
        All download controls inside **View Attachments** only (excludes Add Attachments grid).
        Used when row iteration does not find scoped triggers (same-page NLX layouts).
        """
        scoped = (
            f'[data-if-label="viewEventAttachmentTable"] {PS_VIEW_ATTACH_DOWNLOAD_BTN}, '
            '[data-if-label="viewEventAttachmentTable"] '
            '[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"], '
            '[data-if-label="viewEventAttachmentTable"] '
            'button:has(.fa-download)'
        )
        loc = frame.locator(scoped)
        try:
            if loc.count() > 0:
                return loc
        except Exception:
            pass
        fallback = (
            f'table[id^="AUC_ATTCH_HD_VW"] {PS_VIEW_ATTACH_DOWNLOAD_BTN}, '
            'table[id^="AUC_ATTCH_HD_VW"] '
            '[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"], '
            'table[id^="AUC_ATTCH_HD_VW"] button:has(.fa-download)'
        )
        return frame.locator(fallback)

    def _download_attachments_via_scoped_triggers(
        self,
        page: Any,
        frame: Any,
        download_dir: str,
        max_files: int,
        already: int,
        ctx: Any,
        dl_timeout: int,
    ) -> List[DownloadedAttachment]:
        """Fallback: click each visible scoped download control in DOM order."""
        out: List[DownloadedAttachment] = []
        triggers = self._attachment_download_triggers_in_view_table(frame)
        try:
            n = triggers.count()
        except Exception:
            return out
        for i in range(min(n, max_files * 2)):
            if len(out) + already >= max_files:
                break
            trig = triggers.nth(i)
            try:
                if not trig.is_visible():
                    continue
            except Exception:
                continue
            try:
                if trig.evaluate(
                    """el => !!el.closest('[data-if-label="addNewAttachmentTable"]')"""
                ):
                    continue
            except Exception:
                pass
            display_name = f"attachment_{already + len(out)}"
            try:
                row = trig.locator("xpath=ancestor::tr[1]")
                if row.count() > 0:
                    fn = row.locator("[id^='PV_ATTACH_WRK_ATTACHUSERFILE']").first
                    if fn.count() > 0:
                        display_name = fn.inner_text(timeout=3_000).strip() or display_name
            except Exception:
                pass
            try:
                trig.scroll_into_view_if_needed(timeout=5_000)
                trig.evaluate(
                    """node => {
                        if (!node) return;
                        try { node.disabled = false; node.removeAttribute('disabled'); } catch (e) {}
                    }"""
                )
            except Exception:
                pass
            try:
                self._playwright_click_download_trigger(trig)
                got = self._complete_attachment_download_after_row_action(
                    ctx,
                    page,
                    display_name,
                    "",
                    download_dir,
                    already + len(out),
                    dl_timeout,
                )
                if got:
                    out.append(got)
            except Exception:
                continue
        return out

    @staticmethod
    def _playwright_click_download_trigger(trigger: Any) -> None:
        """
        NLX marks real PS actions with ``data-if-ps-clickable``; handlers are often
        delegated (jQuery/InFlight), so a single Playwright click may not run PeopleCode.
        Try Playwright, keyboard activation, physical mouse coordinates, then DOM/jQuery events.
        """
        try:
            trigger.click(timeout=15_000)
            return
        except Exception:
            pass
        try:
            trigger.click(timeout=15_000, force=True)
            return
        except Exception:
            pass
        try:
            trigger.focus(timeout=5_000)
            trigger.press("Enter", timeout=5_000)
            return
        except Exception:
            pass
        try:
            trigger.focus(timeout=5_000)
            trigger.press("Space", timeout=5_000)
            return
        except Exception:
            pass
        try:
            page = trigger.page
            box = trigger.bounding_box()
            if box is not None:
                x = box["x"] + box["width"] / 2
                y = box["y"] + box["height"] / 2
                page.mouse.move(x, y)
                page.mouse.click(x, y, delay=50)
                return
        except Exception:
            pass
        trigger.evaluate(
            r"""(el) => {
                if (!el) return;
                try { el.disabled = false; el.removeAttribute('disabled'); } catch (e) {}
                const r = el.getBoundingClientRect();
                const cx = Math.floor(r.left + r.width / 2);
                const cy = Math.floor(r.top + r.height / 2);
                const base = {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    view: window,
                    clientX: cx,
                    clientY: cy,
                    button: 0,
                    buttons: 1,
                };
                try {
                    el.dispatchEvent(
                        new PointerEvent('pointerdown', Object.assign({}, base, {
                            pointerId: 1,
                            pointerType: 'mouse',
                        }))
                    );
                } catch (e) {}
                el.dispatchEvent(new MouseEvent('mousedown', base));
                el.dispatchEvent(new MouseEvent('mouseup', base));
                try {
                    el.dispatchEvent(
                        new PointerEvent('pointerup', Object.assign({}, base, {
                            pointerId: 1,
                            pointerType: 'mouse',
                        }))
                    );
                } catch (e) {}
                el.dispatchEvent(new MouseEvent('click', base));
                if (typeof window.jQuery !== 'undefined') {
                    try {
                        window.jQuery(el).trigger('mousedown').trigger('mouseup').trigger('click');
                    } catch (e2) {}
                }
                try {
                    el.click();
                } catch (e3) {}
            }"""
        )

    def _extract_event_details_text_from_page(self, page: Any) -> str:
        """Step 3: visible text from the rendered Event Details view (all frames)."""
        blocks: List[str] = []
        for frame in self._playwright_frames(page):
            main = frame.locator("#main")
            if main.count() == 0:
                continue
            try:
                txt = main.first.inner_text(timeout=15_000).strip()
                if txt and txt not in blocks:
                    blocks.append(txt)
            except Exception:
                continue
        if not blocks:
            try:
                body = page.inner_text("body").strip()
                if body:
                    blocks.append(body)
            except Exception:
                pass
        return "\n\n".join(b for b in blocks if b)

    def scrape_event_details_text(self, detail_url: str) -> str:
        """
        Step 3: scrape all visible information from the Event Details page into one string.
        Uses a browser because the page is JS-rendered.
        """
        with self._playwright_page(accept_downloads=False) as page:
            self._goto_event_detail(page, detail_url)
            self._wait_for_detail_content_ready(page)
            return self._extract_event_details_text_from_page(page)

    def _click_view_event_package(self, page: Any) -> Optional[Any]:
        """
        Step 4: open the Event Package (attachments) view.
        Returns the Playwright ``Page`` to use next (popup tab if one opens, else ``page``),
        or ``None`` if the control was not found or click failed.
        """
        ctx = page.context
        n_pages_before = len(ctx.pages)

        for frame in self._playwright_frames(page):
            for sel in (
                '[data-if-label="viewPackage"]',
                "#RESP_INQ_DL0_WK_AUC_DOWNLOAD_PB",
                "button:has-text('View Event Package')",
                "a:has-text('View Event Package')",
            ):
                try:
                    loc = frame.locator(sel).first
                    if loc.count() == 0:
                        continue
                    try:
                        loc.scroll_into_view_if_needed(timeout=5_000)
                    except Exception:
                        pass
                    if not sel.startswith("button:") and not sel.startswith("a:"):
                        frame.evaluate(
                            """(s) => {
                                const el = document.querySelector(s);
                                if (!el) return;
                                try { el.disabled = false; el.removeAttribute('disabled'); } catch (e) {}
                            }""",
                            sel,
                        )
                    loc.click(timeout=15_000)
                    page.wait_for_timeout(1_500)
                    pages = ctx.pages
                    if len(pages) > n_pages_before:
                        new_page = pages[-1]
                        try:
                            new_page.wait_for_load_state("domcontentloaded", timeout=45_000)
                        except Exception:
                            pass
                        return new_page
                    return page
                except Exception:
                    continue
        return None

    def _click_download_attachment_confirm_button(self, page: Any) -> None:
        """
        After the grid icon (``ViewAttachmentsView``), NLX shows a confirm dialog.
        Click the **first visible** primary action whose accessible name matches
        **Download Attachment** — no ``expect_download``, no dialog-shell heuristics.
        """
        name_re = re.compile(r"download\s+attachment", re.I)
        deadline = time.monotonic() + min(
            45_000, max(8_000, int(self.timeout_seconds * 1_200))
        ) / 1000
        while time.monotonic() < deadline:
            for frame in self._playwright_frames(page):
                for locator in (
                    frame.get_by_role("button", name=name_re),
                    frame.locator("button").filter(has_text=name_re),
                    frame.locator("a").filter(has_text=name_re),
                ):
                    try:
                        n = locator.count()
                    except Exception:
                        continue
                    for j in range(n):
                        cand = locator.nth(j)
                        try:
                            if not cand.is_visible():
                                continue
                            cand.scroll_into_view_if_needed(timeout=3_000)
                            cand.click(timeout=15_000)
                            return
                        except Exception:
                            continue
            try:
                page.wait_for_timeout(120)
            except Exception:
                break

    def _save_opened_tab_as_attachment_file(
        self,
        context: Any,
        new_page: Any,
        target_path: str,
        display_name: str,
    ) -> str:
        """
        Portal opens many IFBs in a **new tab**; Chromium may not emit a ``Download`` object.
        Read ``http(s)`` or ``blob:`` from that tab and write to ``target_path``.
        Returns the path actually written (may add extension or use Content-Disposition name).
        """
        nav_timeout = min(90_000, max(25_000, int(self.timeout_seconds * 2_500)))
        try:
            new_page.wait_for_load_state("domcontentloaded", timeout=nav_timeout)
        except Exception:
            pass
        try:
            new_page.wait_for_load_state("load", timeout=min(60_000, nav_timeout))
        except Exception:
            pass
        try:
            new_page.wait_for_function(
                """() => {
                    const u = location.href || '';
                    return u && u !== 'about:blank' && !u.startsWith('chrome://newtab');
                }""",
                timeout=min(45_000, nav_timeout),
            )
        except Exception:
            pass

        url = ""
        try:
            url = new_page.url or ""
        except Exception:
            pass
        body: bytes = b""
        content_type = ""
        fname_hint: Optional[str] = None

        if url.startswith("blob:"):
            arr = new_page.evaluate(
                """async () => {
                    const r = await fetch(location.href);
                    const buf = await r.arrayBuffer();
                    return Array.from(new Uint8Array(buf));
                }"""
            )
            body = bytes(arr)
        elif url.startswith("http://") or url.startswith("https://"):
            body, content_type, fname_hint = self._fetch_attachment_bytes_for_tab_url(
                context, new_page, url, nav_timeout
            )
        else:
            raise RuntimeError(f"unsupported attachment tab URL after confirm: {url!r}")

        out_path = target_path
        if fname_hint:
            base = re.sub(r"[^\w.\-]+", "_", os.path.basename(fname_hint)).strip("._")
            if base:
                out_path = os.path.join(os.path.dirname(target_path), base)
        elif not os.path.splitext(out_path)[1]:
            if content_type == "application/pdf" or "pdf" in content_type:
                out_path = out_path + ".pdf"

        parent = os.path.dirname(out_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(body)
        if not body:
            raise RuntimeError(f"saved empty body for {out_path!r} (url={url!r})")
        return out_path

    def _fetch_attachment_bytes_for_tab_url(
        self,
        context: Any,
        new_page: Any,
        url: str,
        nav_timeout: int,
    ) -> Tuple[bytes, str, Optional[str]]:
        """
        The attachment tab uses the user's session cookies. Prefer ``Page.request`` (cookie
        jar tied to the tab), then in-page ``fetch`` (credentials: 'include'), then plain
        ``context.request`` as a last resort.
        """
        last_exc: Optional[Exception] = None
        req = getattr(new_page, "request", None)
        if req is not None:
            try:
                resp = req.get(url, timeout=nav_timeout)
                if resp.status < 400:
                    ct = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
                    cd = resp.headers.get("content-disposition") or resp.headers.get(
                        "Content-Disposition"
                    )
                    return resp.body(), ct, _filename_from_content_disposition(cd)
            except Exception as exc:
                last_exc = exc
        try:
            meta = new_page.evaluate(
                """async (u) => {
                    const r = await fetch(u, { credentials: 'include' });
                    const ct = (r.headers.get('content-type') || '').split(';')[0]
                        .trim().toLowerCase();
                    const cd = r.headers.get('content-disposition') || '';
                    if (!r.ok) throw new Error('fetch HTTP ' + r.status);
                    const buf = await r.arrayBuffer();
                    return {
                        bytes: Array.from(new Uint8Array(buf)),
                        ct: ct,
                        cd: cd,
                    };
                }""",
                url,
            )
            return (
                bytes(meta["bytes"]),
                (meta.get("ct") or "").strip().lower(),
                _filename_from_content_disposition(meta.get("cd")),
            )
        except Exception as exc:
            last_exc = exc
        resp = context.request.get(url, timeout=nav_timeout)
        if resp.status >= 400:
            raise RuntimeError(
                f"attachment fetch failed: HTTP {resp.status} for {url[:160]!r}"
            ) from last_exc
        ct = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
        cd = resp.headers.get("content-disposition") or resp.headers.get(
            "Content-Disposition"
        )
        return resp.body(), ct, _filename_from_content_disposition(cd)

    def count_view_attachment_download_slots(self, page: Any) -> int:
        """
        Number of **visible** row download controls in the View Attachments grid.
        Uses ``[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"]`` only (not the max across selectors,
        which could count an extra hidden NLX template and yield 8 instead of 7).
        """
        best = 0
        for frame in self._playwright_frames(page):
            for scope in (
                '[data-if-label="viewEventAttachmentTable"]',
                'table[id^="AUC_ATTCH_HD_VW"]',
            ):
                loc = frame.locator(f'{scope} [id^="PV_ATTACH_WRK_SCM_DOWNLOAD"]')
                try:
                    n = loc.count()
                except Exception:
                    continue
                visible = 0
                for i in range(min(n, 64)):
                    try:
                        if loc.nth(i).is_visible():
                            visible += 1
                    except Exception:
                        continue
                if visible > best:
                    best = visible
        return best

    def _complete_attachment_download_after_row_action(
        self,
        context: Any,
        page: Any,
        display_name: str,
        desc: str,
        download_dir: str,
        file_index: int,
        dl_timeout: int,
    ) -> Optional[DownloadedAttachment]:
        """
        Grid icon is already clicked (modal visible). Click the **Download Attachment**
        confirm, then capture bytes from the **new tab** (``expect_page`` + HTTP/blob).
        """
        safe = re.sub(r"[^\w.\-]+", "_", display_name).strip("._") or f"file_{file_index}"
        if not os.path.splitext(safe)[1]:
            safe = f"{safe}.pdf"
        target = os.path.join(download_dir, safe)
        if os.path.exists(target):
            base, ext = os.path.splitext(safe)
            target = os.path.join(download_dir, f"{base}_{file_index}{ext}")

        new_page = None
        try:
            with context.expect_page(timeout=dl_timeout) as new_page_info:
                self._click_download_attachment_confirm_button(page)
            new_page = new_page_info.value
            written = self._save_opened_tab_as_attachment_file(
                context, new_page, target, display_name
            )
            return DownloadedAttachment(
                local_path=written,
                attached_file_name=display_name,
                attachment_description=desc,
            )
        except Exception:
            return None
        finally:
            if new_page is not None:
                try:
                    new_page.close()
                except Exception:
                    pass

    def _download_attachment_rows(
        self,
        page: Any,
        download_dir: str,
        max_files: int,
    ) -> List[DownloadedAttachment]:
        """
        Download up to max_files attachments. Cal eProcure Event Package uses PeopleSoft
        rows ``tr[data-if-label="ViewAttachmentsTableRow"]`` with **buttons**
        ``[data-if-label="ViewAttachmentsView"]`` / ``[id^='PV_ATTACH_WRK_SCM_DOWNLOAD']``
        (not ``<a href>`` links). Many events show a **Download Attachment** modal; the file
        is often opened in a **new tab** (handled via ``expect_page`` + HTTP/blob save).
        """
        downloaded: List[DownloadedAttachment] = []
        header_re = re.compile(
            r"^(attached file|attachment description|file name|download|actions)\s*$",
            re.IGNORECASE,
        )
        ctx = page.context
        dl_timeout = min(120_000, max(25_000, self.timeout_seconds * 3_000))

        def _download_btn_for_row(row: Any) -> Any:
            # Matches NLX output: button[data-if-label=ViewAttachmentsView], id PV_ATTACH_WRK_SCM_DOWNLOAD$n.
            # Upload sibling uses ViewAttachmentsUpload / ATTACHRFXADD and often .if-hide.
            selectors = (
                PS_VIEW_ATTACH_DOWNLOAD_BTN,
                '[data-if-label="ViewAttachmentsView"]:not(.if-hide)',
                '[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"]',
                'input[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"]',
                'a[id^="PV_ATTACH_WRK_SCM_DOWNLOAD"]',
                'button:has(.fa-download)',
            )
            for sel in selectors:
                loc = row.locator(sel).first
                if loc.count() == 0:
                    continue
                if sel == "button:has(.fa-download)" and row.locator(
                    '[id^="ATTACHRFXADD"]'
                ).count() > 0:
                    continue
                return loc
            return None

        self._wait_attachment_grid_hydrated(page)
        self._expand_attachment_pager_show_all(page)
        self._wait_attachment_grid_hydrated(page)

        slot_cap = self.count_view_attachment_download_slots(page)
        effective_max = min(max_files, slot_cap) if slot_cap > 0 else max_files

        for frame in self._playwright_frames(page):
            row_iter = self._best_attachment_row_locator(frame)
            n = row_iter.count()
            if n == 0:
                continue

            for i in range(n):
                if len(downloaded) >= effective_max:
                    return downloaded
                row = row_iter.nth(i)
                try:
                    if row.locator("th").count() > 0:
                        continue
                except Exception:
                    pass
                name, desc = "", ""
                try:
                    name_el = row.locator(
                        '[data-if-label="ViewAttachFileName"], '
                        '[id^="PV_ATTACH_WRK_ATTACHUSERFILE"]'
                    ).first
                    if name_el.count() > 0:
                        name = name_el.inner_text(timeout=4_000).strip()
                except Exception:
                    pass
                try:
                    desc_el = row.locator(
                        '[data-if-label="ViewAttachDescriptSpan"], '
                        'span[id^="PV_ATTACH_WRK_ATTACH_DESCR"]'
                    ).first
                    if desc_el.count() > 0:
                        desc = desc_el.inner_text(timeout=4_000).strip()
                except Exception:
                    pass

                trigger = _download_btn_for_row(row)
                if trigger is None or trigger.count() == 0:
                    continue

                if header_re.match(name):
                    continue
                if not name and not desc:
                    # Dynamic rows may omit mirrored text; still download if the control exists.
                    pass

                try:
                    trigger.scroll_into_view_if_needed(timeout=5_000)
                except Exception:
                    pass
                try:
                    trigger.evaluate(
                        """node => {
                            if (!node) return;
                            try { node.disabled = false; node.removeAttribute('disabled'); } catch (e) {}
                        }"""
                    )
                except Exception:
                    pass

                display_name = name or f"attachment_{len(downloaded)}"
                try:
                    self._playwright_click_download_trigger(trigger)
                    got = self._complete_attachment_download_after_row_action(
                        ctx,
                        page,
                        display_name,
                        desc,
                        download_dir,
                        len(downloaded),
                        dl_timeout,
                    )
                    if got:
                        downloaded.append(got)
                except Exception:
                    continue

        if len(downloaded) == 0:
            for frame in self._playwright_frames(page):
                extra = self._download_attachments_via_scoped_triggers(
                    page,
                    frame,
                    download_dir,
                    effective_max,
                    len(downloaded),
                    ctx,
                    dl_timeout,
                )
                downloaded.extend(extra)
                if len(downloaded) >= effective_max:
                    break
        return downloaded

    def download_event_package_attachments(
        self,
        detail_url: str,
        download_dir: str,
        max_files: int = 10,
    ) -> List[DownloadedAttachment]:
        """
        Step 4: from Event Details, click View Event Package, then download up to ``max_files``
        attachments (or all available if fewer). Records Attached File and Attachment Description
        column text for each saved file.
        """
        os.makedirs(download_dir, exist_ok=True)
        with self._playwright_page(accept_downloads=True) as page:
            self._goto_event_detail(page, detail_url)
            self._wait_for_detail_content_ready(page)
            attach_page = self._click_view_event_package(page)
            if attach_page is None:
                return []
            self._settle_after_view_event_package(attach_page)
            return self._download_attachment_rows(attach_page, download_dir, max_files)

    def run_steps_3_and_4(
        self,
        detail_url: str,
        download_dir: str,
        max_attachments: int = 10,
    ) -> Tuple[str, List[DownloadedAttachment]]:
        """
        One browser session: Step 3 text scrape, then Step 4 attachment downloads.
        """
        os.makedirs(download_dir, exist_ok=True)
        with self._playwright_page(accept_downloads=True) as page:
            self._goto_event_detail(page, detail_url)
            self._wait_for_detail_content_ready(page)
            details_text = self._extract_event_details_text_from_page(page)
            attach_page = self._click_view_event_package(page)
            if attach_page is None:
                return details_text, []
            self._settle_after_view_event_package(attach_page)
            attachments = self._download_attachment_rows(
                attach_page, download_dir, max_attachments
            )
            return details_text, attachments

    # Try to fetch structured response payload for event detail pages
    # First attempts JSON endpoint variants, then falls back to embedded script extraction
    def _fetch_capture_results_payload(self, detail_url: str) -> Optional[Dict[str, Any]]:
        candidate_urls = [
            detail_url,
            f"{detail_url}&format=json" if "?" in detail_url else f"{detail_url}?format=json",
        ]

        for url in candidate_urls:
            try:
                response = self.session.get(
                    url,
                    timeout=self.timeout_seconds,
                    headers={"Accept": "application/json, text/plain, */*"},
                )
                if response.status_code >= 400:
                    continue
                content_type = response.headers.get("Content-Type", "").lower()
                if "application/json" in content_type:
                    payload = response.json()
                    capture_results = payload.get("CaptureResults")
                    if isinstance(capture_results, dict):
                        return capture_results
            except (requests.RequestException, ValueError, json.JSONDecodeError):
                continue

        return None

    # Three UNSPSC code extraction strategies:
    # (1) structured API payload
    # (2) embedded script JSON
    # (3) plain-text matching - heuristics
    def _extract_unspsc_with_strategy(self, detail_url: str) -> Tuple[List[UnspscCode], str]:
        capture_results = self._fetch_capture_results_payload(detail_url)
        if capture_results:
            codes = _extract_unspsc_from_capture_results(capture_results)
            if codes:
                return codes, "api_capture_results"

        detail_html = self.fetch_event_detail_html(detail_url)
        embedded_capture_results = _extract_embedded_capture_results_from_html(detail_html)
        if embedded_capture_results:
            codes = _extract_unspsc_from_capture_results(embedded_capture_results)
            if codes:
                return codes, "embedded_capture_results"

        merged = _merge_unspsc_lists(
            extract_unspsc_codes_from_unspsc_table(detail_html),
            extract_unspsc_codes(detail_html),
        )
        return merged, "text_fallback"

    def fuzzy_search_candidates(
        self,
        keywords: Optional[Iterable[str]] = None,
        fuzzy_threshold: float = 0.58,
        allow_browser_fallback: bool = True,
    ) -> List[SearchResult]:
        """Step 1: keyword search + fuzzy filter on Event Name."""
        words = list(keywords or DEFAULT_TECH_KEYWORDS)
        seen_urls = set()
        candidates: List[SearchResult] = []
        had_request_results = False

        for keyword in words:
            try:
                html = self.search_raw_html(keyword)
            except requests.RequestException:
                # Skip blocked/failed keyword so one error does not abort the whole run
                continue
            rows = parse_search_results(html)
            if rows:
                had_request_results = True
            for row in rows:
                if row.detail_url in seen_urls:
                    continue
                score = _best_keyword_similarity(row.event_name, words)
                if score < fuzzy_threshold:
                    continue
                seen_urls.add(row.detail_url)
                candidates.append(row)

        # If requests produced no rows, or this is a single-keyword query, also use the
        # browser so results match the live portal (requests are often incomplete).
        fallback_error: Optional[Exception] = None
        should_use_browser = allow_browser_fallback and (
            (not had_request_results) or (len(words) == 1)
        )
        if should_use_browser:
            for keyword in words:
                try:
                    html = self._search_with_browser_html(keyword)
                except Exception:
                    # Keep trying other keywords, but remember the first failure so callers get useful debugging info
                    if fallback_error is None:
                        fallback_error = Exception(
                            f"Browser fallback failed for keyword '{keyword}'."
                        )
                    continue
                rows = parse_search_results(html)
                for row in rows:
                    if row.detail_url in seen_urls:
                        continue
                    seen_urls.add(row.detail_url)
                    candidates.append(row)

        if not candidates and fallback_error:
            raise RuntimeError(str(fallback_error))

        return candidates

    def unspsc_filter_search(
        self,
        candidates: Iterable[SearchResult],
        include_probe_metadata: bool = True,
    ) -> List[FilteredEvent]:
        """Step 2: keep only candidates with tech-related UNSPSC classifications."""
        filtered: List[FilteredEvent] = []
        for result in candidates:
            unspsc_codes, strategy = self._extract_unspsc_with_strategy(result.detail_url)
            relevant_codes = [
                code for code in unspsc_codes if is_tech_unspsc(code.code, code.description)
            ]
            if relevant_codes:
                filtered.append(
                    FilteredEvent(
                        result=result,
                        unspsc_codes=relevant_codes,
                        extraction_strategy=(strategy if include_probe_metadata else "unspecified"),
                    )
                )
        return filtered

    def run_search(
        self,
        keywords: Optional[Iterable[str]] = None,
        fuzzy_threshold: float = 0.58,
    ) -> List[FilteredEvent]:
        candidates = self.fuzzy_search_candidates(
            keywords=keywords,
            fuzzy_threshold=fuzzy_threshold,
        )
        return self.unspsc_filter_search(candidates)
