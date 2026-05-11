"""Best-effort location extraction for an RFP.

Returns a (location, location_level) tuple where level is "city" or "state".
"""

from __future__ import annotations

import re
from typing import Any

# Curated list of California cities. Populate as more RFPs surface
# unfamiliar cities; the lookup is conservative and only matches whole-word
# occurrences inside addresses or descriptions.
CALIFORNIA_CITIES: set[str] = {
    "Anaheim", "Antioch", "Bakersfield", "Berkeley", "Burbank", "Carlsbad",
    "Carson", "Chico", "Chula Vista", "Citrus Heights", "Clovis", "Compton",
    "Concord", "Corona", "Costa Mesa", "Cupertino", "Daly City", "Davis",
    "Downey", "El Cajon", "El Monte", "Elk Grove", "Escondido", "Eureka",
    "Fairfield", "Fontana", "Fremont", "Fresno", "Fullerton", "Garden Grove",
    "Glendale", "Hanford", "Hayward", "Hesperia", "Hollywood",
    "Huntington Beach", "Inglewood", "Irvine", "Jurupa Valley", "Lancaster",
    "Long Beach", "Los Angeles", "Merced", "Mission Viejo", "Modesto",
    "Monterey", "Moreno Valley", "Mountain View", "Murrieta", "Napa",
    "Newport Beach", "Norwalk", "Oakland", "Oceanside", "Ontario", "Orange",
    "Oxnard", "Palmdale", "Palo Alto", "Pasadena", "Pleasanton", "Pomona",
    "Porterville", "Rancho Cucamonga", "Redding", "Redwood City", "Rialto",
    "Richmond", "Riverside", "Roseville", "Sacramento", "Salinas",
    "San Bernardino", "San Diego", "San Francisco", "San Jose", "San Mateo",
    "San Rafael", "Santa Ana", "Santa Barbara", "Santa Clara", "Santa Clarita",
    "Santa Cruz", "Santa Maria", "Santa Monica", "Santa Rosa", "Simi Valley",
    "South Gate", "Stockton", "Sunnyvale", "Temecula", "Thousand Oaks",
    "Torrance", "Tracy", "Tulare", "Vacaville", "Vallejo", "Ventura",
    "Victorville", "Visalia", "Vista", "Walnut Creek", "West Covina",
    "Westminster", "Whittier", "Yuba City",
}


_STATE_TOKENS = {"california", "ca", "calif"}


def _city_from_address(address: str) -> str | None:
    """Pull a known city out of an address-shaped string.

    Addresses look like "26501 Avenue 140, Porterville, California, 93257".
    """
    parts = [p.strip() for p in address.split(",")]
    for part in parts:
        if part in CALIFORNIA_CITIES:
            return part
    return None


def _city_from_text(text: str) -> str | None:
    """Best-effort city extraction.

    Prefers cities that appear in the canonical ``"<City>, California"`` /
    ``"<City>, CA"`` pattern over bare mentions, because bare mentions
    often catch institution names ("UC Davis Health", "San Diego State
    University") rather than the project location.
    """
    # 1. Strong signal: "<City>, California" or "<City>, CA[,.]"
    for city in CALIFORNIA_CITIES:
        if re.search(rf"\b{re.escape(city)}\s*,\s*(?:California|CA)\b", text):
            return city
    # 2. Fallback: any whole-word city mention.
    for city in CALIFORNIA_CITIES:
        if re.search(rf"\b{re.escape(city)}\b", text):
            return city
    return None


def detect_location(rfp: dict[str, Any]) -> tuple[str, str]:
    """Return (location, location_level)."""
    metadata = rfp.get("metadata") or {}

    # 1. Mandatory bidder conference often has a real address.
    bidder_conf = metadata.get("mandatory_bidder_conference") or {}
    addr = bidder_conf.get("location")
    if isinstance(addr, str) and addr.strip():
        city = _city_from_address(addr) or _city_from_text(addr)
        if city:
            return city, "city"

    # 2. Description scan.
    description = rfp.get("description") or ""
    if description:
        city = _city_from_text(description)
        if city:
            return city, "city"

    # 3. Title/name fallback.
    title = (rfp.get("title") or "") + " " + (rfp.get("name") or "")
    city = _city_from_text(title)
    if city:
        return city, "city"

    # 4. State-level signal.
    haystack = f"{description} {title} {addr or ''}".lower()
    if any(re.search(rf"\b{tok}\b", haystack) for tok in _STATE_TOKENS):
        return "California", "state"

    # 5. Default — Cal eProcure RFPs are statewide unless evidence says otherwise.
    return "California", "state"
