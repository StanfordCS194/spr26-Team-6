"""
This file provides a interface for interacting with CaleProcure
It is used to search for technology-related contracts

Step 1: search events by technology keywords
Step 2: open each candidate result and keep only events whose UNSPSC codes match tech prefixes
Step 3: scrape Event Details page text
Step 4: View Event Package and download up to 10 attachments.
Step 5: upload PDFs to Google Drive 
Step 6: write to JSON.

See tests/test_caleprocure.py for unit tests.
CLI: from repo root ``python -m scraper.caleprocure_interface``.
"""

from __future__ import annotations
from contextlib import contextmanager
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import unquote, urljoin
import argparse
import os
import sys
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

# Default folder for saved pdfs before Google Drive upload (created on demand).
DEFAULT_PDFS_FOR_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "pdfs_for_upload"
)

# Tech/IT/telecommunications keywords for portal search
DEFAULT_TECH_KEYWORDS = [
    # "software",
    # "hardware",
    "computer",
    # "server",
    # "cloud",
    # "cybersecurity",
    # "network",
    # "telecommunications",
    # "data center",
    # "it support",
    "database"
    # "ai",
    # "machine learning",
    # "laptop",
    # "desktop",
    # "devops",
    # "mainframe",
    # "encryption",
    # "firewall",
    # "data"
    # "firmware",
    # "microservices"
]

# Conservative UNSPSC families frequently used for technology procurement
# See: https://www.ungm.org/public/unspsc 
# For UNSPSC-based relevance filtering
TECH_UNSPSC_PREFIXES = (
    "43",       # Information technology broadcasting and telecommunications
    "80101507", # Information technology consulation services
    "8111",     # Profession engineering services: computer services
    "8116",     # Profession engineering services: information technology service delivery
    "8311",     # Telecommunications media services   
    "831216",   # Information services: information centers
    "831217",   # Information services: mass communication services
                # Note: 831215 is Information services: libraries
)

# Data classes for CaleProcure search results, UNSPSC codes, and downloaded PDFs
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
class DownloadedAttachment:
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

# Lowercase a string and change all whitespace to single spaces for consistency
def _normalize(value: str) -> str:
    return " ".join(value.lower().split())

# Heuristic guard for NLX template placeholders to prevent scraping before hydration
def _looks_like_placeholder_detail_text(text: str) -> bool:
    n = _normalize(text or "")
    if not n:
        return True
    markers = (
        "[event title]",
        "[detail description]",
        "loading...",
        "[contact",
        "[email]",
        "[phone]",
        "[pre bid conference]",
        "[mandatory]",
        "[01/01/2001]",
        "[12:00 am]",
    )
    return any(m in n for m in markers)

# Extracts the event ID from the event name or URL
def _extract_external_id(event_name: str, detail_url: str) -> Optional[str]:
    # Prefer the last URL path segment
    try:
        tail = (detail_url or "").rstrip("/").split("/")[-1]
        if "?" in tail:
            tail = tail.split("?", 1)[0]
        if "#" in tail:
            tail = tail.split("#", 1)[0]
        tail = tail.strip()
        if tail:
            return tail
    except Exception:
        pass

    # Fallback: extract an ID-like token from the event name
    for token in (event_name or "").split():
        t = token.strip().strip("()[]{}:,-")
        if len(t) >= 6 and re.match(r"^[A-Za-z0-9]+$", t):
            return t

    return None

# Returns the likelyfilename of a file
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

# Determines if a UNSPSC code is relevant by checking against TECH_UNSPSC_PREFIXES
def is_tech_unspsc(code: str, description: str) -> bool:
    compact = "".join(ch for ch in code if ch.isdigit())
    return any(compact.startswith(prefix) for prefix in TECH_UNSPSC_PREFIXES)

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

# Reads UNSPSC rows from Event Details table cells
class _UnspscDetailTableParser(HTMLParser):
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

