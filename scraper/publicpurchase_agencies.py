"""Curated Public Purchase agency slugs for California ingest.

Public Purchase uses per-agency URLs under ``/gems/{slug}/buyer/public/home``.
Most agencies hide open bids behind vendor login; credentials are required for
meaningful scrape yield (see ``PUBLICPURCHASE_USERNAME`` / ``PUBLICPURCHASE_PASSWORD``).
"""

from __future__ import annotations

import re
from typing import Iterable, List
from urllib.parse import urljoin

import requests

PUBLIC_PURCHASE_BASE_URL = "https://www.publicpurchase.com"

# Starter set: CSUs, counties, and metros named in ideation / Anvaya-adjacent CA IT spend.
DEFAULT_CA_AGENCY_SLUGS: tuple[str, ...] = (
    "caltrans,ca",
    "csus,ca",
    "csuf,ca",
    "csulb,ca",
    "csusm,ca",
    "buildlaccd,ca",
    "fresnoco,ca",
    "stanislausco,ca",
    "solanocounty,ca",
    "sacog,ca",
    "manteca,ca",
    "concord,ca",
    "brea,ca",
    "butteco,ca",
    "sanluisobispoco,ca",
)


def agency_home_url(agency_slug: str) -> str:
    slug = agency_slug.strip().strip("/")
    return urljoin(
        PUBLIC_PURCHASE_BASE_URL,
        f"/gems/{slug}/buyer/public/home",
    )


def agency_public_info_url(agency_slug: str) -> str:
    slug = agency_slug.strip().strip("/")
    return urljoin(
        PUBLIC_PURCHASE_BASE_URL,
        f"/gems/{slug}/buyer/public/publicInfo",
    )


def bid_detail_url(agency_slug: str, bid_id: str) -> str:
    slug = agency_slug.strip().strip("/")
    bid = str(bid_id).strip()
    return urljoin(
        PUBLIC_PURCHASE_BASE_URL,
        f"/gems/{slug}/bid/public/view?bidId={bid}",
    )


def fetch_ca_agency_slugs(
    session: requests.Session,
    *,
    timeout_seconds: int = 30,
) -> List[str]:
    """Return deduplicated CA agency slugs from the Public Purchase region menu."""
    resp = session.get(
        urljoin(PUBLIC_PURCHASE_BASE_URL, "/gems/global/home/getAgenciesByRegion"),
        params={"region": "CA"},
        timeout=timeout_seconds,
    )
    resp.raise_for_status()
    slugs = re.findall(r"/gems/([^/]+)/buyer/public/home", resp.text)
    out: List[str] = []
    seen = set()
    for slug in slugs:
        if "syndicatedOrgId" in slug:
            continue
        if slug in seen:
            continue
        seen.add(slug)
        out.append(slug)
    return out


def resolve_agency_slugs(
    requested: Iterable[str] | None = None,
    *,
    session: requests.Session | None = None,
    include_all_ca: bool = False,
) -> List[str]:
    """Resolve CLI/config agency list to concrete slugs."""
    if include_all_ca:
        sess = session or requests.Session()
        return fetch_ca_agency_slugs(sess)
    if requested:
        return [s.strip() for s in requested if s.strip()]
    return list(DEFAULT_CA_AGENCY_SLUGS)
