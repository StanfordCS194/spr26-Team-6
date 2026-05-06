"""
This file provides a interface for interacting with CaleProcure.
It is used to search for technology-related contracts.

Step 1: search events by technology keywords and fuzzy-match against Event Name.
Step 2: open each candidate result and scrape only those whose UNSPSC codes look technology-related.

See test/test_caleprocure.py for unit test.
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
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urljoin
import requests
import re
import json

SEARCH_URL = "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx"
EVENT_BASE_URL = "https://caleprocure.ca.gov/"
DEFAULT_SEARCH_BUSINESS_UNIT = "BS3"

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
    def __init__(self, timeout_seconds: int = 30) -> None:
        self.timeout_seconds = timeout_seconds
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
            browser = p.chromium.launch(headless=True)
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
                    page.wait_for_load_state("networkidle", timeout=45_000)
                    page.wait_for_timeout(2_000)
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

            # Let dynamic rendering complete and return rendered HTML
            page.wait_for_load_state("networkidle", timeout=30_000)
            page.wait_for_timeout(3_000)
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

        return extract_unspsc_codes(detail_html), "text_fallback"

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

        # If requests-based scraping produced no rows at all, try browser rendering
        fallback_error: Optional[Exception] = None
        if allow_browser_fallback and not had_request_results:
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
