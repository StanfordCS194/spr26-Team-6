"""
Public Purchase connector — agency-scoped bid listings with optional vendor login.

Step 1: resolve CA agency slugs (curated default or ``--all-ca``)
Step 2: for each agency, fetch open bids (login required on most portals)
Step 3: keyword filter + fetch bid detail pages
Step 4: download PDF attachments when authenticated
Step 5: upload PDFs to Google Drive
Step 6: write ``data_raw/publicpurchase_{agency}__{bidId}.json``

CLI: ``python -m scraper.publicpurchase_interface``

Environment:
  PUBLICPURCHASE_USERNAME / PUBLICPURCHASE_PASSWORD — vendor login (required for yield)
"""

from __future__ import annotations

from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import parse_qs, unquote, urljoin, urlparse
import argparse
import os
import re
import sys
import time

from dotenv import load_dotenv

load_dotenv()

import requests

from scraper import publicpurchase_agencies as agencies
from scraper import publicpurchase_json_generator as json_generator

DEFAULT_TECH_KEYWORDS = (
    "software",
    "computer",
    "network",
    "cybersecurity",
    "cloud",
    "it support",
    "telecommunications",
    "database",
)

DEFAULT_PDFS_FOR_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "pdfs_for_upload",
)


@dataclass(frozen=True)
class BidListing:
    agency_slug: str
    bid_id: str
    title: str
    detail_url: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@dataclass
class DownloadedAttachment:
    local_path: str
    label: str
    attachment_description: str = ""


def _normalize(value: str) -> str:
    return " ".join((value or "").lower().split())


def is_login_required_html(html: str) -> bool:
    low = (html or "").lower()
    return "log in" in low and "view the open bids" in low


def is_empty_bids_html(html: str) -> bool:
    low = (html or "").lower()
    return (
        "no bids at this time" in low
        or "no bids about to end" in low
        or "there are no bids" in low
    )


def matches_tech_keywords(title: str, keywords: Sequence[str]) -> bool:
    hay = _normalize(title)
    return any(_normalize(kw) in hay for kw in keywords if kw.strip())


def extract_bid_id_from_url(url: str) -> Optional[str]:
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    for key in ("bidId", "bidid", "bid_id", "id"):
        vals = qs.get(key) or qs.get(key.lower())
        if vals and vals[0].strip():
            return vals[0].strip()
    m = re.search(r"bidId=(\d+)", url, re.I)
    return m.group(1) if m else None


def parse_open_bids_html(html: str, agency_slug: str) -> List[BidListing]:
    """Parse open-bid tables and popup links from agency home / AJAX fragments."""
    listings: List[BidListing] = []
    seen: set[str] = set()
    html = html or ""

    popup_re = re.compile(
        r"Auction_PopupWindow\(\s*['\"](?P<path>/gems/[^'\"]*bid/public/view[^'\"]*)['\"]",
        re.I,
    )
    href_re = re.compile(
        r"""href=["'](?P<path>/gems/[^"']*bid/public/view[^"']*)["']""",
        re.I,
    )

    def _add(path: str, title_hint: str = "") -> None:
        detail_url = urljoin(agencies.PUBLIC_PURCHASE_BASE_URL, unquote(path))
        bid_id = extract_bid_id_from_url(detail_url)
        if not bid_id:
            return
        key = f"{agency_slug}:{bid_id}"
        if key in seen:
            return
        seen.add(key)
        title = unescape(title_hint).strip() or f"Bid {bid_id}"
        listings.append(
            BidListing(
                agency_slug=agency_slug,
                bid_id=bid_id,
                title=title,
                detail_url=detail_url,
            )
        )

    # Table rows first so popup links inherit the title cell text.
    for row in re.findall(r"<tr[^>]*>.*?</tr>", html, flags=re.I | re.S):
        if "bid/public/view" not in row.lower():
            continue
        title_match = re.search(r"<td[^>]*>(.*?)</td>", row, flags=re.I | re.S)
        title_text = ""
        if title_match:
            title_text = re.sub(r"<[^>]+>", " ", title_match.group(1))
            title_text = unescape(re.sub(r"\s+", " ", title_text)).strip()
        for m in popup_re.finditer(row):
            _add(m.group("path"), title_text)
        for m in href_re.finditer(row):
            _add(m.group("path"), title_text)

    for m in popup_re.finditer(html):
        _add(m.group("path"))

    for m in href_re.finditer(html):
        _add(m.group("path"))

    return listings


