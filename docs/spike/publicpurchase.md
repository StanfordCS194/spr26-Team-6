# Spike: Public Purchase (48h feasibility)

**Date:** 2026-05-29  
**Owner:** GovBid / spr26-Team-6  
**Design ref:** Approach B step 2 — ship one non-SAM connector with PDF ingest gate  
**Anvaya signal:** Named alongside Cal eProcure in weekly RFP workflow (alternative to misheard "Supply.io").

## Executive verdict

| Verdict | **Conditional GO** |
|---------|---------------------|
| Confidence | High on architecture; medium on live yield without vendor credentials |
| Blocker | ~96% of CA agency home pages gate open bids behind login; bid detail URLs return **401** without session |
| Ship decision | Connector implemented; meaningful catalog growth requires `PUBLICPURCHASE_USERNAME` / `PUBLICPURCHASE_PASSWORD` |

---

## Platform overview

**Public Purchase** ([publicpurchase.com](https://www.publicpurchase.com)) is a multi-tenant procurement portal used by California cities, counties, CSUs, and special districts. Each agency has a **gems** slug:

| Pattern | Example |
|---------|---------|
| Agency home | `/gems/manteca,ca/buyer/public/home` |
| Public info embed | `/gems/manteca,ca/buyer/public/publicInfo` |
| Open bid list (AJAX) | `/gems/manteca,ca/global/home/nationalBidList?page=1&sortBy=title&sortDesc=N` |
| Bid detail | `/gems/manteca,ca/bid/public/view?bidId={id}` |
| Document download | `/gems/manteca,ca/bid/public/download?bidId={id}&file={n}` |

**748 CA agency slugs** available via `/gems/global/home/getAgenciesByRegion?region=CA`.

---

## Auth model

| Surface | Without login | With vendor login |
|---------|---------------|-------------------|
| Agency home | Loads; often shows *"Please log in to view the open bids"* | Full open-bids table |
| `nationalBidList` AJAX | Frequently empty or login message | Paginated bid rows |
| Bid detail popup URL | **HTTP 401** | HTML detail + attachment links |
| Login endpoint | POST `/gems/login/process` — `uname`, `pwd`, `fingerprint` (empty works), `dst` | Session cookie |

**Implementation:** `PublicPurchaseClient` in [`scraper/publicpurchase_interface.py`](../../scraper/publicpurchase_interface.py) reads credentials from env and establishes a session before scraping.

---

## Listing page structure

Open bids render in a `table.tabHome` with popup links:

```javascript
javascript:Auction_PopupWindow('/gems/{slug}/bid/public/view?bidId={id}', ...)
```

Parser extracts `bid_id`, title, start/end dates from table rows. Tech keyword filter (default: software, IT, cloud, cybersecurity, etc.) reduces noise before detail fetch.

**Live probe (2026-05-29):**

- ~717 / 748 CA agencies show login gate on public home
- ~31 agencies not login-gated typically had **no open bids** in HTML/AJAX at probe time
- Without credentials, scrape yield ≈ 0 rows with PDFs

---

## PDF / document URL availability

| Requirement | Status |
|-------------|--------|
| Fetchable PDF per opportunity | **Yes, when logged in** — `bid/public/download?bidId=&file=` links on detail page |
| GDrive upload | Same pattern as Cal eProcure / SAM |
| `metadata.documents[]` shape | Implemented in [`scraper/publicpurchase_json_generator.py`](../../scraper/publicpurchase_json_generator.py) |
| Passes `record_has_pdf_url()` ingest gate | **Enforced at scrape** — bids without downloaded PDFs are skipped |

---

## Rate limits

No documented API rate limits. Implementation uses:

- Sequential agency iteration with configurable `--delay` (default 1.5s)
- `--max-bids` cap per run
- Curated default slug list (~15 agencies) or `--all-ca` for full region

Polite scraping; no bulk API.

---

## ToS / access concerns

| Risk | Assessment |
|------|------------|
| Scraping without account | Public pages only; low yield, not ToS violation for public embeds |
| Using shared vendor credentials | Requires Anvaya/customer-provided account; typical SaaS ToS may restrict automation — confirm with customer |
| Storing session cookies | Ephemeral per run; no credential persistence in repo |

---

## Implementation artifacts

| Artifact | Path |
|----------|------|
| Scraper CLI | `scraper/publicpurchase_interface.py` |
| Agency slug helpers | `scraper/publicpurchase_agencies.py` |
| Raw JSON generator | `scraper/publicpurchase_json_generator.py` |
| Pipeline wiring | `run_pipeline.py publicPurchase` |
| Unit tests | `tests/test_publicpurchase.py` + `tests/fixtures/publicpurchase/` |
| Schema | `source = 'Public Purchase'` in migration `20260529000001_extend_rfps_source_check.sql` |

### Environment variables

```bash
PUBLICPURCHASE_USERNAME=   # vendor portal login (required for meaningful yield)
PUBLICPURCHASE_PASSWORD=
```

### Run commands

```bash
# Single agency smoke test
python -m scraper.publicpurchase_interface --agency manteca,ca --max-bids 5

# Full pipeline (scrape → process → Supabase)
python run_pipeline.py publicPurchase --scraper-arg=--agency --scraper-arg=manteca,ca

# Daily cron (opt-in)
DAILY_INGEST_PUBLIC_PURCHASE=1 ./scripts/daily_ingest.sh
```

---

## Comparison to other spikes

| Source | Verdict | PDF gate | Single scraper? |
|--------|---------|----------|-----------------|
| Supply.io | NO-GO | N/A | N/A |
| Authorium | NO-GO | Per-agency login | No |
| **Public Purchase** | **Conditional GO** | Yes | Yes (multi-tenant gems) |

---

## Next steps

1. Obtain vendor credentials from Anvaya for live end-to-end smoke test.
2. Apply Supabase migration if not already applied.
3. Monitor dashboard **Source: Public Purchase** filter after first successful ingest.
4. Expand `DEFAULT_CA_AGENCY_SLUGS` based on agencies Anvaya actually monitors.
