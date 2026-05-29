# Spike: Supply.io (48h feasibility)

**Date:** 2026-05-29  
**Owner:** GovBid / spr26-Team-6  
**Design ref:** [Approach B step 2](~/.gstack/projects/spr26-team-6/ethanharianto-main-design-20260529-133750.md)  
**Anvaya signal:** Named "Supply.io" immediately after CMAS/RMSA in weekly RFP workflow.

## Executive verdict

| Verdict | **NO-GO** (pending Anvaya identity confirmation) |
|---------|--------------------------------------------------|
| Confidence | High that *none* of the products matching "Supply.io" are scrapeable RFP catalogs |
| Blocker | Cannot identify a public procurement listing surface with PDF attachments |
| Recommended pivot | Confirm exact product URL with Anvaya; if misheard, spike **Public Purchase** or **BidNet Direct** next |

---

## Identity resolution (critical finding)

Anvaya said **"Supply.io"**. Desk research found **three unrelated products** and **no California government RFP aggregator** at that name.

| Candidate | URL | What it actually is | RFP listing + PDFs? |
|-----------|-----|---------------------|---------------------|
| **Centra (mis-typed domain)** | [supply.io](https://supply.io) | Fashion/lifestyle DTC ecommerce platform | No |
| **Supplier.io** | [supplier.io](https://supplier.io) | Supplier intelligence / diversity sourcing for **buyers** (20M+ vendor profiles, spend history) | No — searches **suppliers**, not solicitations |
| **Supplyo** | [supplyo.io](https://supplyo.io) | UK construction tender-management SaaS for **general contractors** managing subcontractor bids | No — internal tender workflow, not gov portal |

**UC Procurement** lists [Supplier.io Explorer](https://procurement.ucop.edu/resources/procurement-platform-resources-and-logins) alongside Cal eProcure and SAM.gov as a **supplier search database**, not a bid-opportunity feed. That aligns with Supplier.io's product, not GovBid's ingest wedge.

**Hypothesis:** Anvaya may have meant **Public Purchase** (also named in the same interview), **BidNet Direct**, a paid aggregator (GovWin/HigherGov-style), or a login-gated tool we cannot see without their account. **Step 0 email is a hard gate** before any connector work.

---

## Auth model

| Scenario | Auth | Notes |
|----------|------|-------|
| supply.io (Centra) | N/A | Wrong product category |
| Supplier.io Explorer | SSO / paid enterprise ([UC login page](https://procurement.ucop.edu/resources/procurement-platform-resources-and-logins)) | Buyer-side tool; no vendor-facing open bid list |
| Unknown Anvaya tool | **Unknown** | Likely account + subscription; cannot spike without customer credentials or exact URL |

**Spike action not taken:** No Anvaya credentials or screenshot of their "Supply.io" tab were available in repo or interview notes.

---

## Listing page structure

Not observed — no confirmed procurement listing URL.

If Anvaya confirms **Supplier.io**: expect supplier profile search (NAICS-like filters on **vendors**), not solicitation rows with due dates and RFP PDFs.

If Anvaya meant **Public Purchase** (compare spike): agency-specific gems URLs, e.g. Riverside County embed at `publicpurchase.com/gems/{agency}/buyer/public/publicInfo` — structurally closer to PlanetBids than Cal eProcure.

---

## PDF / document URL availability

| Requirement (design exit criteria) | Status |
|-----------------------------------|--------|
| Fetchable PDF or document URL per opportunity | **Not demonstrated** |
| Compatible with `metadata.documents[]` → `pdf_url_1..10` | N/A |
| Passes `record_has_pdf_url()` ingest gate ([`processor/ingest_supabase.py`](../../processor/ingest_supabase.py)) | Would fail without documents |

---

## Rate limits

Unknown — no API or listing endpoint identified.

For comparison: Cal eProcure uses Playwright + polite delays; SAM API is 10 req/day (out of scope).

---

## ToS / access concerns

| Risk | Assessment |
|------|------------|
| Scraping Supplier.io | Enterprise data product; almost certainly prohibits unauthorized automated extraction |
| Scraping unknown paid aggregator | High legal/contract risk without license |
| Using Anvaya's login | Account sharing violates typical SaaS ToS; not automatable in cron |

---

## Stable external ID strategy (if product were confirmed later)

Placeholder scheme until real URLs exist:

```
external_id = "{vendor_slug}:{opportunity_id}"
source      = "Supply.io"   # requires DB migration + _SOURCE_CANON entry
content_hash = v1-{external_id}-{sha256(title + due_date)[:12]}
```

**Cannot validate** uniqueness or stability without live listing samples.

---

## Sample JSON (hypothetical — **not from live scrape**)

Fixture shows target shape if Anvaya points us to a real bid aggregator. File: [`fixtures/supplyio_sample.json`](fixtures/supplyio_sample.json).

Key fields mirror Cal eProcure processed output:

- `source`: canonical literal (needs migration if not `other`)
- `metadata.documents[]`: required for ingest gate
- `metadata.naics_codes` or `unspsc_codes`: for dashboard filters (T5)

---

## Go / no-go matrix

| Exit criterion (design step 2) | Result | Evidence |
|----------------------------------|--------|----------|
| Auth model documented | ⚠️ Partial | Three wrong products ruled out; real tool unknown |
| Listing page structure | ❌ Fail | No listing URL |
| PDF URL available | ❌ Fail | No sample documents |
| Rate limits understood | ❌ Fail | N/A |
| ToS / access assessed | ✅ Pass | Enterprise / paid-wall risk too high without contract |
| Stable external ID | ❌ Fail | No IDs from live data |
| Sample JSON → `pdf_url_*` path | ⚠️ Partial | Hypothetical fixture only |
| **Overall** | **NO-GO** | Do not implement `scraper/supplyio_interface.py` until Anvaya confirms product |

---

## Recommended next steps

1. **Send Step 0 email today:** *"When you said Supply.io — can you share the exact URL you open weekly, or a screenshot? We want to make sure we're not confusing it with Supplier.io (vendor search) or Public Purchase."*
2. **If URL is Public Purchase / BidNet / similar:** run a **new 48h spike** on that product (better fit for Approach B step 4).
3. **If URL is Supplier.io:** treat as **out of scope for RFP ingest**; optional future feature = subcontractor matching, not catalog expansion.
4. **Parallel path:** Proceed **Authorium spike** (T3 sibling) and **PlanetBids registry** from May 27 ideation if both NO-GO.

---

## Time box log

| Activity | Duration | Outcome |
|----------|----------|---------|
| Domain + product research | ~2h | Ruled out supply.io, Supplier.io, Supplyo for RFP ingest |
| Repo schema review | ~30m | Confirmed PDF gate + source literal requirements |
| Sample JSON authoring | ~30m | Hypothetical fixture for processor compatibility |
| **Total** | **~3h** | NO-GO documented |