# Class that interfaces with CaleProcure to scrape events (contracts)
# and keep those with tech-related UNSPSC codes.
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

    # Takes an existing Playwright page, opens event search, and submits keyword
    def _browser_run_search_on_page(self, page: Any, keyword: str) -> None:
        page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=45_000)
        page.wait_for_timeout(2_000)

        try:
            cscr_link = page.locator("a:has-text('Find Bid Opportunities (CSCR)')").first
            if cscr_link.count() == 0:
                cscr_link = page.locator("a[href*='event-search.aspx']").first
            if cscr_link.count() > 0:
                cscr_link.click(timeout=10_000)
                try:
                    page.wait_for_selector("#RESP_INQA_WK_ZZ_AUC_NAME", timeout=25_000)
                except Exception:
                    pass
                page.wait_for_timeout(1_000)
        except Exception:
            pass

        frames = [page.main_frame] + [f for f in page.frames if f != page.main_frame]
        specific_input_id = "#RESP_INQA_WK_ZZ_AUC_NAME"
        specific_search_button_id = "#RESP_INQA_WK_INQ_AUC_GO_PB"

        filled = False
        for frame in frames:
            try:
                if frame.locator(specific_input_id).count() > 0:
                    frame.evaluate(
                        """(sel, val) => {
                            const el = document.querySelector(sel);
                            if (!el) return false;
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

        if not filled:
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
            raise RuntimeError("Could not find a search input field on Cal eProcure page.")

        clicked = False
        for frame in frames:
            try:
                if frame.locator(specific_search_button_id).count() > 0:
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

        try:
            page.wait_for_selector("table tbody tr, tbody.clickable tr", timeout=20_000)
        except Exception:
            pass
        page.wait_for_timeout(1_500)

    @staticmethod
    def _harvest_playwright_page_html(page: Any) -> str:
        """Main document plus iframe bodies (Cal eProcure often renders the grid in a frame)."""
        frames = [page.main_frame] + [f for f in page.frames if f != page.main_frame]
        content = page.content()
        for frame in frames[1:]:
            try:
                content += "\n<!-- FRAME CONTENT -->\n" + frame.content()
            except Exception:
                continue
        return content

    # Browser fallback for JS-render pages, using playwright
    def _search_with_browser_html(self, keyword: str, page: Optional[Any] = None) -> str:
        if page is not None:
            self._browser_run_search_on_page(page, keyword)
            return self._harvest_playwright_page_html(page)

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
            )
            pw_page = context.new_page()
            try:
                self._browser_run_search_on_page(pw_page, keyword)
                return self._harvest_playwright_page_html(pw_page)
            finally:
                browser.close()

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

    # Load event details without waiting for networkidle
    def _goto_event_detail(self, page: Any, detail_url: str) -> None:
        nav_timeout = max(15_000, min(90_000, self.timeout_seconds * 1000))
        page.goto(detail_url, wait_until="domcontentloaded", timeout=nav_timeout)
        page.wait_for_timeout(500)
        try:
            page.wait_for_selector("#main", timeout=min(20_000, nav_timeout))
        except Exception:
            pass
        
        # NLX/InFlight paints after #main exists; brief pause beats networkidle.
        page.wait_for_timeout(1_200)

    @staticmethod
    def _detail_url_tail(detail_url: str) -> str:
        tail = detail_url.rstrip("/").split("/")[-1]
        if "?" in tail:
            tail = tail.split("?", 1)[0]
        return tail

    def _click_opens_detail_page(
        self,
        context: Any,
        page: Any,
        target: Any,
        *,
        nav_timeout: int,
        click_timeout: int,
    ) -> Any:
        """
        Click a search-result control; return the Event Details ``Page`` (new tab or same tab).
        """
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

        url_pat = re.compile(r"/event/", re.I)
        try:
            with context.expect_page(timeout=nav_timeout) as new_pg:
                try:
                    target.scroll_into_view_if_needed(timeout=5_000)
                except Exception:
                    pass
                target.click(timeout=click_timeout)
            dp = new_pg.value
            try:
                dp.wait_for_load_state("domcontentloaded", timeout=nav_timeout)
            except Exception:
                pass
            return dp
        except PlaywrightTimeoutError:
            try:
                target.scroll_into_view_if_needed(timeout=5_000)
            except Exception:
                pass
            target.click(timeout=click_timeout, force=True)
            try:
                page.wait_for_url(url_pat, timeout=nav_timeout)
            except Exception:
                pass
            return page

    def _open_event_detail_from_search_results(
        self,
        page: Any,
        context: Any,
        detail_url: str,
        event_name: str,
    ) -> Optional[Any]:
        """
        On the search-results page, open Event Details the same way a user does: click Event Name
        (or row/link). Often opens a **new tab**; falls back to same-tab navigation.
        """
        tail = self._detail_url_tail(detail_url)
        nav_timeout = max(15_000, min(90_000, int(self.timeout_seconds * 1000)))
        click_timeout = min(30_000, nav_timeout)

        for frame in self._playwright_frames(page):
            for sel in (f'a[href*="{tail}"]', f'a[href*="/{tail}"]'):
                try:
                    loc = frame.locator(sel)
                    n = loc.count()
                    for i in range(min(n, 12)):
                        cand = loc.nth(i)
                        try:
                            if not cand.is_visible():
                                continue
                        except Exception:
                            continue
                        return self._click_opens_detail_page(
                            context,
                            page,
                            cand,
                            nav_timeout=nav_timeout,
                            click_timeout=click_timeout,
                        )
                except Exception:
                    continue

        if event_name.strip():
            frag = event_name.strip()[:72]
            esc = re.escape(frag) if len(frag) < 80 else re.escape(frag[:40])
            for frame in self._playwright_frames(page):
                try:
                    loc = frame.get_by_role("link", name=re.compile(esc, re.I))
                    n = loc.count()
                    for i in range(min(n, 8)):
                        cand = loc.nth(i)
                        try:
                            if not cand.is_visible():
                                continue
                        except Exception:
                            continue
                        return self._click_opens_detail_page(
                            context,
                            page,
                            cand,
                            nav_timeout=nav_timeout,
                            click_timeout=click_timeout,
                        )
                except Exception:
                    pass
                try:
                    cell = frame.locator('[data-if-label="tdEventName"]').filter(
                        has_text=re.compile(esc, re.I)
                    )
                    n = cell.count()
                    for i in range(min(n, 8)):
                        cand = cell.nth(i)
                        try:
                            if not cand.is_visible():
                                continue
                        except Exception:
                            continue
                        return self._click_opens_detail_page(
                            context,
                            page,
                            cand,
                            nav_timeout=nav_timeout,
                            click_timeout=click_timeout,
                        )
                except Exception:
                    pass
                try:
                    row = frame.locator("tbody.clickable tr").filter(
                        has_text=re.compile(re.escape(tail), re.I)
                    )
                    n = row.count()
                    for i in range(min(n, 8)):
                        cand = row.nth(i)
                        try:
                            if not cand.is_visible():
                                continue
                        except Exception:
                            continue
                        return self._click_opens_detail_page(
                            context,
                            page,
                            cand,
                            nav_timeout=nav_timeout,
                            click_timeout=click_timeout,
                        )
                except Exception:
                    pass

        return None

    def _wait_for_detail_content_ready(self, page: Any) -> None:
        """
        Wait until NLX has filled real event data in at least one visible frame.
        Raises ``TimeoutError`` if the page still looks like template placeholder content.
        """
        deadline_ms = min(50_000, max(14_000, int(self.timeout_seconds * 1_200)))
        deadline = time.monotonic() + (deadline_ms / 1000.0)
        last_observed = ""

        while time.monotonic() < deadline:
            for frame in self._playwright_frames(page):
                try:
                    snapshot = frame.evaluate(
                        """
                        () => {
                            const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
                            const nameEl = document.querySelector('[data-if-label="eventName"]');
                            const mainEl = document.querySelector('#main');
                            const bodyEl = document.body;
                            return {
                                name: norm(nameEl ? nameEl.textContent : ''),
                                main: norm(mainEl ? mainEl.innerText : ''),
                                body: norm(bodyEl ? bodyEl.innerText : ''),
                            };
                        }
                        """
                    )
                except Exception:
                    continue

                name = str(snapshot.get("name") or "")
                main = str(snapshot.get("main") or "")
                body = str(snapshot.get("body") or "")
                if len(main) > len(last_observed):
                    last_observed = main
                elif len(body) > len(last_observed):
                    last_observed = body

                # Strongest readiness signal: hydrated event title field.
                if name and len(name) >= 4 and not _looks_like_placeholder_detail_text(name):
                    page.wait_for_timeout(600)
                    return

                # Fallback: substantial details text with expected labels and no placeholders.
                main_low = main.lower()
                if (
                    len(main) >= 450
                    and not _looks_like_placeholder_detail_text(main)
                    and (
                        "view event package" in main_low
                        or "contact information" in main_low
                        or "description:" in main_low
                    )
                ):
                    page.wait_for_timeout(600)
                    return

            page.wait_for_timeout(250)

        sample = (last_observed or "")[:220]
        raise TimeoutError(
            "Event details page did not hydrate in time; placeholder/template text persisted. "
            f"Sample={sample!r}"
        )

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
            detail_page = self._open_detail_page_with_retry(
                page,
                page.context,
                detail_url,
                open_via_search_click=False,
            )
            return self._extract_event_details_text_from_page(detail_page)

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
        confirm, then capture either:
        - a direct Playwright ``Download`` event, or
        - a new tab (``expect_page`` + HTTP/blob save).
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
            # Some events trigger a browser download directly; others open a new tab.
            # Try direct download first to avoid long expect_page timeouts.
            try:
                with page.expect_download(timeout=min(dl_timeout, 45_000)) as dl_info:
                    self._click_download_attachment_confirm_button(page)
                dl = dl_info.value
                dl.save_as(target)
                return DownloadedAttachment(
                    local_path=target,
                    attached_file_name=display_name,
                    attachment_description=desc,
                )
            except Exception:
                pass

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
            detail_page = self._open_detail_page_with_retry(
                page,
                page.context,
                detail_url,
                open_via_search_click=False,
            )
            return self._download_attachments_from_detail_page(
                detail_page, download_dir, max_files
            )

    def _wait_for_unspsc_section_hydrated(self, page: Any) -> None:
        """
        Wait until the Event Details view has hydrated the UNSPSC section.
        Cal eProcure loads many tables asynchronously, and the UNSPSC grid can lag.
        """
        deadline = time.monotonic() + min(30.0, max(8.0, float(self.timeout_seconds) * 0.5))
        while time.monotonic() < deadline:
            for frame in self._playwright_frames(page):
                try:
                    txt = frame.evaluate("() => (document.body && document.body.innerText) || ''")
                    if txt and "UNSPSC" in txt:
                        return
                except Exception:
                    continue
            try:
                page.wait_for_timeout(250)
            except Exception:
                break

    def _extract_unspsc_from_rendered_detail_page(self, detail_page: Any) -> List[UnspscCode]:
        """
        Extract UNSPSC codes from the rendered Event Details DOM (Playwright).
        This avoids relying on non-JS HTTP responses, which are often blocked/incomplete.
        """
        self._wait_for_unspsc_section_hydrated(detail_page)
        detail_html = self._harvest_playwright_page_html(detail_page)
        # Be strict: only parse from the dedicated UNSPSC structures (table/capture payload).
        # Loose digit heuristics can accidentally treat dates like 01/01/2001 as UNSPSC.
        embedded = _extract_embedded_capture_results_from_html(detail_html)
        codes_from_capture = (
            _extract_unspsc_from_capture_results(embedded) if embedded else []
        )
        return _merge_unspsc_lists(
            extract_unspsc_codes_from_unspsc_table(detail_html),
            codes_from_capture,
        )

    def _open_detail_page_with_retry(
        self,
        page: Any,
        context: Any,
        detail_url: str,
        *,
        event_name: Optional[str] = None,
        event_external_id: Optional[str] = None,
        open_via_search_click: bool = True,
    ) -> Any:
        """
        Open Event Details and wait for hydration, retrying once with a fresh tab.
        """
        detail_page = page
        kw = ""
        kw_source = ""
        name_for_click = event_name or ""
        if open_via_search_click:
            if event_name and str(event_name).strip():
                kw = " ".join(str(event_name).split())
                kw_source = "event name"
            if not kw:
                kw = (event_external_id or "").strip()
                if kw:
                    kw_source = "event id"
            if not kw:
                kw = self._detail_url_tail(detail_url)
                if kw:
                    kw_source = "detail URL tail"
            if kw:
                print(f"    Step 2: search {kw_source} for {kw!r}", flush=True)
                self._browser_run_search_on_page(page, kw)
                opened = self._open_event_detail_from_search_results(
                    page, context, detail_url, name_for_click
                )
                if opened is not None:
                    detail_page = opened
                    mode = "new tab" if detail_page is not page else "same tab"
                    print(f"    Step 2: opened Event Details in {mode}", flush=True)
                else:
                    print(
                        "    Step 2: no matching search result; "
                        f"fallback goto {detail_url!r}",
                        flush=True,
                    )
                    self._goto_event_detail(page, detail_url)
                    detail_page = page
            else:
                print(f"    Step 2: no search term; direct navigation → {detail_url!r}", flush=True)
                self._goto_event_detail(page, detail_url)
                detail_page = page
        else:
            print(f"    Step 2: direct navigation → {detail_url!r}", flush=True)
            self._goto_event_detail(page, detail_url)
            detail_page = page

        try:
            self._wait_for_detail_content_ready(detail_page)
            return detail_page
        except TimeoutError:
            print("    Step 2: detail hydration timed out; retrying once with fresh tab", flush=True)
            try:
                if detail_page is not page:
                    detail_page.close()
            except Exception:
                pass
            retry_page = context.new_page()
            if open_via_search_click and kw:
                self._browser_run_search_on_page(retry_page, kw)
                opened = self._open_event_detail_from_search_results(
                    retry_page, context, detail_url, name_for_click
                )
                if opened is not None:
                    detail_page = opened
                else:
                    self._goto_event_detail(retry_page, detail_url)
                    detail_page = retry_page
            else:
                self._goto_event_detail(retry_page, detail_url)
                detail_page = retry_page
            self._wait_for_detail_content_ready(detail_page)
            return detail_page

    def _download_attachments_from_detail_page(
        self, detail_page: Any, download_dir: str, max_files: int
    ) -> List[DownloadedAttachment]:
        attach_page = self._click_view_event_package(detail_page)
        if attach_page is None:
            return []
        self._settle_after_view_event_package(attach_page)
        return self._download_attachment_rows(attach_page, download_dir, max_files)

    # Steps 2-4: (2) scrape all text, (3) check UNSPSC, and (4) download attachments if relevant
    def scrape_check_and_download(
        self,
        detail_url: str,
        download_dir: str,
        max_attachments: int = 10,
        *,
        event_name: Optional[str] = None,
        event_external_id: Optional[str] = None,
        open_via_search_click: bool = True,
    ) -> Tuple[Optional[str], Optional[List[DownloadedAttachment]], Optional[List[UnspscCode]]]:
        os.makedirs(download_dir, exist_ok=True)
        with self._playwright_page(accept_downloads=True) as page:
            detail_page = self._open_detail_page_with_retry(
                page,
                page.context,
                detail_url,
                event_name=event_name,
                event_external_id=event_external_id,
                open_via_search_click=open_via_search_click,
            )
            details_text = self._extract_event_details_text_from_page(detail_page)
            print(f"    Step 2: scraped {len(details_text)} chars", flush=True)

            unspsc_codes = self._extract_unspsc_from_rendered_detail_page(detail_page)
            parsed_codes = ", ".join(c.code for c in unspsc_codes) if unspsc_codes else "(none)"
            
            relevant = any(is_tech_unspsc(c.code, c.description) for c in unspsc_codes)
            if not relevant:
                print(f"    Step 3: early exit, no matching tech UNSPSC prefix: {parsed_codes}", flush=True)
                return None, None, None
            else:
                print(f"    Step 3: passed UNSPSC prefix match: {parsed_codes}", flush=True)

            attachments = self._download_attachments_from_detail_page(
                detail_page, download_dir, max_attachments
            )

            print(f"    Step 4: downloaded{len(attachments)} file(s)", flush=True)
            return details_text, attachments, unspsc_codes

    # Run each keyword in a Chromium session and merge and return the parsed rows
    def _accumulate_search_candidates(
        self,
        words: List[str],
        seen_urls: set,
        candidates: List[SearchResult],
    ) -> Optional[Exception]:
        fallback_error: Optional[Exception] = None
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
            )
            pw_page = context.new_page()
            try:
                for i, keyword in enumerate(words, 1):
                    print(
                        f"    Playwright {i}/{len(words)}: {keyword!r}",
                        flush=True,
                    )
                    n_before = len(candidates)
                    t0 = time.monotonic()
                    try:
                        html = self._search_with_browser_html(keyword, page=pw_page)
                    except Exception:
                        if fallback_error is None:
                            fallback_error = Exception(
                                f"Browser fallback failed for keyword '{keyword}'."
                            )
                        print(
                            f"    Playwright {i}/{len(words)}: FAILED {keyword!r}",
                            flush=True,
                        )
                        continue
                    rows = parse_search_results(html)
                    for row in rows:
                        if row.detail_url in seen_urls:
                            continue
                        seen_urls.add(row.detail_url)
                        candidates.append(row)
                    elapsed = time.monotonic() - t0
                    added = len(candidates) - n_before
                    print(
                        f"    Playwright {i}/{len(words)}: done in {elapsed:.1f}s, +{added} new candidate(s)",
                        flush=True,
                    )
            finally:
                browser.close()
        return fallback_error

    # Step 1: browser keyword search; candidates are filtered later by UNSPSC
    def fuzzy_search_candidates(
        self,
        keywords: Optional[Iterable[str]] = None,
    ) -> List[SearchResult]:
        words = list(keywords or DEFAULT_TECH_KEYWORDS)
        seen_urls = set()
        candidates: List[SearchResult] = []

        fallback_error: Optional[Exception] = None
        print(f"Step 1: conduct {len(words)} browser search(es)", flush=True)
        fallback_error = self._accumulate_search_candidates(words, seen_urls, candidates)

        if not candidates and fallback_error:
            raise RuntimeError(str(fallback_error))

        return candidates

    def finalize_pipeline_after_downloads(
        self,
        event_details_text: str,
        attachments: List[DownloadedAttachment],
        detail_url: str,
        *,
        download_dir: Optional[str] = None,
        data_raw_dir: Optional[str] = None,
        credentials_path: Optional[str] = None,
        token_path: Optional[str] = None,
        unspsc_codes_override: Optional[List[UnspscCode]] = None,
    ) -> str:
        """
        Upload every ``.pdf`` in ``download_dir`` to a Drive folder ``CaleProcure: {event_id}``
        via ``gdrive_interface.upload_pdfs_from_local_folder``, enrich document labels from
        ``attachments`` when basenames match, write JSON under ``data_raw/``, then remove
        local PDFs in ``download_dir`` only (Drive files are unchanged)

        Returns the absolute path to the written JSON file.
        """
        from scraper import gdrive_interface
        from scraper import caleprocure_json_generator as json_generator

        dl_dir = os.path.abspath(download_dir or DEFAULT_PDFS_FOR_UPLOAD_DIR)
        raw_dir = data_raw_dir or json_generator.DEFAULT_DATA_RAW_DIR

        ext_id = json_generator.external_id_from_detail_url(detail_url)
        folder_name = f"CaleProcure: {ext_id}"
        folder_id = gdrive_interface.create_drive_folder(
            folder_name,
            credentials_path=credentials_path,
            token_path=token_path,
        )

        by_basename: Dict[str, Tuple[str, str]] = {}
        for att in attachments:
            if not att.local_path:
                continue
            p = os.path.abspath(att.local_path)
            if not p.lower().endswith(".pdf") or not os.path.isfile(p):
                continue
            bn = os.path.basename(p)
            by_basename[bn] = (
                att.attached_file_name or bn,
                att.attachment_description or "",
            )

        uploads = gdrive_interface.upload_pdfs_from_local_folder(
            dl_dir,
            folder_id,
            credentials_path=credentials_path,
            token_path=token_path,
        )

        documents: List[Dict[str, Any]] = []
        for i, (basename, link) in enumerate(uploads):
            label, desc = by_basename.get(basename, (basename, ""))
            doc_type = "primary_spec" if i == 0 else "attachment"
            documents.append(
                {
                    "label": label,
                    "url": link,
                    "type": doc_type,
                    "attachment_description": desc,
                }
            )

        codes = list(unspsc_codes_override or [])
        unspsc_json = [{"code": c.code, "description": c.description} for c in codes]

        _payload, json_path = json_generator.run_step6_generate_raw_json(
            event_details_text,
            detail_url,
            documents,
            unspsc_json,
            data_raw_dir=raw_dir,
        )

        gdrive_interface.delete_local_files_in_folder(dl_dir)
        return json_path

def _existing_raw_external_ids(data_raw_dir: str) -> set:
    """Return the set of safe external_ids that already have data_raw/caleprocure_*.json files."""
    if not os.path.isdir(data_raw_dir):
        return set()
    out: set = set()
    prefix, suffix = "caleprocure_", ".json"
    for fname in os.listdir(data_raw_dir):
        if fname.startswith(prefix) and fname.endswith(suffix):
            out.add(fname[len(prefix):-len(suffix)])
    return out


# Command-line entry: always run full pipeline with default tech keywords
def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Cal eProcure search and scrape for IT contracts.")
    ap.add_argument(
        "--detail_url",
        nargs="?",
        help="Optional single event detail URL to process directly.",
    )

    ap.add_argument(
        "--headed",
        action="store_true",
        help="Show browser window when Playwright runs."
    )

    ap.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="HTTP/browser timeout in seconds (default: 60).",
    )

    ap.add_argument(
        "--max-attachments",
        type=int,
        default=10,
        help="Max attachment downloads per event in Step 4 (default: 10).",
    )

    ap.add_argument(
        "--skip-existing",
        dest="skip_existing",
        action="store_true",
        default=True,
        help="Skip events whose data_raw/caleprocure_<id>.json already exists (default).",
    )
    ap.add_argument(
        "--no-skip-existing",
        dest="skip_existing",
        action="store_false",
        help="Re-scrape and overwrite events even if a raw JSON already exists.",
    )

    args = ap.parse_args(argv)

    client = CalEProcureInterface(
        timeout_seconds=args.timeout,
        playwright_headless=not args.headed
    )

    from scraper import caleprocure_json_generator as json_generator
    from scraper import gdrive_interface

    single_detail_mode = bool(args.detail_url)
    if single_detail_mode:
        detail_url = args.detail_url.strip()
        ext = json_generator.external_id_from_detail_url(detail_url)
        candidates = [
            SearchResult(
                external_id=ext,
                event_name="Direct Detail URL",
                detail_url=detail_url,
            )
        ]
        print("\nStep 1 bypassed: using CLI detail URL.", flush=True)
    else:
        print(
            f"Combined run: {len(DEFAULT_TECH_KEYWORDS)} keywords {DEFAULT_TECH_KEYWORDS[:5]!r}",
            flush=True,
        )
        try:
            candidates = client.fuzzy_search_candidates(keywords=DEFAULT_TECH_KEYWORDS)
        except Exception as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        print(f"\nStep 1 done: {len(candidates)} candidate event(s) from keyword searches.", flush=True)

    if args.skip_existing and not single_detail_mode:
        raw_dir = os.path.abspath(json_generator.DEFAULT_DATA_RAW_DIR)
        already_scraped = _existing_raw_external_ids(raw_dir)
        filtered: List[SearchResult] = []
        skipped = 0
        for r in candidates:
            ext = r.external_id or json_generator.external_id_from_detail_url(r.detail_url)
            safe = re.sub(r"[^\w.\-]+", "_", ext or "").strip("._") or "event"
            if safe in already_scraped:
                skipped += 1
                continue
            filtered.append(r)
        if skipped:
            print(
                f"Dedup: skipping {skipped} candidate(s) already present in data_raw/.",
                flush=True,
            )
        candidates = filtered

    dl_root = os.path.abspath(DEFAULT_PDFS_FOR_UPLOAD_DIR)
    os.makedirs(dl_root, exist_ok=True)
    print(f"\nSteps 2-6: iterate through {len(candidates)} candidates.", flush=True)

    kept = 0
    for i, r in enumerate(candidates, 1):
        # Clear previous leftover PDFs before each contract
        gdrive_interface.delete_local_files_in_folder(dl_root)
        
        url = r.detail_url
        ext = r.external_id or json_generator.external_id_from_detail_url(url)
        safe = re.sub(r"[^\w.\-]+", "_", ext).strip("._") or "event"
        title_short = (r.event_name[:72]) if len(r.event_name) > 72 else r.event_name
        print(f"\n  → {i}/{len(candidates)} [{safe}] {title_short}", flush=True)
        
        try:
            details_text, attachments, unspsc_codes = client.scrape_check_and_download(
                url,
                dl_root,
                max_attachments=args.max_attachments,
                event_name=r.event_name,
                event_external_id=ext,
                open_via_search_click=not single_detail_mode,
            )
        except Exception as exc:
            print(f"    Steps 2-4 error: {exc}", flush=True)
            continue

        # Sentinel triple returned if irrelevant, so skip
        if details_text is None and attachments is None and unspsc_codes is None:
            continue
        else:
            kept += 1
        
        try:
            json_path = client.finalize_pipeline_after_downloads(
                details_text,
                attachments,
                url,
                download_dir=dl_root,
                unspsc_codes_override=unspsc_codes,
            )
            print(f"    Step 5-6 JSON: {json_path}", flush=True)
        except Exception as exc:
            print(f"    finalize error: {exc}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
