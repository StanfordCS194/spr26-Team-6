"""Single source of truth for the tag classifier.

Three things must stay in lock-step:

1. ``TAG_VOCAB`` — canonical list of category tags the classifier can emit.
   Location strings (cities, "California") are appended *after* the
   classifier and are deliberately not in this vocabulary.
2. ``KEYWORD_TAG_RULES`` — substring-to-tag rules used by
   ``processor.labeling`` to bootstrap weak training labels from the raw
   description / title / dept / document-label text.
3. ``UNSPSC_FAMILY_TAGS`` — 2-digit UNSPSC family code → tag mapping.
   ``processor.labeling.extract_unspsc_codes`` pulls 8-digit codes out of
   the description body (since ``metadata.unspsc_codes`` is currently
   broken upstream — every scraped record contains a single placeholder).

Module load asserts that every keyword/UNSPSC rule resolves to a tag in
``TAG_VOCAB`` so the three artifacts cannot drift apart.

``version_hash()`` returns a stable hash of all three artifacts plus the
installed ``scikit-learn`` version. The trained classifier embeds this
hash; the loader rejects on mismatch and the pipeline auto-retrains.
"""

from __future__ import annotations

import hashlib
import json

# ---------------------------------------------------------------------------
# Canonical tag vocabulary
# ---------------------------------------------------------------------------

TAG_VOCAB: tuple[str, ...] = (
    "IT Systems",
    "Software",
    "System Development",
    "Cloud",
    "SaaS",
    "Cybersecurity",
    "Data",
    "GIS",
    "Health Services",
    "Medical Imaging",
    "Fire Services",
    "Forestry",
    "Construction",
    "Infrastructure",
    "Electrical",
    "Hardware",
    "Logistics",
    "Transportation",
    "Environment",
    "Water",
    "Cannabis",
    "Corrections",
    "Legal & Courts",
    "Finance",
    "Operations",
    "Procurement",
    "Government",
    "Training",
    "Research",
    "Consulting",
)


# ---------------------------------------------------------------------------
# Keyword rules (weak supervision)
# ---------------------------------------------------------------------------

# Each tuple is (case-insensitive substring, canonical tag). Multiple
# substrings may map to the same tag. Order does not matter — the labeler
# de-duplicates the resulting set.
KEYWORD_TAG_RULES: list[tuple[str, str]] = [
    # Electrical / construction
    ("transformer", "Electrical"),
    ("electrical", "Electrical"),
    ("wiring", "Electrical"),
    ("conduit", "Electrical"),
    ("construction management", "Construction"),
    ("construction", "Construction"),
    ("install ", "Construction"),
    ("capital infrastructure", "Infrastructure"),
    ("infrastructure", "Infrastructure"),
    ("highway", "Infrastructure"),
    ("bridge", "Infrastructure"),
    ("pipeline", "Infrastructure"),

    # Health
    ("calheers", "Health Services"),
    ("medi-cal", "Health Services"),
    ("medicaid", "Health Services"),
    ("healthcare", "Health Services"),
    ("health care", "Health Services"),
    ("eligibility", "Health Services"),
    ("hospital", "Health Services"),
    ("clinical", "Health Services"),
    ("medical center", "Health Services"),
    ("multivue", "Medical Imaging"),
    ("imaging", "Medical Imaging"),

    # IT / software / cloud
    ("software as a service", "SaaS"),
    ("saas", "SaaS"),
    ("cloud-based", "Cloud"),
    ("cloud based", "Cloud"),
    ("cloud", "Cloud"),
    ("software licensing", "Software"),
    ("software subscription", "Software"),
    ("software", "Software"),
    ("information technology", "IT Systems"),
    ("system development", "System Development"),
    ("system enhancements", "System Development"),
    ("implementation services", "System Development"),
    ("implementation and configuration", "System Development"),
    ("erpa", "IT Systems"),
    ("limsr", "IT Systems"),
    ("limss", "IT Systems"),
    ("laboratory information management", "IT Systems"),

    # Cybersecurity
    ("cybersecurity", "Cybersecurity"),
    ("cyber ", "Cybersecurity"),
    ("bigfix", "Cybersecurity"),

    # Data / GIS
    ("national change of address", "Data"),
    ("ncoa", "Data"),
    ("data center", "Infrastructure"),
    ("database", "Data"),
    ("geographic information system", "GIS"),
    ("gis ", "GIS"),
    ("aerial film", "GIS"),
    ("computer-aided dispatch", "GIS"),
    ("computer aided dispatch", "GIS"),

    # Fire / forestry
    ("cal fire", "Fire Services"),
    ("fire protection", "Fire Services"),
    ("forestry", "Forestry"),

    # Hardware / logistics
    ("server", "Hardware"),
    ("hardware", "Hardware"),
    ("freight", "Logistics"),

    # Environment / water
    ("environmental", "Environment"),
    ("environment", "Environment"),
    ("watertap", "Water"),
    ("drinking water", "Water"),
    ("water resources", "Water"),
    ("water board", "Water"),
    ("swrcb", "Water"),

    # Cannabis
    ("cannabis", "Cannabis"),

    # Corrections / courts / finance
    ("corrections", "Corrections"),
    ("rehabilitation", "Corrections"),
    ("court interpreter", "Legal & Courts"),
    ("judicial", "Legal & Courts"),
    ("court", "Legal & Courts"),
    ("franchise tax", "Finance"),
    ("budget development", "Finance"),
    ("financial tracking", "Finance"),
    ("financial management", "Finance"),
    ("onestream", "Finance"),

    # Operations / training / research / consulting / procurement
    ("maintenance & operations", "Operations"),
    ("maintenance and operations", "Operations"),
    ("operations support", "Operations"),
    ("training services", "Training"),
    ("research and development", "Research"),
    ("market research", "Research"),
    ("consulting services", "Consulting"),
    ("consultant", "Consulting"),
    ("procurement official", "Procurement"),
    ("solicitation", "Procurement"),
]


