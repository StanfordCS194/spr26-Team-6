"""
This file provides an interface for interacting with SAM.gov via the official
Get Opportunities Public API.

Step 1: search opportunities by tech-related NAICS codes and date window.
Step 2: fetch the full opportunity description (HTML body) per record and clean it.
Step 3: download every attachment from ``resourceLinks[]`` (any file type),
        following the 302 redirect to S3 and preserving the original filename.
Step 4: upload all downloaded files to a per-opportunity Google Drive folder.
Step 5: write the normalized JSON payload to ``data_raw/samgov_{noticeId}.json``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import unquote_plus

import requests

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from scraper import gdrive_interface
from scraper import samgov_json_generator as json_generator


class SamGovRateLimitError(RuntimeError):
    """SAM.gov 429 with a long Retry-After (typically daily quota reset)."""

    def __init__(self, reset_at: datetime, endpoint: str) -> None:
        self.reset_at = reset_at
        self.endpoint = endpoint
        super().__init__(
            f"SAM.gov rate limit on {endpoint}. "
            f"Retry after {reset_at.isoformat()}. "
            "To process existing raw JSON only: "
            "`python run_pipeline.py sam --skip-scrape`."
        )


def _parse_retry_after_seconds(retry_after_hdr: Optional[str]) -> Optional[float]:
    """Parse Retry-After as delta-seconds or HTTP-date (SAM.gov uses the latter)."""
    if not retry_after_hdr or not str(retry_after_hdr).strip():
        return None
    raw = str(retry_after_hdr).strip()
    if raw.isdigit():
        return float(raw)
    try:
        reset_at = parsedate_to_datetime(raw)
        if reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        return max(0.0, (reset_at - now).total_seconds())
    except (TypeError, ValueError, OverflowError):
        return None


SEARCH_ENDPOINT = "https://api.sam.gov/opportunities/v2/search"
NOTICEDESC_ENDPOINT = "https://api.sam.gov/prod/opportunities/v1/noticedesc"

_SCRAPER_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_FILES_FOR_UPLOAD_DIR = os.path.join(_SCRAPER_DIR, "samgov_files_for_upload")
DEFAULT_DESC_CACHE_DIR = os.path.join(_SCRAPER_DIR, "cache", "samgov", "desc")

DEFAULT_TECH_NAICS_CODES: Tuple[str, ...] = (
    "541511",  # Custom Computer Programming Services
    "541512",  # Computer Systems Design Services
    "541513",  # Computer Facilities Management Services
    "541519",  # Other Computer Related Services
    "518210",  # Data Processing, Hosting, and Related Services
    "513210",  # Software Publishers (post-2022 code)
    "511210",  # Software Publishers (pre-2022 code, still used)
)

DEFAULT_PROCUREMENT_TYPES: Tuple[str, ...] = (
    "o",  # Solicitation
    "k",  # Combined Synopsis/Solicitation
    "p",  # Pre-solicitation
    "r",  # Sources Sought
    "s",  # Special Notice
)

DEFAULT_POSTED_FROM = "01/01/2026"
SEARCH_PAGE_LIMIT = 100


@dataclass(frozen=True)
class DownloadedAttachment:
    """One attachment that was successfully fetched to local disk."""

    resource_url: str
    local_path: str
    original_filename: str
    extension: str
    size_bytes: int


def _safe_filename(name: str) -> str:
    """Strip path separators and control chars from a server-provided filename."""
    cleaned = name.replace("/", "_").replace("\\", "_").strip()
    cleaned = re.sub(r"[\x00-\x1f]+", "", cleaned)
    return cleaned[:240] or "attachment"


def _filename_from_content_disposition(header: str) -> Optional[str]:
    """Pull a real filename out of a ``Content-Disposition`` header."""
    if not header:
        return None
    # RFC 5987 form first: filename*=UTF-8''<encoded>
    star = re.search(r"filename\*\s*=\s*[^']*''([^;]+)", header, re.IGNORECASE)
    if star:
        return _safe_filename(unquote_plus(star.group(1).strip().strip('"')))
    plain = re.search(r'filename\s*=\s*"?([^";]+)"?', header, re.IGNORECASE)
    if plain:
        return _safe_filename(unquote_plus(plain.group(1).strip()))
    return None


def _filename_from_url(url: str) -> Optional[str]:
    """Last resort: extract a filename from a URL's query string."""
    match = re.search(r"filename%3D([^&]+)", url) or re.search(r"filename=([^&]+)", url)
    return _safe_filename(unquote_plus(match.group(1))) if match else None