class _DetailTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: List[str] = []
        self._link_text: Dict[str, str] = {}
        self._current_href: Optional[str] = None
        self._anchor_parts: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        am = dict(attrs)
        if tag.lower() == "a" and am.get("href"):
            self._current_href = am["href"]
            self._anchor_parts = []
        elif tag.lower() in {"br", "p", "div", "tr", "li", "h1", "h2", "h3"}:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not data.strip():
            return
        self._parts.append(data)
        if self._current_href is not None:
            self._anchor_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._current_href is not None:
            label = unescape("".join(self._anchor_parts)).strip()
            if label:
                self._link_text[self._current_href] = label
            self._current_href = None
            self._anchor_parts = []

    @property
    def text(self) -> str:
        return unescape(re.sub(r"\n{3,}", "\n\n", "".join(self._parts))).strip()

    @property
    def links(self) -> Dict[str, str]:
        return dict(self._link_text)


def parse_bid_detail_html(html: str) -> Tuple[str, List[Tuple[str, str]]]:
    parser = _DetailTextParser()
    parser.feed(html or "")
    parser.close()
    docs: List[Tuple[str, str]] = []
    for href, label in parser.links.items():
        low = href.lower()
        if ".pdf" in low or "download" in low or "attach" in low:
            docs.append((urljoin(agencies.PUBLIC_PURCHASE_BASE_URL, href), label or "attachment.pdf"))
    return parser.text, docs