# ---------------------------------------------------------------------------
# UNSPSC family → tag mapping
# ---------------------------------------------------------------------------

# UNSPSC is a 4-level hierarchical classification. The first 2 digits are
# the *segment* (top of the hierarchy). Mapping segments to our tags lets a
# new RFP whose description contains an inline UNSPSC code immediately
# pick up tag signal even when the keyword rules miss it.
#
# References (paraphrased): https://www.unspsc.org/codeset
#   43 — IT Broadcasting and Telecommunications
#   80, 81 — Management & Business / IT Service Delivery
#   83 — Public Utilities & Public Sector Services
#   85 — Healthcare Services
#   86 — Education and Training Services
#   72 — Building and Facility Construction & Maintenance
#   78 — Transportation, Warehousing & Storage
#   77 — Environmental Services
UNSPSC_FAMILY_TAGS: dict[str, str] = {
    "39": "Electrical",       # Electrical systems & lighting
    "43": "IT Systems",       # IT broadcasting / software
    "44": "Hardware",         # Office equipment & supplies
    "70": "Environment",      # Farming & forestry
    "71": "Environment",      # Mining & oil
    "72": "Construction",     # Building construction
    "73": "Infrastructure",   # Industrial production & manufacturing services
    "76": "Operations",       # Industrial cleaning services
    "77": "Environment",      # Environmental services
    "78": "Logistics",        # Transportation, warehousing & storage
    "80": "Consulting",       # Management & business professionals
    "81": "IT Systems",       # Engineering / IT service delivery
    "82": "Operations",       # Editorial & design / media production
    "83": "Data",             # Public utilities & sector services
    "84": "Finance",          # Financial & insurance services
    "85": "Health Services",  # Healthcare services
    "86": "Training",         # Education & training services
    "92": "Government",       # National defense / public order / safety
    "93": "Government",       # Politics & civic affairs
}


# ---------------------------------------------------------------------------
# Module-load validation
# ---------------------------------------------------------------------------

def _validate() -> None:
    vocab = set(TAG_VOCAB)
    bad_keyword = [tag for _, tag in KEYWORD_TAG_RULES if tag not in vocab]
    if bad_keyword:
        raise RuntimeError(
            "KEYWORD_TAG_RULES references tags missing from TAG_VOCAB: "
            f"{sorted(set(bad_keyword))}"
        )
    bad_unspsc = [tag for tag in UNSPSC_FAMILY_TAGS.values() if tag not in vocab]
    if bad_unspsc:
        raise RuntimeError(
            "UNSPSC_FAMILY_TAGS references tags missing from TAG_VOCAB: "
            f"{sorted(set(bad_unspsc))}"
        )


_validate()


# ---------------------------------------------------------------------------
# Version hash — embedded in the trained model artifact
# ---------------------------------------------------------------------------

def version_hash() -> str:
    """Stable hash of the rule set + sklearn version.

    The trained classifier stores this hash; the loader compares against
    the current value and rejects (forcing a retrain) on mismatch.
    """
    try:
        import sklearn
        sklearn_version = sklearn.__version__
    except ImportError:  # pragma: no cover - sklearn missing is a hard error elsewhere
        sklearn_version = "unknown"

    payload = json.dumps(
        {
            "vocab": list(TAG_VOCAB),
            "keywords": KEYWORD_TAG_RULES,
            "unspsc": UNSPSC_FAMILY_TAGS,
            "sklearn": sklearn_version,
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