def _fallback_filename(content: bytes) -> str:
    """If the server told us nothing, sniff a default name + extension from magic bytes."""
    if content.startswith(b"%PDF-"):
        ext = ".pdf"
    elif content.startswith(b"PK\x03\x04"):
        ext = ".zip"  # docx/xlsx/pptx share this magic
    else:
        ext = ".bin"
    return f"attachment_{hashlib.sha1(content[:4096]).hexdigest()[:10]}{ext}"


class SamGovClient:
    """HTTP client for the SAM.gov Get Opportunities Public API (v2)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout_seconds: int = 30,
        desc_cache_dir: Optional[str] = None,
        request_delay_seconds: Optional[float] = None,
        max_http_retries: Optional[int] = None,
    ) -> None:
        self.api_key = api_key or os.environ["SAM_GOV_API_KEY"]
        self.timeout_seconds = timeout_seconds
        self.desc_cache_dir = desc_cache_dir or DEFAULT_DESC_CACHE_DIR
        self.request_delay_seconds = (
            request_delay_seconds
            if request_delay_seconds is not None
            else float(os.environ.get("SAM_GOV_REQUEST_DELAY_SEC", "1.0"))
        )
        self.max_http_retries = max_http_retries or int(
            os.environ.get("SAM_GOV_MAX_HTTP_RETRIES", "6")
        )

        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "spr26-Team-6 SamGovClient/1.0 (+https://github.com/StanfordCS194/spr26-Team-6)",
            "Accept": "application/json",
        })

    # ---------------------------------------------------------------- search
    def search_opportunities(
        self,
        posted_from: str = DEFAULT_POSTED_FROM,
        posted_to: Optional[str] = None,
        naics_codes: Iterable[str] = DEFAULT_TECH_NAICS_CODES,
        procurement_types: Iterable[str] = DEFAULT_PROCUREMENT_TYPES,
        max_records_per_naics: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Step 1: discover active opportunities matching any of ``naics_codes`` posted
        in the date window. One paginated search per NAICS code (the v2 API does
        not accept multiple ``ncode`` values in a single request).
        """
        posted_to = posted_to or datetime.now(timezone.utc).strftime("%m/%d/%Y")
        ptype = ",".join(procurement_types)

        deduped: Dict[str, Dict[str, Any]] = {}
        for naics_idx, code in enumerate(naics_codes):
            if naics_idx > 0 and self.request_delay_seconds > 0:
                time.sleep(self.request_delay_seconds)
            for record in self._search_one_naics(code, posted_from, posted_to, ptype, max_records_per_naics):
                if (record.get("active") or "").lower() != "yes":
                    continue
                nid = record.get("noticeId")
                if nid and nid not in deduped:
                    deduped[nid] = record
        return list(deduped.values())

    def fetch_by_notice_id(
        self,
        notice_id: str,
        posted_from: str = DEFAULT_POSTED_FROM,
        posted_to: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Single-opportunity lookup by noticeId via the search endpoint."""
        payload = self._http_get_json(SEARCH_ENDPOINT, {
            "api_key": self.api_key,
            "postedFrom": posted_from,
            "postedTo": posted_to or datetime.now(timezone.utc).strftime("%m/%d/%Y"),
            "noticeid": notice_id,
            "limit": 1,
        })
        records = payload.get("opportunitiesData") or []
        return records[0] if records else None

    def _search_one_naics(
        self,
        naics_code: str,
        posted_from: str,
        posted_to: str,
        ptype: str,
        max_records: int,
    ) -> Iterable[Dict[str, Any]]:
        offset = 0
        page = min(SEARCH_PAGE_LIMIT, max_records)
        fetched = 0
        while fetched < max_records:
            params = {
                "api_key": self.api_key,
                "postedFrom": posted_from,
                "postedTo": posted_to,
                "ncode": naics_code,
                "ptype": ptype,
                "limit": min(page, max_records - fetched),
                "offset": offset,
            }
            payload = self._http_get_json(SEARCH_ENDPOINT, params)
            data = payload.get("opportunitiesData") or []
            if not data:
                break
            yield from data
            fetched += len(data)
            total = int(payload.get("totalRecords") or 0)
            if fetched >= total or len(data) < params["limit"]:
                break
            offset += len(data)
            if self.request_delay_seconds > 0:
                time.sleep(self.request_delay_seconds)

    # ----------------------------------------------------------- description
    def fetch_description_text(self, opportunity: Dict[str, Any]) -> str:
        """
        Step 2: GET the per-opportunity description URL and return cleaned text.
        Caches the raw JSON response under ``cache/samgov/desc/<noticeId>.json``.
        """
        notice_id = json_generator.notice_id_from_opportunity(opportunity)
        cache_path = os.path.join(self.desc_cache_dir, f"{notice_id}.json")

        if os.path.isfile(cache_path):
            with open(cache_path, "r", encoding="utf-8") as fh:
                cached = json.load(fh)
            return json_generator.html_to_clean_text(cached.get("description") or "")

        payload = self._http_get_json(NOTICEDESC_ENDPOINT, {
            "api_key": self.api_key,
            "noticeid": notice_id,
        })

        os.makedirs(self.desc_cache_dir, exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)

        return json_generator.html_to_clean_text(payload.get("description") or "")

    # ------------------------------------------------------------ attachments
    def download_all_documents(
        self,
        opportunity: Dict[str, Any],
        dest_dir: str,
        max_attachments: Optional[int] = None,
    ) -> List[DownloadedAttachment]:
        """
        Step 3: fetch every URL in ``resourceLinks[]`` to ``dest_dir`` using the
        original filename from ``Content-Disposition``. No API key needed for these
        downloads (presigned S3 URLs).
        """
        os.makedirs(dest_dir, exist_ok=True)
        urls = (opportunity.get("resourceLinks") or [])[:max_attachments]

        downloaded: List[DownloadedAttachment] = []
        used_names: Dict[str, int] = {}
        for url in urls:
            try:
                resp = self.session.get(url, timeout=self.timeout_seconds, allow_redirects=True)
                resp.raise_for_status()
            except requests.RequestException as exc:
                print(f"      attachment fetch failed ({url}): {exc}", flush=True)
                continue

            filename = (
                _filename_from_content_disposition(resp.headers.get("Content-Disposition", ""))
                or _filename_from_url(resp.url)
                or _filename_from_url(url)
                or _fallback_filename(resp.content)
            )

            unique = filename
            if unique in used_names:
                used_names[unique] += 1
                root, dot_ext = os.path.splitext(filename)
                unique = f"{root}_{used_names[unique]}{dot_ext}"
            else:
                used_names[unique] = 0

            local_path = os.path.join(dest_dir, unique)
            with open(local_path, "wb") as fh:
                fh.write(resp.content)
            downloaded.append(DownloadedAttachment(
                resource_url=url,
                local_path=local_path,
                original_filename=filename,
                extension=os.path.splitext(filename)[1].lstrip(".").lower(),
                size_bytes=len(resp.content),
            ))
        return downloaded

    # ------------------------------------------------------------------- HTTP
    def _http_get_json(self, url: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """GET with exponential backoff on 429 / transient network errors."""
        endpoint = url.rsplit("/", 1)[-1]
        last_status: Optional[int] = None
        for attempt in range(self.max_http_retries):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout_seconds)
            except requests.RequestException:
                if attempt + 1 < self.max_http_retries:
                    time.sleep(min(60, 2**attempt))
                    continue
                raise
            last_status = resp.status_code
            if resp.status_code == 429:
                retry_after_hdr = resp.headers.get("Retry-After")
                parsed_sec = _parse_retry_after_seconds(retry_after_hdr)
                max_single_wait = float(
                    os.environ.get("SAM_GOV_MAX_RETRY_WAIT_SEC", "120")
                )
                backoff = min(60, 2 ** (attempt + 1))
                wait = max(parsed_sec or 0.0, backoff)
                if parsed_sec is not None and parsed_sec > max_single_wait:
                    reset_at = datetime.now(timezone.utc) + timedelta(seconds=parsed_sec)
                    raise SamGovRateLimitError(reset_at, endpoint)
                if attempt + 1 < self.max_http_retries:
                    time.sleep(wait)
                    continue
            if not resp.ok:
                # Don't echo resp.url — it contains api_key.
                raise requests.HTTPError(
                    f"SAM.gov {url} -> HTTP {resp.status_code}", response=resp
                )
            return resp.json()
        raise RuntimeError(f"SAM.gov GET {url} exhausted retries (last HTTP {last_status})")

    # --------------------------------------------------------------- finalize
    def finalize_pipeline_after_downloads(
        self,
        opportunity: Dict[str, Any],
        attachments: List[DownloadedAttachment],
        description_text: str,
        download_dir: Optional[str] = None,
        data_raw_dir: Optional[str] = None,
        skip_drive_upload: bool = False,
    ) -> str:
        """
        Steps 4 + 5: upload everything in ``download_dir`` to a per-opportunity
        Drive folder ``SAM.gov: {noticeId}``, then write the normalized JSON to
        ``data_raw/samgov_{noticeId}.json``.
        """
        notice_id = json_generator.notice_id_from_opportunity(opportunity)
        dl_dir = download_dir or DEFAULT_FILES_FOR_UPLOAD_DIR

        documents: List[Dict[str, Any]] = []
        if attachments and not skip_drive_upload:
            folder_id = gdrive_interface.create_drive_folder(f"SAM.gov: {notice_id}")
            uploads = gdrive_interface.upload_files_from_local_folder(dl_dir, folder_id)
            by_basename = {os.path.basename(a.local_path): a for a in attachments}
            for i, (basename, link) in enumerate(uploads):
                meta = by_basename.get(basename)
                documents.append({
                    "label": basename,
                    "url": link,
                    "type": "primary_spec" if i == 0 else "attachment",
                    "original_extension": meta.extension if meta else os.path.splitext(basename)[1].lstrip("."),
                    "size_bytes": meta.size_bytes if meta else None,
                    "source_url": meta.resource_url if meta else None,
                })
            gdrive_interface.delete_local_files_in_folder(dl_dir, extensions=None)
        else:
            for i, att in enumerate(attachments):
                documents.append({
                    "label": att.original_filename,
                    "url": att.resource_url,
                    "type": "primary_spec" if i == 0 else "attachment",
                    "original_extension": att.extension,
                    "size_bytes": att.size_bytes,
                    "source_url": att.resource_url,
                    "local_path": att.local_path,
                })

        _, json_path = json_generator.run_generate_raw_json(
            opportunity, description_text, documents, data_raw_dir=data_raw_dir,
        )
        return json_path


# ---------------------------------------------------------------------- dedup
def _safe_notice_id_filename(notice_id: str) -> str:
    """Mirror the filename sanitization in samgov_json_generator.write_raw_json."""
    return re.sub(r"[^\w.\-]+", "_", notice_id or "").strip("._") or "notice"


def _existing_raw_notice_ids(data_raw_dir: str) -> set:
    """Return the set of safe noticeIds already present in data_raw/
    or data_raw/archive/. Both count as 'already scraped' for dedup purposes;
    archived files are opportunities the pipeline has already processed.
    """
    out: set = set()
    prefix, suffix = "samgov_", ".json"
    dirs_to_scan = [data_raw_dir, os.path.join(data_raw_dir, "archive")]
    for d in dirs_to_scan:
        if not os.path.isdir(d):
            continue
        for fname in os.listdir(d):
            if fname.startswith(prefix) and fname.endswith(suffix):
                out.add(fname[len(prefix):-len(suffix)])
    return out


# ----------------------------------------------------------------------- CLI
def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="SAM.gov tech RFP search, download attachments, upload to Drive, write JSON.",
    )
    parser.add_argument("--posted-from", default=DEFAULT_POSTED_FROM,
                        help="Lower bound for postedDate, MM/DD/YYYY (default: %(default)s).")
    parser.add_argument("--posted-to", default=None,
                        help="Upper bound for postedDate, MM/DD/YYYY (default: today UTC).")
    parser.add_argument("--naics", nargs="*", default=list(DEFAULT_TECH_NAICS_CODES),
                        help="NAICS codes to search.")
    parser.add_argument("--ptype", nargs="*", default=list(DEFAULT_PROCUREMENT_TYPES),
                        help="Procurement types to include.")
    parser.add_argument("--max-per-naics", type=int, default=100,
                        help="Max records per NAICS code per run (default: %(default)s).")
    parser.add_argument("--max-attachments", type=int, default=None,
                        help="Cap downloads per opportunity (default: no cap).")
    parser.add_argument("--notice-id", default=None,
                        help="Process a single noticeId only (skip search step).")
    parser.add_argument("--no-drive", action="store_true",
                        help="Skip Google Drive upload; record original SAM.gov URLs in JSON.")
    parser.add_argument("--timeout", type=int, default=60,
                        help="HTTP timeout in seconds (default: %(default)s).")
    parser.add_argument("--skip-existing", dest="skip_existing", action="store_true", default=True,
                        help="Skip opportunities whose data_raw/samgov_<id>.json already exists (default).")
    parser.add_argument("--no-skip-existing", dest="skip_existing", action="store_false",
                        help="Re-scrape and overwrite opportunities even if a raw JSON already exists.")
    parser.add_argument(
        "--request-delay",
        type=float,
        default=None,
        help="Seconds to wait between opportunities (default: SAM_GOV_REQUEST_DELAY_SEC or 1.0).",
    )
    args = parser.parse_args(argv)

    client = SamGovClient(
        timeout_seconds=args.timeout,
        request_delay_seconds=args.request_delay,
    )

    if args.notice_id:
        opp = client.fetch_by_notice_id(args.notice_id, args.posted_from, args.posted_to)
        if not opp:
            print(f"No record found for noticeId={args.notice_id}", file=sys.stderr)
            return 1
        opportunities = [opp]
        print(f"Targeted run: 1 opportunity ({args.notice_id})", flush=True)
    else:
        opportunities = client.search_opportunities(
            posted_from=args.posted_from,
            posted_to=args.posted_to,
            naics_codes=args.naics,
            procurement_types=args.ptype,
            max_records_per_naics=args.max_per_naics,
        )
        print(
            f"Step 1 done: {len(opportunities)} opportunities across "
            f"{len(args.naics)} NAICS codes (posted {args.posted_from}–{args.posted_to or 'today'}).",
            flush=True,
        )

    raw_dir = os.path.abspath(json_generator.DEFAULT_DATA_RAW_DIR)
    if args.skip_existing:
        already_scraped = _existing_raw_notice_ids(raw_dir)
        filtered: List[Dict[str, Any]] = []
        skipped = 0
        for opp in opportunities:
            safe = _safe_notice_id_filename(opp.get("noticeId") or "")
            if safe in already_scraped:
                skipped += 1
                continue
            filtered.append(opp)
        if skipped:
            print(
                f"Dedup: skipping {skipped} opportunity(ies) already present in data_raw/.",
                flush=True,
            )
        opportunities = filtered

    dl_root = DEFAULT_FILES_FOR_UPLOAD_DIR
    os.makedirs(dl_root, exist_ok=True)
    kept = 0
    consecutive_429 = 0
    for i, opp in enumerate(opportunities, 1):
        notice_id = opp.get("noticeId", "unknown")
        title = (opp.get("title") or "")[:72]
        print(f"\n  → {i}/{len(opportunities)} [{notice_id}] {title}", flush=True)

        if client.request_delay_seconds > 0 and i > 1:
            time.sleep(client.request_delay_seconds)

        gdrive_interface.delete_local_files_in_folder(dl_root, extensions=None)

        try:
            description_text = client.fetch_description_text(opp)
            consecutive_429 = 0
            attachments = client.download_all_documents(opp, dl_root, max_attachments=args.max_attachments)
            json_path = client.finalize_pipeline_after_downloads(
                opp, attachments, description_text,
                download_dir=dl_root, skip_drive_upload=args.no_drive,
            )
        except SamGovRateLimitError:
            raise
        except Exception as exc:
            print(f"    error: {exc}", flush=True)
            if "429" in str(exc):
                consecutive_429 += 1
                cooldown = min(120, 15 * consecutive_429)
                print(
                    f"    rate limit: pausing {cooldown}s before next opportunity "
                    f"({consecutive_429} consecutive 429s)",
                    flush=True,
                )
                time.sleep(cooldown)
            else:
                consecutive_429 = 0
            continue

        print(
            f"    description: {len(description_text)} chars | attachments: {len(attachments)} | json: {json_path}",
            flush=True,
        )
        kept += 1

    print(f"\nDone. Wrote JSON for {kept}/{len(opportunities)} opportunities.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
