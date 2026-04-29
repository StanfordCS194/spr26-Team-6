# Supabase setup — RFP discovery platform

Drop-in migrations + types for the contractor/RFP matching platform.

## What's here

```
supabase/
  migrations/
    20260428000001_extensions.sql   -- pgvector, pg_trgm, pgcrypto
    20260428000002_schema.sql       -- all tables
    20260428000003_indexes.sql      -- HNSW vector + GIN/B-tree indexes
    20260428000004_functions.sql    -- RPCs, triggers, score-cache trim
    20260428000005_rls_policies.sql -- per-user access control
  seed.sql                          -- starter department aliases
lib/
  database.types.ts                 -- TypeScript types for supabase-js
```

## Tables (mapped to your spec)

| Spec item | Table |
|---|---|
| Contractor profile, prefs, goals | `contractors` |
| Past performance (for RAG) | `contractor_past_projects` *(has `embedding`)* |
| Saved projects | `saved_rfps` |
| RFP record (title, location, due date, dept, contact, etc.) | `rfps` |
| RFP chunks for vector | `rfp_chunks` *(has `embedding`)* |
| Amendments / update detection | `rfp_amendments` + `rfps.content_hash` |
| Score cache (100 most recent) | `scores` *(trimmed by trigger)* |
| LLM summary cache | `rfp_summaries` |
| Department normalization | `department_aliases` + `normalize_department()` |

## How to apply

**Option A — Supabase CLI (recommended):**
```bash
supabase init                 # if you haven't already
# drop the migrations into supabase/migrations/
supabase db push              # against linked remote project
# or
supabase db reset             # against local dev (also runs seed.sql)
```

**Option B — SQL editor in the dashboard:**
Run the five migration files in order, then `seed.sql`.

## Embedding dimensions — pick one and commit

Schema defaults to `vector(1536)` (OpenAI `text-embedding-3-small`). If you
use a different model, change it everywhere it appears (`contractor_past_projects.embedding`,
`rfp_chunks.embedding`, both `match_*` function signatures) **before** loading any data.

| Model | Dim | Notes |
|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 | Default. Cheap, solid. |
| OpenAI `text-embedding-3-large` | 3072 | Use `halfvec(3072)` — HNSW caps `vector` at 2000 dims. |
| Voyage `voyage-3-large` | 1024 | Strong on retrieval benchmarks. |
| Cohere `embed-english-v3.0` | 1024 | |

## How your pipeline uses this

**Scrapers (sam.gov, Cal eProcure, PlanetBids):**
1. Use the **service_role** key — bypasses RLS.
2. Normalize department: `select normalize_department_fuzzy('CA DoT')`.
3. Compute a `content_hash` from normalized fields you care about for amendments.
4. Upsert into `rfps` on `(source, external_id)`.
5. If `content_hash` changed, call `record_rfp_amendment(...)`.
6. Chunk + embed the description, write to `rfp_chunks`.
7. Run the classifier; set `is_relevant`, `tags`, `classifier_version` on the RFP.

**Scoring worker:**
1. For each (contractor, candidate RFP) pair, embed the contractor's profile/goals.
2. Call `match_rfp_chunks(...)` to pull the most relevant chunks of that RFP.
3. For each chunk, call `match_past_projects(query_embedding, filter_contractor_id => ...)` to surface relevant past performance.
4. Pass everything to the LLM, get a 0–100 score + reasoning.
5. Insert into `scores` — the trigger trims the cache to 100 most recent automatically.

**Next.js front end:**
- Sidebar: `select * from rfps where status = 'active' and is_relevant = true order by ...` with filters on `tags`, `state`, `due_date`, `contract_amount_min`/`max`. Optionally `inner join scores` on the current contractor for ranking.
- Detail view → save button writes to `saved_rfps`.
- Generate summary button → check `rfp_summaries` first, generate + insert if missing.
- Profile page → reads/writes `contractors` and `contractor_past_projects` (RLS handles auth).

## RLS model

- **User-owned** (`contractors`, `contractor_past_projects`, `saved_rfps`, `scores`) — only the owning auth user can access.
- **Public-to-authed** (`rfps`, `rfp_chunks`, `rfp_amendments`, `rfp_summaries`, `department_aliases`) — read-only for any signed-in user; writes go through `service_role`.

Anon role has no access — sign-in is required.

## Things you probably want to do next

- Decide and pin the embedding model. Mismatched dims = silent retrieval bugs.
- Wire `supabase_realtime` if you want the sidebar to live-update as new RFPs come in: `alter publication supabase_realtime add table public.rfps;`.
- Add a cron (`pg_cron`) to mark RFPs `closed` once `due_date < now()`.
- Expand `seed.sql` as your scrapers encounter new department spellings.
