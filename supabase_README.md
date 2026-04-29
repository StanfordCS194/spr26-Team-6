# RFP Discovery Platform — Database Setup

Supabase schema, migrations, and TypeScript types for the contractor/RFP matching platform built for CS194W.

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Tables](#tables)
- [Getting Started](#getting-started)
- [How the Pipeline Uses This](#how-the-pipeline-uses-this)
- [RLS Model](#rls-model)
- [Embedding Dimensions](#embedding-dimensions)

---

## Overview

This database powers a platform that scrapes government RFPs (from sam.gov, Cal eProcure, and PlanetBids), classifies them for relevance, and matches them against contractor profiles using vector similarity search (RAG).

PDFs are not stored in Supabase — they live in Google Drive (set to "anyone with link") and are referenced by URL on each RFP record. The frontend embeds them via Drive's `/preview` iframe.

---

## Project Structure

```
supabase/
├── migrations/
│   ├── 20260428000001_extensions.sql        # pgvector, pg_trgm, pgcrypto
│   ├── 20260428000002_schema.sql            # core tables
│   ├── 20260428000003_indexes.sql           # HNSW vector + GIN/B-tree indexes
│   ├── 20260428000004_functions.sql         # RPCs, triggers, score-cache trim
│   ├── 20260428000005_rls_policies.sql      # per-user access control
│   ├── 20260428000006_pdf_storage.sql       # storage bucket (later removed)
│   ├── 20260428000007_drive_url.sql         # swapped storage for drive URL
│   ├── 20260428000008_full_schema.sql       # scraper output fields, metadata
│   └── 20260428000009_pdf_url_columns.sql   # 10 flat pdf_url columns
├── seed.sql                                 # department name aliases
lib/
└── database.types.ts                        # TypeScript types for supabase-js
```

---

## Tables

| Spec Item | Table |
|---|---|
| Contractor profile, preferences, goals | `contractors` |
| Past performance for RAG | `contractor_past_projects` *(has `embedding`)* |
| Saved RFPs | `saved_rfps` |
| RFP record (title, name, SOW, deliverables, dept, contact, etc.) | `rfps` |
| RFP PDF links (up to 10 per RFP) | `rfps.pdf_url_1` … `rfps.pdf_url_10` |
| Source-specific structured extras (UNSPSC codes, bidder conf, etc.) | `rfps.metadata` (jsonb) |
| RFP chunks for vector search | `rfp_chunks` *(has `embedding`)* |
| Amendment / update detection | `rfp_amendments` + `rfps.content_hash` |
| Match score cache (100 most recent) | `scores` *(auto-trimmed by trigger)* |
| LLM summary cache | `rfp_summaries` |
| Department name normalization | `department_aliases` + `normalize_department()` |

---

## Getting Started

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A Supabase project ([create one here](https://supabase.com/dashboard))

### Install the CLI

```bash
# macOS
brew install supabase/tap/supabase

# or via npm
npm install -g supabase
```

### Apply migrations

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Migration files run in filename order automatically. All nine will be applied on first push.

### Load seed data

Seed data is not applied by `db push` on remote projects. After pushing migrations, run `seed.sql` manually in the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new) — paste the file contents and hit Run.

The `ON CONFLICT DO NOTHING` clause makes it safe to run multiple times.

### Local development (optional)

```bash
supabase start        # spins up local Postgres + Studio via Docker
supabase db reset     # applies all migrations + seed.sql locally
# Studio available at http://localhost:54323
supabase db push      # when ready, push to remote
```

---

## How the Pipeline Uses This

### Scrapers (sam.gov, Cal eProcure, PlanetBids)

1. Use the **service_role** key — bypasses RLS
2. Normalize department names: `select normalize_department_fuzzy('CA DoT')`
3. Compute a `content_hash` from normalized fields to detect amendments
4. For each PDF found, upload to a shared Google Drive folder and set sharing to "anyone with link"
5. Map up to 10 Drive URLs into `pdf_url_1` through `pdf_url_10`; leftover slots stay null
6. Upsert into `rfps` on `(source, external_id)`
7. If `content_hash` changed, call `record_rfp_amendment(...)`
8. Chunk and embed the description, write to `rfp_chunks`
9. Run classifier; set `is_relevant`, `tags`, and `classifier_version` on the RFP

### Scoring Worker

1. For each (contractor, candidate RFP) pair, embed the contractor's profile and goals
2. Call `match_rfp_chunks(...)` to pull the most relevant RFP chunks
3. Call `match_past_projects(...)` to surface relevant prior work from the contractor
4. Pass everything to the LLM, get a 0–100 score and reasoning
5. Insert into `scores` — trigger auto-trims to 100 most recent per contractor

### Next.js Front End

- **Sidebar:** `SELECT * FROM rfps WHERE status = 'active' AND is_relevant = true` with filters on `tags`, `state`, `due_date`, `contract_amount_min/max`; optionally `JOIN scores` for ranked ordering
- **Detail view → Save button:** writes to `saved_rfps`
- **Detail view → PDF viewer:** extracts the file ID from any non-null `pdf_url_N` and embeds via `https://drive.google.com/file/d/<ID>/preview` in an iframe. Drive files must be set to "anyone with the link can view" or the iframe shows a sign-in wall.
- **Generate summary button:** checks `rfp_summaries` first; generates and inserts if missing
- **Profile page:** reads/writes `contractors` and `contractor_past_projects` (RLS handles auth scoping automatically)

---

## RLS Model

| Table | Access |
|---|---|
| `contractors` | Owner only (auth user) |
| `contractor_past_projects` | Owner only |
| `saved_rfps` | Owner only |
| `scores` | Owner only (read); service_role (write) |
| `rfps` | Any authenticated user (read); service_role (write) |
| `rfp_chunks` | Any authenticated user (read); service_role (write) |
| `rfp_amendments` | Any authenticated user (read); service_role (write) |
| `rfp_summaries` | Any authenticated user (read); service_role (write) |
| `department_aliases` | Any authenticated user (read); service_role (write) |

Anon role has no access — sign-in is required.

> **Never expose the service_role key in the browser or frontend code.** It bypasses all RLS. Keep it server-side only (scraper workers, scoring pipeline, etc.).

---

## Embedding Dimensions

The schema defaults to `vector(1536)` (OpenAI `text-embedding-3-small`). Pick one model before loading any data — mismatched dimensions produce silent retrieval bugs.

| Model | Dimensions | Notes |
|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 | Default. Cheap, solid. |
| OpenAI `text-embedding-3-large` | 3072 | Requires `halfvec(3072)` — HNSW index caps `vector` at 2000 dims |
| Voyage `voyage-3-large` | 1024 | Strong retrieval benchmarks |
| Cohere `embed-english-v3.0` | 1024 | |

If you change the model, update `contractor_past_projects.embedding`, `rfp_chunks.embedding`, and both `match_*` function signatures before running migrations.