class PublicPurchaseClient:
    LOGIN_PATH = "/gems/login/login"
    LOGIN_PROCESS_PATH = "/gems/login/process"

    def __init__(
        self,
        *,
        timeout_seconds: int = 45,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.username = username or os.environ.get("PUBLICPURCHASE_USERNAME", "").strip()
        self.password = password or os.environ.get("PUBLICPURCHASE_PASSWORD", "").strip()
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36 GovBid/1.0"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        self._logged_in = False

    @property
    def has_credentials(self) -> bool:
        return bool(self.username and self.password)

    def login(self) -> None:
        if not self.has_credentials:
            raise RuntimeError(
                "Public Purchase bid listings require vendor login. "
                "Set PUBLICPURCHASE_USERNAME and PUBLICPURCHASE_PASSWORD."
            )
        self.session.get(
            urljoin(agencies.PUBLIC_PURCHASE_BASE_URL, self.LOGIN_PATH),
            timeout=self.timeout_seconds,
        )
        resp = self.session.post(
            urljoin(agencies.PUBLIC_PURCHASE_BASE_URL, self.LOGIN_PROCESS_PATH),
            data={
                "uname": self.username,
                "pwd": self.password,
                "fingerprint": "",
                "dst": "",
            },
            timeout=self.timeout_seconds,
        )
        if resp.status_code == 429:
            raise RuntimeError(
                "Public Purchase rate limited (HTTP 429). "
                "Wait several minutes and retry with fewer requests."
            )
        resp.raise_for_status()
        if "unable to login" in resp.text.lower() or "invalid" in resp.text.lower():
            raise RuntimeError("Public Purchase login failed — check credentials.")
        self._logged_in = True

    def fetch_agency_home_html(self, agency_slug: str) -> str:
        resp = self.session.get(
            agencies.agency_home_url(agency_slug),
            timeout=self.timeout_seconds,
        )
        resp.raise_for_status()
        return resp.text

    def fetch_agency_open_bids(self, agency_slug: str) -> List[BidListing]:
        html = self.fetch_agency_home_html(agency_slug)
        if is_login_required_html(html) and not self._logged_in:
            return []
        listings = parse_open_bids_html(html, agency_slug)
        if listings:
            return listings

        # Some portals hydrate the table via nationalBidList AJAX.
        ajax_url = urljoin(
            agencies.PUBLIC_PURCHASE_BASE_URL,
            f"/gems/{agency_slug}/global/home/nationalBidList",
        )
        resp = self.session.get(
            ajax_url,
            params={"page": "1", "sortBy": "title", "sortDesc": "N"},
            timeout=self.timeout_seconds,
        )
        resp.raise_for_status()
        return parse_open_bids_html(resp.text, agency_slug)

    def fetch_bid_detail_html(self, detail_url: str) -> str:
        resp = self.session.get(detail_url, timeout=self.timeout_seconds)
        if resp.status_code == 401:
            raise RuntimeError(
                f"Bid detail requires login ({detail_url}). "
                "Set PUBLICPURCHASE_USERNAME / PUBLICPURCHASE_PASSWORD."
            )
        resp.raise_for_status()
        return resp.text

    def download_documents(
        self,
        doc_links: List[Tuple[str, str]],
        download_dir: str,
        *,
        max_files: int = 10,
    ) -> List[DownloadedAttachment]:
        os.makedirs(download_dir, exist_ok=True)
        out: List[DownloadedAttachment] = []
        for i, (url, label) in enumerate(doc_links[:max_files]):
            safe = re.sub(r"[^\w.\-]+", "_", label).strip("._") or f"attachment_{i}"
            if not safe.lower().endswith(".pdf"):
                safe = f"{safe}.pdf"
            target = os.path.join(download_dir, safe)
            if os.path.exists(target):
                base, ext = os.path.splitext(safe)
                target = os.path.join(download_dir, f"{base}_{i}{ext}")
            resp = self.session.get(url, timeout=self.timeout_seconds)
            resp.raise_for_status()
            content_type = (resp.headers.get("content-type") or "").lower()
            if "pdf" not in content_type and not resp.content.startswith(b"%PDF-"):
                continue
            with open(target, "wb") as fh:
                fh.write(resp.content)
            out.append(DownloadedAttachment(local_path=target, label=label))
        return out

    def finalize_pipeline_after_downloads(
        self,
        detail_text: str,
        listing: BidListing,
        attachments: List[DownloadedAttachment],
        *,
        agency_name: Optional[str] = None,
        download_dir: Optional[str] = None,
        data_raw_dir: Optional[str] = None,
        credentials_path: Optional[str] = None,
        token_path: Optional[str] = None,
    ) -> str:
        from scraper import gdrive_interface

        dl_dir = os.path.abspath(download_dir or DEFAULT_PDFS_FOR_UPLOAD_DIR)
        folder_name = f"PublicPurchase: {listing.agency_slug} {listing.bid_id}"
        folder_id = gdrive_interface.create_drive_folder(
            folder_name,
            credentials_path=credentials_path,
            token_path=token_path,
        )

        by_basename: Dict[str, str] = {}
        for att in attachments:
            if att.local_path and att.local_path.lower().endswith(".pdf"):
                by_basename[os.path.basename(att.local_path)] = att.label

        uploads = gdrive_interface.upload_pdfs_from_local_folder(
            dl_dir,
            folder_id,
            credentials_path=credentials_path,
            token_path=token_path,
        )

        documents: List[Dict[str, Any]] = []
        for i, (basename, link) in enumerate(uploads):
            label = by_basename.get(basename, basename)
            documents.append(
                {
                    "label": label,
                    "url": link,
                    "type": "primary_spec" if i == 0 else "attachment",
                    "attachment_description": "",
                }
            )

        _payload, json_path = json_generator.run_generate_raw_json(
            detail_text,
            agency_slug=listing.agency_slug,
            bid_id=listing.bid_id,
            detail_url=listing.detail_url,
            documents=documents,
            agency_name=agency_name,
            listing_title=listing.title,
            data_raw_dir=data_raw_dir,
        )
        gdrive_interface.delete_local_files_in_folder(dl_dir)
        return json_path


def _existing_raw_external_ids(data_raw_dir: str) -> set[str]:
    out: set[str] = set()
    prefix, suffix = "publicpurchase_", ".json"
    for sub in ("", "archive"):
        d = os.path.join(data_raw_dir, sub) if sub else data_raw_dir
        if not os.path.isdir(d):
            continue
        for fname in os.listdir(d):
            if fname.startswith(prefix) and fname.endswith(suffix):
                out.add(fname[len(prefix) : -len(suffix)])
    return out


def _extract_agency_name(html: str) -> Optional[str]:
    m = re.search(r"Open Bids for\s+(.+?)</div>", html, re.I | re.S)
    if not m:
        return None
    return unescape(re.sub(r"\s+", " ", m.group(1))).strip()


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Public Purchase CA agency bid scraper.")
    ap.add_argument(
        "--agency",
        action="append",
        default=[],
        help="Agency slug (repeatable), e.g. manteca,ca. Default: curated CA starter set.",
    )
    ap.add_argument(
        "--all-ca",
        action="store_true",
        help="Scan all CA agencies from Public Purchase region menu (slow).",
    )
    ap.add_argument(
        "--keyword",
        action="append",
        default=[],
        help="Tech keyword filter (repeatable). Default: built-in IT keyword list.",
    )
    ap.add_argument(
        "--max-bids",
        type=int,
        default=25,
        help="Max bids to process per agency (default: 25).",
    )
    ap.add_argument(
        "--max-attachments",
        type=int,
        default=10,
        help="Max PDF downloads per bid (default: 10).",
    )
    ap.add_argument(
        "--timeout",
        type=int,
        default=45,
        help="HTTP timeout seconds (default: 45).",
    )
    ap.add_argument(
        "--skip-existing",
        dest="skip_existing",
        action="store_true",
        default=True,
        help="Skip bids whose raw JSON already exists (default).",
    )
    ap.add_argument(
        "--no-skip-existing",
        dest="skip_existing",
        action="store_false",
        help="Re-scrape bids even when raw JSON exists.",
    )
    args = ap.parse_args(argv)

    keywords = args.keyword or list(DEFAULT_TECH_KEYWORDS)
    client = PublicPurchaseClient(timeout_seconds=args.timeout)

    if client.has_credentials:
        print("Logging in to Public Purchase…", flush=True)
        try:
            client.login()
            print("Login OK.", flush=True)
        except Exception as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    else:
        print(
            "Warning: no PUBLICPURCHASE_USERNAME/PASSWORD — most agencies hide bids behind login.",
            flush=True,
        )

    agency_slugs = agencies.resolve_agency_slugs(
        args.agency or None,
        session=client.session,
        include_all_ca=args.all_ca,
    )
    print(f"Step 1: {len(agency_slugs)} agency slug(s) to scan.", flush=True)

    raw_dir = os.path.abspath(json_generator.DEFAULT_DATA_RAW_DIR)
    already = _existing_raw_external_ids(raw_dir) if args.skip_existing else set()
    dl_root = os.path.abspath(DEFAULT_PDFS_FOR_UPLOAD_DIR)
    os.makedirs(dl_root, exist_ok=True)

    written = 0
    skipped_login = 0
    for idx, slug in enumerate(agency_slugs, 1):
        print(f"\nAgency {idx}/{len(agency_slugs)}: {slug}", flush=True)
        try:
            home_html = client.fetch_agency_home_html(slug)
        except Exception as exc:
            print(f"  fetch error: {exc}", flush=True)
            continue

        if is_login_required_html(home_html) and not client._logged_in:
            skipped_login += 1
            print("  skipped (login required)", flush=True)
            continue

        agency_name = _extract_agency_name(home_html)
        try:
            listings = client.fetch_agency_open_bids(slug)
        except Exception as exc:
            print(f"  list error: {exc}", flush=True)
            continue

        if not listings:
            if is_empty_bids_html(home_html):
                print("  no open bids", flush=True)
            else:
                print("  no parseable bid rows", flush=True)
            continue

        filtered = [b for b in listings if matches_tech_keywords(b.title, keywords)]
        if not filtered:
            print(f"  {len(listings)} bid(s), none matched IT keywords", flush=True)
            continue

        print(f"  {len(filtered)} tech-matching bid(s) of {len(listings)} total", flush=True)
        for bid_idx, listing in enumerate(filtered[: args.max_bids], 1):
            ext = json_generator.external_id_from_parts(listing.agency_slug, listing.bid_id)
            safe = re.sub(r"[^\w.\-]+", "_", ext).strip("._")
            if safe in already:
                print(f"    [{bid_idx}] skip existing {safe}", flush=True)
                continue

            print(f"    [{bid_idx}] {listing.title[:72]}", flush=True)
            try:
                detail_html = client.fetch_bid_detail_html(listing.detail_url)
            except Exception as exc:
                print(f"      detail error: {exc}", flush=True)
                continue

            detail_text, doc_links = parse_bid_detail_html(detail_html)
            if not detail_text:
                detail_text = listing.title

            from scraper import gdrive_interface

            gdrive_interface.delete_local_files_in_folder(dl_root)
            attachments: List[DownloadedAttachment] = []
            if doc_links and client._logged_in:
                try:
                    attachments = client.download_documents(
                        doc_links,
                        dl_root,
                        max_files=args.max_attachments,
                    )
                except Exception as exc:
                    print(f"      download error: {exc}", flush=True)

            if not attachments:
                print("      no PDF attachments — skipping (ingest PDF gate)", flush=True)
                continue

            try:
                json_path = client.finalize_pipeline_after_downloads(
                    detail_text,
                    listing,
                    attachments,
                    agency_name=agency_name,
                    download_dir=dl_root,
                )
                written += 1
                already.add(safe)
                print(f"      wrote {json_path}", flush=True)
            except Exception as exc:
                print(f"      finalize error: {exc}", flush=True)

            time.sleep(0.4)

    print(
        f"\nDone: wrote {written} raw JSON file(s); "
        f"{skipped_login} agency(ies) skipped for login.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
