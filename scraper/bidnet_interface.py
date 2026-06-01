"""
Interface for scraping BidNet Direct (California Purchasing Group) for
technology / IT / telecom solicitations.

BidNet aggregates open bids from 760+ California state & local agencies, but the
useful fields (issuing organization, solicitation number, description, documents,
category codes) are locked behind a *free* vendor login, so this scraper signs in
with Playwright before reading detail pages.

Step 1: log in with a free BidNet vendor account (BIDNET_USERNAME / BIDNET_PASSWORD).
Step 2: run a keyword search per tech/IT/telecom term and collect candidate
        solicitations from the public listing (title, dates, abstract URL).
Step 3: open each abstract page and extract the labeled fields + NIGP/commodity
        category codes + document links.
Step 4: keep only solicitations whose category codes (or, as a fallback, title +
        description) match the tech/IT/telecom patterns.
Step 5: write the normalized JSON payload to ``data_raw/bidnet_{id}.json``.

CLI: from repo root ``python -m scraper.bidnet_interface``.

NOTE: the authenticated detail-page DOM (where exactly category codes and document
links render once logged in) is tuned in ``_extract_detail_fields`` / the JS in
``_DETAIL_EXTRACT_JS``; verify those selectors against a live logged-in session.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from scraper import bidnet_json_generator as json_generator
from scraper import gdrive_interface

BASE_URL = "https://www.bidnetdirect.com"
OPEN_BIDS_PATH = "/california/solicitations/open-bids"
OPEN_BIDS_URL = urljoin(BASE_URL, OPEN_BIDS_PATH)
LOGIN_URL = urljoin(BASE_URL, "/public/authentication/login")

# BidNet splits open bids into two feeds:
#   AGGREGATE = "Statewide & Federal" bids  -> gated behind a PAID subscription
#   BUYER     = "Groups" bids posted directly by agencies -> FREE, full detail
# A free vendor account can read BUYER bids (issuing org, description, NIGP codes,
# documents) but AGGREGATE detail pages redirect to an "Upgrade to Access" paywall,
# so this scraper targets the free BUYER feed.
SELECTED_CONTENT = "BUYER"

# Tech / IT / telecom keywords driving the portal keyword search (Step 2).
DEFAULT_TECH_KEYWORDS: List[str] = [
    "software",
    "information technology",
    "computer",
    "network",
    "telecommunications",
    "cloud",
    "cybersecurity",
    "data center",
    "IT services",
    "managed services",
]

# Category-code relevance (Step 4). California BidNet bids are tagged with NIGP class
# codes (3-digit class, optionally a 5-digit subcode). These class prefixes confirm a
# tech/IT/telecom bid (verified live against real solicitations):
#   204/205/206/207/208/209 = computer hardware / software / accessories / supplies
#   725/726                  = radio communication & telecommunication equipment
#   915                      = communications & media related services
#   920                      = data processing, computer programming & software services
# NOTE: NIGP 880 is "Visual Education Equipment" (audio-visual), NOT telecom — excluded
# so AV line items on construction/renovation bids don't read as tech.
TECH_CATEGORY_CODE_PREFIXES: tuple[str, ...] = (
    "204", "205", "206", "207", "208", "209",
    "725", "726", "915", "920",
)

# Keyword fallback used when a detail page exposes no parseable category codes.
TECH_CATEGORY_KEYWORDS: tuple[str, ...] = (
    "software", "computer", "data processing", "information technology",
    "telecommunication", "telecom", "network", "cloud", "cyber",
    "hardware", "it services", "internet", "broadband", "fiber optic",
    "programming", "systems integration", "saas", "server", "database",
)


@dataclass
class SearchResult:
    """One solicitation row harvested from a search-results listing page."""

    external_id: str
    title: str
    detail_url: str
    publication_date: Optional[str] = None
    closing_date: Optional[str] = None


@dataclass
class DetailRecord:
    """Parsed detail page plus the metadata needed to build the JSON payload.

    ``document_links`` are the raw attachment links harvested from the Documents tab
    (``{"label", "url"}``); they are downloaded and turned into Drive-backed
    ``documents`` entries during finalization.
    """

    fields: Dict[str, Any] = field(default_factory=dict)
    document_links: List[Dict[str, str]] = field(default_factory=list)
    category_codes: List[Dict[str, str]] = field(default_factory=list)


@dataclass
class DownloadedDocument:
    """One attachment fetched from BidNet to local disk before Drive upload."""

    label: str
    source_url: str
    local_path: str
    extension: str
    size_bytes: int


# Default staging dir for downloaded attachments before Google Drive upload.
DEFAULT_FILES_FOR_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "bidnet_files_for_upload"
)
DEFAULT_MAX_ATTACHMENTS = 10


def _safe_filename(name: str) -> str:
    """Strip path separators / control chars from a server-provided filename."""
    cleaned = (name or "").replace("/", "_").replace("\\", "_").strip()
    cleaned = re.sub(r"[\x00-\x1f]+", "", cleaned)
    return cleaned[:240] or "attachment"


def _filename_from_content_disposition(header: Optional[str]) -> Optional[str]:
    """Pull a real filename out of a ``Content-Disposition`` header."""
    if not header:
        return None
    # RFC 5987 extended form first: filename*=UTF-8''quoted%20name.pdf
    m = re.search(r"filename\*\s*=\s*[^']*''([^;]+)", header, re.I)
    if m:
        from urllib.parse import unquote

        return _safe_filename(unquote(m.group(1).strip().strip('"')))
    m = re.search(r'filename\s*=\s*"?([^";]+)"?', header, re.I)
    if m:
        return _safe_filename(m.group(1).strip())
    return None


# JS run in the page context to pull the labeled mets-field pairs + H1 title from the
# default ("Notice") tab of a Groups bid detail page. Category codes and documents live
# on separate AJAX inner tabs and are harvested by clicking them (see _extract_*).
_DETAIL_EXTRACT_JS = r"""
() => {
  // textContent with <script>/<style> stripped (mets-field-body embeds a "See more"
  // dotdotdot script that would otherwise leak into the field value).
  const clean = (el) => {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('script, style').forEach((s) => s.remove());
    return c.textContent.replace(/\s+/g, ' ').replace(/\s*\.\.\.\s*See more\s*$/i, '').trim();
  };
  const fields = {};
  document.querySelectorAll('.mets-field, .mets-field-view').forEach((f) => {
    const label = clean(f.querySelector('.mets-field-label'));
    const body = clean(f.querySelector('.mets-field-body'));
    if (label) fields[label] = body;
  });
  const h1 = document.querySelector('h1');
  return { title: clean(h1), fields };
}
"""

# JS to read NIGP codes out of the Categories inner-tab panel once it has loaded.
# Rows look like "Next206 COMPUTER HARDWARE ..." (class) or
# "20654 Geographic Information Systems (GIS) Geographic Information Systems (GIS)"
# (subcode, description doubled). Returns raw "<code> <description>" strings.
_CATEGORIES_EXTRACT_JS = r"""
() => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('table tr, li').forEach((el) => {
    const t = el.textContent.replace(/\s+/g, ' ').trim().replace(/^Next/, '');
    if (/^\d{2,}\s+\S/.test(t) && t.length < 200 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  });
  return out;
}
"""

# JS to read attachment download anchors out of the Documents inner-tab panel.
_DOCS_EXTRACT_JS = r"""
() => {
  const out = [];
  document.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (/attachment-download|\/docs-items\/|\.pdf|\.docx?|\.xlsx?|\.zip/i.test(href)) {
      out.push({ label: a.textContent.replace(/\s+/g, ' ').trim(), href });
    }
  });
  return out;
}
"""


class BidNetInterface:
    def __init__(
        self,
        timeout_seconds: int = 60,
        *,
        playwright_headless: bool = True,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.playwright_headless = playwright_headless
        self.username = username or os.environ.get("BIDNET_USERNAME")
        self.password = password or os.environ.get("BIDNET_PASSWORD")
        self.user_agent = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )

    # ------------------------------------------------------------------ #
    # Playwright plumbing
    # ------------------------------------------------------------------ #
    @staticmethod
    def _require_playwright():
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError(
                "Playwright is required for the BidNet scraper. Install with "
                "`pip install playwright` and `python -m playwright install chromium`."
            ) from exc
        return sync_playwright

    def _login(self, page: Any) -> bool:
        """Sign in with the free vendor account. Returns True on apparent success."""
        if not self.username or not self.password:
            print(
                "    BidNet credentials missing: set BIDNET_USERNAME / BIDNET_PASSWORD "
                "in .env to unlock issuing org, description, and category codes.",
                flush=True,
            )
            return False

        page.goto(OPEN_BIDS_URL, wait_until="domcontentloaded", timeout=self.timeout_seconds * 1000)
        page.wait_for_timeout(1_500)

        # The login form lives in a collapsed header window; click the header login
        # button (#header_btnLogin) to reveal it. The submit button inside the window
        # is also labelled "Login", so target the header trigger by id explicitly.
        username_box = "#loginBox_j_username"
        for trigger in (
            "#header_btnLogin",
            "#mainHeader_btnLogin_mobile",
            "#loginLinkCustom",
        ):
            try:
                loc = page.locator(trigger).first
                if loc.count():
                    loc.click(timeout=5_000)
                    page.wait_for_timeout(800)
                    if page.locator(username_box).first.is_visible():
                        break
            except Exception:
                continue

        try:
            page.wait_for_selector(f"{username_box}:visible", timeout=8_000)
            page.fill(username_box, self.username, timeout=8_000)
            page.fill("#loginBox_j_password", self.password, timeout=8_000)
        except Exception:
            # Fall back to name-based selectors if the dialog ids differ.
            try:
                page.fill("input[name='j_username']", self.username, timeout=8_000)
                page.fill("input[name='j_password']", self.password, timeout=8_000)
            except Exception as exc:
                print(f"    Login form not found: {exc}", flush=True)
                return False

        for submit in ("#loginWindowButton", "button[type='submit']", "input[type='submit']"):
            try:
                btn = page.locator(submit).first
                if btn.count():
                    btn.click(timeout=8_000)
                    break
            except Exception:
                continue

        try:
            page.wait_for_load_state("networkidle", timeout=self.timeout_seconds * 1000)
        except Exception:
            page.wait_for_timeout(2_500)

        # Heuristic: a logged-in session shows a logout affordance.
        try:
            logged_in = (
                page.locator("a:has-text('Log Out'), a:has-text('Logout'), #logout").count() > 0
            )
        except Exception:
            logged_in = False
        if not logged_in:
            print(
                "    Warning: could not confirm BidNet login; detail fields may stay 'Locked'.",
                flush=True,
            )
        return logged_in

    # ------------------------------------------------------------------ #
    # Step 2: keyword search -> candidate listings
    # ------------------------------------------------------------------ #
    @staticmethod
    def _parse_listing(page: Any) -> List[SearchResult]:
        """Extract solicitation rows from a search-results listing page."""
        rows = page.evaluate(
            r"""
            () => {
              const out = [];
              document.querySelectorAll('a.solicitation-link').forEach((a) => {
                const href = a.getAttribute('href') || '';
                const row = a.closest('tr') || a.closest('.mets-table-row');
                const dv = row ? row.querySelectorAll('.date-value') : [];
                out.push({
                  href,
                  title: a.textContent.replace(/\s+/g, ' ').trim(),
                  published: dv[0] ? dv[0].textContent.trim() : null,
                  closing: dv[1] ? dv[1].textContent.trim() : null,
                });
              });
              return out;
            }
            """
        )
        results: List[SearchResult] = []
        for r in rows or []:
            href = r.get("href") or ""
            if not href:
                continue
            detail_url = urljoin(BASE_URL, href)
            results.append(
                SearchResult(
                    external_id=json_generator.external_id_from_detail_url(detail_url),
                    title=r.get("title") or "",
                    detail_url=detail_url,
                    publication_date=r.get("published"),
                    closing_date=r.get("closing"),
                )
            )
        return results

    def search_keyword(self, page: Any, keyword: str, max_pages: int = 3) -> List[SearchResult]:
        """Run one keyword search and page through up to ``max_pages`` of results."""
        collected: Dict[str, SearchResult] = {}
        from urllib.parse import quote_plus

        for page_no in range(1, max_pages + 1):
            page_seg = "" if page_no == 1 else f"/page{page_no}"
            url = (
                f"{OPEN_BIDS_URL}{page_seg}"
                f"?selectedContent={SELECTED_CONTENT}&keywords={quote_plus(keyword)}"
            )
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=self.timeout_seconds * 1000)
            except Exception as exc:
                print(f"    search '{keyword}' p{page_no} nav error: {exc}", flush=True)
                break
            try:
                page.wait_for_selector("a.solicitation-link", timeout=12_000)
            except Exception:
                break  # no (more) results
            page.wait_for_timeout(800)
            rows = self._parse_listing(page)
            if not rows:
                break
            new = 0
            for r in rows:
                if r.external_id not in collected:
                    collected[r.external_id] = r
                    new += 1
            if new == 0:  # same rows repeating -> stop paginating
                break
        return list(collected.values())

    def gather_candidates(
        self, page: Any, keywords: List[str], max_pages: int = 3
    ) -> List[SearchResult]:
        """Run all keyword searches and de-duplicate by external_id."""
        merged: Dict[str, SearchResult] = {}
        for kw in keywords:
            found = self.search_keyword(page, kw, max_pages=max_pages)
            print(f"  keyword {kw!r}: {len(found)} solicitation(s)", flush=True)
            for r in found:
                merged.setdefault(r.external_id, r)
        return list(merged.values())

    # ------------------------------------------------------------------ #
    # Step 3: detail page -> structured fields
    # ------------------------------------------------------------------ #
    # BidNet Groups-bid detail labels -> our payload field keys.
    _LABEL_MAP = {
        "issuing organization": "issuing_organization",
        "solicitation number": "solicitation_number",
        "title": "title",
        "description": "description",
        "source id": "source",
        # group bids label the publish date "Publication" (no "Date" suffix)
        "publication": "publication_date",
        "publication date": "publication_date",
        "closing date": "closing_date",
        "location": "location",
        "solicitation type": "solicitation_type",
    }

    def _extract_detail_fields(self, page: Any, candidate: SearchResult) -> DetailRecord:
        # Undo the "See more" dotdotdot truncation so the full description is in the DOM.
        try:
            page.evaluate(
                """() => {
                    try {
                        if (window.jQuery) {
                            jQuery('#descriptionText').trigger('destroy.dot');
                            jQuery('#descriptionText').removeClass('mets-ellipsis');
                        }
                    } catch (e) {}
                }"""
            )
            page.wait_for_timeout(200)
        except Exception:
            pass

        raw = page.evaluate(_DETAIL_EXTRACT_JS) or {}
        labeled = raw.get("fields") or {}

        fields: Dict[str, Any] = {"title": candidate.title}
        for label, value in labeled.items():
            key = self._LABEL_MAP.get(str(label).strip().lower())
            if key:
                fields[key] = value
        # Prefer the abstract H1 / labelled Title; fall back to the listing title.
        fields["title"] = fields.get("title") or raw.get("title") or candidate.title
        fields.setdefault("publication_date", candidate.publication_date)
        fields.setdefault("closing_date", candidate.closing_date)

        # Pull contact email/phone out of any contact-ish text on the page.
        contact_blob = " ".join(
            str(v) for k, v in labeled.items() if "contact" in str(k).lower()
        )
        email = re.search(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", contact_blob)
        phone = re.search(
            r"(?:\+?1[-.\s]?)?(?:\(\d{3}\)\s*|\d{3}[-.\s])\d{3}[-.\s]\d{4}", contact_blob
        )
        if email:
            fields["contact_email"] = email.group(0)
        if phone:
            fields["contact_phone"] = phone.group(0)

        category_codes = self._parse_category_codes(self._harvest_categories(page))
        document_links = self._harvest_document_links(page, candidate.detail_url)

        return DetailRecord(
            fields=fields,
            document_links=document_links,
            category_codes=category_codes,
        )

    def _click_inner_tab(self, page: Any, label: str) -> bool:
        """Click an AJAX inner tab (Categories / Documents)."""
        try:
            tab = page.locator(
                f"a[href*='innerTabId']:has-text('{label}')"
            ).first
            if tab.count() == 0:
                return False
            tab.click(timeout=8_000)
            return True
        except Exception:
            return False

    def _poll_eval(self, page: Any, js: str, attempts: int = 8, interval_ms: int = 600):
        """Re-run ``js`` until it returns a non-empty result or attempts run out.

        The inner tabs load via AJAX, so a fixed sleep is racy — poll instead.
        """
        result = []
        for _ in range(attempts):
            page.wait_for_timeout(interval_ms)
            try:
                result = page.evaluate(js) or []
            except Exception:
                result = []
            if result:
                return result
        return result

    def _harvest_categories(self, page: Any) -> List[str]:
        if not self._click_inner_tab(page, "Categories"):
            return []
        return self._poll_eval(page, _CATEGORIES_EXTRACT_JS)

    def _harvest_document_links(self, page: Any, detail_url: str) -> List[Dict[str, str]]:
        """Raw attachment links from the Documents tab ({label, url})."""
        if not self._click_inner_tab(page, "Documents"):
            return []
        # Many bids legitimately have no files, so don't burn the full poll budget.
        raw_docs = self._poll_eval(page, _DOCS_EXTRACT_JS, attempts=3)
        links: List[Dict[str, str]] = []
        seen = set()
        for d in raw_docs:
            href = d.get("href") or ""
            if not href:
                continue
            url = urljoin(detail_url, href)
            if url in seen:
                continue
            seen.add(url)
            links.append({"label": d.get("label") or href, "url": url})
        return links

    # ------------------------------------------------------------------ #
    # Step 5: download attachments + upload to Google Drive
    # ------------------------------------------------------------------ #
    def _download_documents(
        self,
        page: Any,
        document_links: List[Dict[str, str]],
        dest_dir: str,
        max_attachments: int,
    ) -> List[DownloadedDocument]:
        """Fetch each attachment to ``dest_dir`` via the logged-in request context."""
        os.makedirs(dest_dir, exist_ok=True)
        downloaded: List[DownloadedDocument] = []
        used_names: Dict[str, int] = {}
        for link in document_links[:max_attachments]:
            url = link.get("url") or ""
            if not url:
                continue
            try:
                resp = page.request.get(url, timeout=self.timeout_seconds * 1000)
                if not resp.ok:
                    print(f"    attachment fetch HTTP {resp.status}: {url}", flush=True)
                    continue
                body = resp.body()
            except Exception as exc:
                print(f"    attachment fetch failed ({url}): {exc}", flush=True)
                continue

            filename = (
                _filename_from_content_disposition(resp.headers.get("content-disposition"))
                or _safe_filename(link.get("label") or "")
                or "attachment"
            )
            unique = filename
            if unique in used_names:
                used_names[unique] += 1
                root, ext = os.path.splitext(filename)
                unique = f"{root}_{used_names[unique]}{ext}"
            else:
                used_names[unique] = 0

            local_path = os.path.join(dest_dir, unique)
            with open(local_path, "wb") as fh:
                fh.write(body)
            downloaded.append(
                DownloadedDocument(
                    label=link.get("label") or filename,
                    source_url=url,
                    local_path=local_path,
                    extension=os.path.splitext(filename)[1].lstrip(".").lower(),
                    size_bytes=len(body),
                )
            )
        return downloaded

    def _materialize_documents(
        self,
        downloaded: List[DownloadedDocument],
        external_id: str,
        download_dir: str,
        skip_drive_upload: bool,
    ) -> List[Dict[str, Any]]:
        """Upload downloaded files to a per-bid Drive folder and build the documents list.

        Mirrors the SAM.gov / Cal eProcure finalize step. When ``skip_drive_upload`` is
        set (or upload is impossible), records the BidNet source URL instead of a Drive
        link so the pipeline still runs (e.g. in CI without Google OAuth).
        """
        if not downloaded:
            return []

        if not skip_drive_upload:
            try:
                folder_id = gdrive_interface.create_drive_folder(
                    f"BidNet Direct: {external_id}"
                )
                uploads = gdrive_interface.upload_files_from_local_folder(
                    download_dir, folder_id
                )
                by_basename = {
                    os.path.basename(d.local_path): d for d in downloaded
                }
                documents: List[Dict[str, Any]] = []
                for i, (basename, link) in enumerate(uploads):
                    meta = by_basename.get(basename)
                    documents.append(
                        {
                            "label": meta.label if meta else basename,
                            "url": link,
                            "type": "primary_spec" if i == 0 else "attachment",
                            "original_extension": meta.extension if meta else
                            os.path.splitext(basename)[1].lstrip("."),
                            "size_bytes": meta.size_bytes if meta else None,
                            "source_url": meta.source_url if meta else None,
                        }
                    )
                return documents
            except Exception as exc:
                print(
                    f"    Drive upload failed ({exc}); recording source URLs instead.",
                    flush=True,
                )

        # Fallback: record the original BidNet attachment URLs.
        return [
            {
                "label": d.label,
                "url": d.source_url,
                "type": "primary_spec" if i == 0 else "attachment",
                "original_extension": d.extension,
                "size_bytes": d.size_bytes,
                "source_url": d.source_url,
            }
            for i, d in enumerate(downloaded)
        ]

    @staticmethod
    def _parse_category_codes(raw_categories: List[str]) -> List[Dict[str, str]]:
        """Normalize NIGP "<code> <description>" rows into code/description dicts.

        Handles the doubled-description quirk ("GIS GIS") by collapsing an exactly
        repeated tail.
        """
        codes: List[Dict[str, str]] = []
        seen = set()
        for entry in raw_categories:
            text = " ".join(str(entry).split())
            if not text:
                continue
            m = re.match(r"^([0-9][0-9\-]{1,12})\s*[-:]?\s*(.*)$", text)
            if not m:
                continue
            code, desc = m.group(1), m.group(2).strip()
            # Collapse "Foo Foo" -> "Foo" (BidNet renders the label twice).
            half = len(desc) // 2
            if desc and desc[:half].strip() == desc[half:].strip():
                desc = desc[:half].strip()
            key = (code, desc.lower())
            if key in seen:
                continue
            seen.add(key)
            codes.append({"code": code, "description": desc})
        return codes

    # ------------------------------------------------------------------ #
    # Step 4: tech/IT/telecom relevance
    # ------------------------------------------------------------------ #
    @staticmethod
    def is_tech_relevant(record: DetailRecord) -> bool:
        """Confirm a bid is tech/IT/telecom.

        Category codes are authoritative: when a bid is tagged with NIGP codes we judge
        purely on those (a tech-class prefix, or a tech keyword in the code's own
        description). Only when a page exposes *no* parseable codes do we fall back to a
        keyword scan of the title + description — otherwise noise like a behavioral-health
        bid mentioning a "provider network" would slip through.
        """
        if record.category_codes:
            # Judge purely on the curated NIGP class prefixes. Matching tech keywords
            # against the codes' own descriptions over-fires (e.g. "Computer/
            # Microprocessor" lighting controls on a theater-renovation bid).
            return any(
                (c.get("code") or "").replace("-", "").strip().startswith(p)
                for c in record.category_codes
                for p in TECH_CATEGORY_CODE_PREFIXES
            )
        # No category codes at all -> fall back to title + description keywords.
        haystack = " ".join(
            str(record.fields.get(k) or "") for k in ("title", "description")
        ).lower()
        return any(kw in haystack for kw in TECH_CATEGORY_KEYWORDS)

    # ------------------------------------------------------------------ #
    # Orchestration
    # ------------------------------------------------------------------ #
    def run(
        self,
        keywords: Optional[List[str]] = None,
        *,
        max_pages: int = 3,
        skip_existing: bool = True,
        single_detail_url: Optional[str] = None,
        data_raw_dir: Optional[str] = None,
        skip_drive_upload: bool = False,
        max_attachments: int = DEFAULT_MAX_ATTACHMENTS,
        download_dir: Optional[str] = None,
    ) -> int:
        keywords = keywords or DEFAULT_TECH_KEYWORDS
        raw_dir = os.path.abspath(data_raw_dir or json_generator.DEFAULT_DATA_RAW_DIR)
        already = _existing_raw_external_ids(raw_dir) if skip_existing else set()
        dl_root = os.path.abspath(download_dir or DEFAULT_FILES_FOR_UPLOAD_DIR)
        os.makedirs(dl_root, exist_ok=True)

        sync_playwright = self._require_playwright()
        kept = 0
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=self.playwright_headless,
                args=["--disable-blink-features=AutomationControlled"],
                ignore_default_args=["--enable-automation"],
            )
            context = browser.new_context(user_agent=self.user_agent, locale="en-US")
            page = context.new_page()
            try:
                self._login(page)

                if single_detail_url:
                    candidates = [
                        SearchResult(
                            external_id=json_generator.external_id_from_detail_url(single_detail_url),
                            title="Direct Detail URL",
                            detail_url=single_detail_url,
                        )
                    ]
                    print("Step 2 bypassed: using CLI detail URL.", flush=True)
                else:
                    print(
                        f"Step 2: searching {len(keywords)} keyword(s) "
                        f"{keywords[:5]!r}...",
                        flush=True,
                    )
                    candidates = self.gather_candidates(page, keywords, max_pages=max_pages)
                    print(f"Step 2 done: {len(candidates)} unique candidate(s).", flush=True)

                if skip_existing and not single_detail_url:
                    before = len(candidates)
                    candidates = [c for c in candidates if c.external_id not in already]
                    if before - len(candidates):
                        print(
                            f"Dedup: skipping {before - len(candidates)} already in data_raw/.",
                            flush=True,
                        )

                print(f"\nSteps 3-5: iterate {len(candidates)} candidate(s).", flush=True)
                for i, c in enumerate(candidates, 1):
                    title_short = c.title[:72]
                    print(f"\n  -> {i}/{len(candidates)} [{c.external_id}] {title_short}", flush=True)
                    try:
                        page.goto(
                            c.detail_url,
                            wait_until="domcontentloaded",
                            timeout=self.timeout_seconds * 1000,
                        )
                        page.wait_for_timeout(800)
                        record = self._extract_detail_fields(page, c)
                    except Exception as exc:
                        print(f"    detail error: {exc}", flush=True)
                        continue

                    if not self.is_tech_relevant(record):
                        print("    skip: not tech/IT/telecom relevant.", flush=True)
                        continue

                    # Step 5: download attachments, then upload to Drive (unless skipped).
                    gdrive_interface.delete_local_files_in_folder(dl_root, extensions=None)
                    downloaded = self._download_documents(
                        page, record.document_links, dl_root, max_attachments
                    )
                    documents = self._materialize_documents(
                        downloaded, c.external_id, dl_root, skip_drive_upload
                    )
                    if downloaded:
                        print(
                            f"    {len(downloaded)} attachment(s) "
                            f"{'(source URLs)' if skip_drive_upload else '-> Drive'}",
                            flush=True,
                        )

                    try:
                        _payload, json_path = json_generator.run_generate_raw_json(
                            record.fields,
                            c.detail_url,
                            documents,
                            record.category_codes,
                            data_raw_dir=raw_dir,
                        )
                        kept += 1
                        print(f"    JSON: {json_path}", flush=True)
                    except Exception as exc:
                        print(f"    write error: {exc}", flush=True)
            finally:
                browser.close()

        try:
            gdrive_interface.delete_local_files_in_folder(dl_root, extensions=None)
        except Exception:
            pass
        print(f"\nBidNet scrape complete: wrote {kept} tech solicitation(s).", flush=True)
        return 0


def _existing_raw_external_ids(data_raw_dir: str) -> set:
    """External ids already present in data_raw/ (and data_raw/archive/) for dedup."""
    out: set = set()
    prefix, suffix = "bidnet_", ".json"
    for d in (data_raw_dir, os.path.join(data_raw_dir, "archive")):
        if not os.path.isdir(d):
            continue
        for fname in os.listdir(d):
            if fname.startswith(prefix) and fname.endswith(suffix):
                out.add(fname[len(prefix):-len(suffix)])
    return out


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        description="BidNet Direct (California) search and scrape for tech/IT/telecom bids."
    )
    ap.add_argument(
        "--detail_url", nargs="?",
        help="Optional single solicitation abstract URL to process directly.",
    )
    ap.add_argument("--headed", action="store_true", help="Show the browser window.")
    ap.add_argument("--timeout", type=int, default=60, help="Browser timeout in seconds.")
    ap.add_argument(
        "--max-pages", type=int, default=3,
        help="Max listing pages to page through per keyword (default: 3).",
    )
    ap.add_argument(
        "--skip-existing", dest="skip_existing", action="store_true", default=True,
        help="Skip solicitations whose data_raw/bidnet_<id>.json already exists (default).",
    )
    ap.add_argument(
        "--no-skip-existing", dest="skip_existing", action="store_false",
        help="Re-scrape and overwrite even if a raw JSON already exists.",
    )
    ap.add_argument(
        "--max-attachments", type=int, default=DEFAULT_MAX_ATTACHMENTS,
        help=f"Max attachment downloads per bid (default: {DEFAULT_MAX_ATTACHMENTS}).",
    )
    ap.add_argument(
        "--no-drive", action="store_true",
        help="Record BidNet attachment URLs instead of uploading files to Google Drive "
             "(use in CI / when Google OAuth is unavailable).",
    )
    args = ap.parse_args(argv)

    try:
        from dotenv import load_dotenv

        load_dotenv()
    except Exception:
        pass

    client = BidNetInterface(
        timeout_seconds=args.timeout,
        playwright_headless=not args.headed,
    )
    return client.run(
        max_pages=args.max_pages,
        skip_existing=args.skip_existing,
        single_detail_url=(args.detail_url.strip() if args.detail_url else None),
        skip_drive_upload=args.no_drive,
        max_attachments=args.max_attachments,
    )


if __name__ == "__main__":
    raise SystemExit(main())
