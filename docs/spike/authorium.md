# Spike: Authorium (48h feasibility)

**Date:** 2026-05-29  
**Owner:** GovBid / spr26-Team-6  
**Design ref:** [Approach B step 3](~/.gstack/projects/spr26-team-6/ethanharianto-main-design-20260529-133750.md)  
**Anvaya signal:** Named alongside CMAS/RMSA and Supply.io as a weekly RFP source.

## Executive verdict

| Verdict | **NO-GO** for unified automated PDF ingest (v1 connector) |
|---------|-------------------------------------------------------------|
| Confidence | High |
| Blocker | No single public catalog; vendor portals are per-agency, login-gated; RFP PDFs often live on agency websites |
| Alternative | Metadata-only rows + outbound links per agency announcement pages; or manual import bridge (Approach C) |

---

## What Authorium is

[Authorium](https://authorium.com/) (formerly **City Innovate**) is a **government back-office** no-code platform: solicitation builder, vendor submission, evaluation workbooks, contract lifecycle. California agencies using it include **DHCS**, **CalRecycle**, **CalPERS**, **Dept. of Finance**, and others ([GovTech / Authorium CA press](https://markets.businessinsider.com/news/stocks/authorium-selected-by-california-for-genai-enabled-legislative-analysis-1034772241)).

It is **not** a statewide bid aggregator like Cal eProcure. Each agency publishes solicitations on **agency-specific Solicitation Builder URLs**.

---

## Auth model

| Surface | URL pattern | Auth | Public data without login |
|---------|-------------|------|---------------------------|
| Solicitation Builder (vendor) | `https://sb.cityinnovate.com/teams/{team_slug}?challenge_id={id}` | Email/password vendor account per solicitation | **Limited** — landing page shows title + "Get Started / Preview the form" |
| Sign-in gate | [sb.cityinnovate.com](https://sb.cityinnovate.com/) | Email OTP / password | No listing index observed |
| Agency contract pages | e.g. `calrecycle.ca.gov/Contracts/` | Usually public | PDF Q&A docs reference Authorium for **submission only** |

**Example (public landing, no login):**

- DHCS HR+ Modernization: `https://sb.cityinnovate.com/teams/dhcs?challenge_id=14773`
- Displays application title and preview/submit CTAs only — **no attachment list** on the public page.

**Vendor submission flow** (from CalRecycle RFP materials): required documents uploaded through Authorium vendor portal; support at `support@authorium.com`. Bid packages are **not** exposed as direct PDF URLs on the public challenge page.

---

## Listing page structure

```
Authorium (vendor-facing)
├── sb.cityinnovate.com/          → login wall; no global /challenges index (404 on /challenges)
├── /teams/{agency}?challenge_id=N → per-solicitation landing
│   ├── title (e.g. "Application for HR+ Modernization")
│   ├── Get Started / Preview form / Continue submission
│   └── no document manifest on public fetch
└── (authenticated) vendor submission forms, single-file upload, zip/PDF combine

Agency-facing (separate)
└── Agency website "Contracts" or "Doing Business" pages
    └── PDFs (RFP, Q&A) hosted on *.ca.gov — may link TO Authorium for submission
```

**Implication:** Discovering opportunities requires either:

1. **Per-agency crawler** of `.ca.gov` contract announcement pages (not Authorium API), or  
2. **Curated registry** of known `team_slug` + `challenge_id` URLs (high maintenance), or  
3. **Anvaya credentials** inside authenticated vendor sessions (not cron-safe).

---

## PDF / document URL availability

| Source | PDFs for GovBid catalog? | Notes |
|--------|--------------------------|-------|
| Public `sb.cityinnovate.com` challenge page | ❌ | Landing HTML only in spike fetch |
| Agency contract site | ✅ Often | e.g. CalRecycle publishes Q&A PDFs on `calrecycle.ca.gov` referencing Authorium submission |
| Authenticated vendor portal | ✅ Likely | Requires login; ToS unknown for automation |
| Google Drive mirror (Cal eProcure pattern) | Manual | Would need download + re-upload step per agency |

**Design exit criteria:** *fetchable PDFs or document URLs* → **Fails** if limited to Authorium host alone; **Partial pass** if paired with agency-site PDF scrape (two-hop connector, not a single Authorium adapter).

**Ingest gate:** Rows without `metadata.documents[].url` are skipped by [`record_has_pdf_url()`](../../processor/ingest_supabase.py).

---

## Rate limits

| Layer | Observation |
|-------|-------------|
| sb.cityinnovate.com | No published API rate limits; standard CDN/WAF expected |
| Agency `.ca.gov` sites | Variable; CalRecycle contracts index returned **403** to automated fetch during spike — bot blocking risk |
| Playwright (Cal eProcure precedent) | Feasible for agency pages; not validated on Authorium auth flows |

Recommend **one agency pilot** (CalRecycle or DHCS) before estimating nightly cron cost.

---

## ToS / access concerns

| Risk | Severity |
|------|----------|
| Scraping authenticated vendor portal with shared Anvaya login | **High** — account ToS, security, audit trail |
| Scraping sb.cityinnovate.com public landings | Medium — minimal data yield; may violate robots/terms |
| Scraping agency contract PDFs | Lower — public records; still check per-site policies |
| Storing vendor submission content | PII/commercial sensitivity if bid docs captured |

Authorium markets **FedRAMP High** / HIPAA compliance — indicates strict access controls on authenticated content.

---

## Stable external ID strategy

Recommended composite key for Authorium-sourced rows:

```
team_slug   = "dhcs"          # from /teams/{team_slug}
challenge_id = "14773"        # query param
external_id  = "dhcs:14773"   # or "authorium:dhcs:14773"
detail_url   = "https://sb.cityinnovate.com/teams/dhcs?challenge_id=14773"
source       = "Authorium"    # needs DB check constraint + _SOURCE_CANON (T6)
```

Agency-PDF-primary connector (if pursued):

```
external_id = "{agency_code}:{solicitation_number}"  # e.g. calrecycle:DRR24043
metadata.authorium = { "team_slug", "challenge_id", "submission_url" }
metadata.documents[] = PDFs from agency site
```

---

## Sample JSON

| File | Description |
|------|-------------|
| [`fixtures/authorium_metadata_only.json`](fixtures/authorium_metadata_only.json) | What public Authorium landing yields — **fails PDF ingest gate** |
| [`fixtures/authorium_agency_pdf_hybrid.json`](fixtures/authorium_agency_pdf_hybrid.json) | Target shape if agency PDFs + Authorium link combined — **passes ingest gate** |

Processed shape matches [`data_processed/caleprocure_*.json`](../../data_processed/caleprocure_0000036719.json): `metadata.documents[]` drives `pdf_url_1..10` on upsert.

---

## Go / no-go matrix

| Exit criterion (design step 3) | Result | Evidence |
|--------------------------------|--------|----------|
| Auth model documented | ✅ Pass | Public vs vendor login mapped |
| Listing page structure | ⚠️ Partial | Per-agency URLs; no global index |
| PDF URL available | ❌ Fail (Authorium-only) / ⚠️ Partial (agency hybrid) | Public challenge pages lack attachments |
| Rate limits understood | ⚠️ Partial | Agency 403 observed; no API |
| ToS / access assessed | ✅ Pass | Auth scraping high risk |
| Stable external ID | ✅ Pass | `team_slug:challenge_id` scheme |
| Sample JSON → `pdf_url_*` path | ⚠️ Partial | Hybrid fixture passes; metadata-only fails gate |
| **Overall (single Authorium scraper)** | **NO-GO** | Does not meet PDF-first catalog contract alone |

---

## Comparison to Cal eProcure adapter

| Dimension | Cal eProcure | Authorium |
|-----------|--------------|-----------|
| Single search surface | ✅ Statewide event search | ❌ Fragmented per agency |
| Public attachment download | ✅ Event Package / View Attachments | ❌ On vendor portal post-login |
| Stable IDs | ✅ Event ID in URL | ✅ challenge_id (per agency) |
| CI Playwright path | ✅ Proven in repo | ❌ Not started |
| PDF ingest gate | ✅ | ❌ without agency PDF hop |

---

## Recommended next steps

1. Ask Anvaya: *"For Authorium — which agencies' tabs do you open weekly (DHCS, CalRecycle, other)? Do you download RFP PDFs from the agency site or from inside Authorium?"*
2. **Do not** build `scraper/authorium_interface.py` cloning Cal eProcure until PDF source is confirmed.
3. If agency PDFs are the real source, spike **CalRecycle/DHCS contract announcement pages** as a separate doc (`docs/spike/authorium-agency-pages.md`) — still multi-connector, not one Authorium adapter.
4. For sprint **step 4 winner**: prefer **Public Purchase** or **PlanetBids starter set** if Supply.io remains NO-GO.

---

## Time box log

| Activity | Duration | Outcome |
|----------|----------|---------|
| Product + CA deployment research | ~1.5h | Confirmed per-agency Solicitation Builder model |
| Live URL probes (sb.cityinnovate.com, agency sites) | ~1h | Public landing OK; /challenges 404; calrecycle 403 |
| Schema + fixture authoring | ~1h | Hybrid vs metadata-only samples |
| **Total** | **~3.5h** | NO-GO for unified connector documented |
