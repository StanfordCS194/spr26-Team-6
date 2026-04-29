-- ============================================================================
-- Schema
-- ============================================================================
-- NOTE on vector dimensions:
--   OpenAI text-embedding-3-small  → 1536  (default below)
--   OpenAI text-embedding-3-large  → 3072  (use halfvec(3072) instead, HNSW caps at 2000 for vector)
--   Voyage voyage-3 / voyage-3-large → 1024
--   Cohere embed-english-v3.0      → 1024
-- Pick one model and stick with it; mismatched dims = corrupt search results.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- contractors
-- One row per signed-up user. Holds preferences/goals used for matching.
-- ----------------------------------------------------------------------------
create table public.contractors (
    id                       uuid primary key default gen_random_uuid(),
    user_id                  uuid not null unique references auth.users(id) on delete cascade,
    company_name             text not null,
    description              text,
    website_url              text,
    linkedin_url             text,

    -- preference / targeting fields used by the classifier + scorer
    industries               text[] not null default '{}',     -- e.g. {'Information Technology','Cybersecurity'}
    sub_industries           text[] not null default '{}',     -- e.g. {'SOC','Penetration Testing','Cloud Security'}
    goals                    text,                              -- free-text goals
    preferred_locations      text[] not null default '{}',     -- e.g. {'California','Federal'}
    preferred_contract_min   numeric,
    preferred_contract_max   numeric,

    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- contractor_past_projects
-- Past performance — embedded for RAG when scoring an RFP against a contractor.
-- ----------------------------------------------------------------------------
create table public.contractor_past_projects (
    id              uuid primary key default gen_random_uuid(),
    contractor_id   uuid not null references public.contractors(id) on delete cascade,

    project_name    text not null,
    description     text,
    client          text,                  -- normalized / canonical name (see department_aliases)
    start_date      date,
    end_date        date,
    contract_value  numeric,
    tags            text[] not null default '{}',

    -- embedding of (project_name + description + client + tags) for similarity search
    embedding       vector(1536),

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- rfps
-- Canonical RFP record. Scrapers upsert here keyed on (source, external_id).
-- raw_data holds the untouched payload from the source so we can re-process later.
-- ----------------------------------------------------------------------------
create table public.rfps (
    id                   uuid primary key default gen_random_uuid(),

    -- source provenance
    source               text not null check (source in ('sam.gov','cal_eprocure','planetbids','other')),
    external_id          text not null,                 -- e.g. SAM solicitation number
    url                  text,

    -- core fields shown in the sidebar / detail view
    title                text not null,
    description          text,
    location             text,                          -- free-text "City, State"
    state                text,                          -- 2-letter or full name (standardized on insert)
    department           text,                          -- canonical full name, no abbreviations
    due_date             timestamptz,
    posted_date          timestamptz,
    contract_amount_min  numeric,
    contract_amount_max  numeric,

    -- classifier output
    tags                 text[] not null default '{}',  -- e.g. {'cybersecurity','cloud','soc-2'}
    is_relevant          boolean,                       -- classifier verdict; null = not yet classified
    classifier_version   text,

    -- contact
    contact_name         text,
    contact_email        text,
    contact_phone        text,

    -- raw + change-detection
    raw_data             jsonb,
    content_hash         text,                          -- hash of normalized content; changes → amendment

    -- lifecycle
    status               text not null default 'active'
                         check (status in ('active','closed','cancelled','awarded','amended')),
    last_amended_at      timestamptz,

    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),

    unique (source, external_id)
);


-- ----------------------------------------------------------------------------
-- rfp_chunks
-- Chunked RFP text + embeddings. One RFP → many chunks.
-- This is what gets matched against contractor past projects.
-- ----------------------------------------------------------------------------
create table public.rfp_chunks (
    id           uuid primary key default gen_random_uuid(),
    rfp_id       uuid not null references public.rfps(id) on delete cascade,
    chunk_index  int  not null,
    chunk_text   text not null,
    embedding    vector(1536),
    metadata     jsonb not null default '{}',           -- e.g. {section: "Statement of Work", page: 3}
    created_at   timestamptz not null default now(),
    unique (rfp_id, chunk_index)
);


-- ----------------------------------------------------------------------------
-- rfp_amendments
-- Detected updates to an RFP. Triggered when content_hash changes.
-- ----------------------------------------------------------------------------
create table public.rfp_amendments (
    id                uuid primary key default gen_random_uuid(),
    rfp_id            uuid not null references public.rfps(id) on delete cascade,
    amendment_number  text,
    description       text,
    changes           jsonb,                            -- structured diff: {field: {old, new}}
    detected_at       timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- saved_rfps
-- Junction table: contractor "saves" an RFP to their profile.
-- ----------------------------------------------------------------------------
create table public.saved_rfps (
    contractor_id  uuid not null references public.contractors(id) on delete cascade,
    rfp_id         uuid not null references public.rfps(id) on delete cascade,
    notes          text,
    saved_at       timestamptz not null default now(),
    primary key (contractor_id, rfp_id)
);


-- ----------------------------------------------------------------------------
-- scores
-- Cache of contractor↔RFP match scores. Spec: keep 100 most recent per contractor.
-- A trigger (see functions migration) trims older rows on insert.
-- ----------------------------------------------------------------------------
create table public.scores (
    id              uuid primary key default gen_random_uuid(),
    contractor_id   uuid not null references public.contractors(id) on delete cascade,
    rfp_id          uuid not null references public.rfps(id) on delete cascade,
    score           numeric not null check (score >= 0 and score <= 100),
    reasoning       text,                                -- LLM-generated short explanation
    factors         jsonb,                               -- structured breakdown
    model_version   text,
    computed_at     timestamptz not null default now(),
    unique (contractor_id, rfp_id)
);


-- ----------------------------------------------------------------------------
-- rfp_summaries
-- Cached LLM-generated summaries (so we don't regenerate per click).
-- summary_type lets you store multiple flavors (e.g. "general", "executive", "technical").
-- ----------------------------------------------------------------------------
create table public.rfp_summaries (
    id              uuid primary key default gen_random_uuid(),
    rfp_id          uuid not null references public.rfps(id) on delete cascade,
    summary         text not null,
    summary_type    text not null default 'general',
    model           text,
    prompt_version  text,
    generated_at    timestamptz not null default now(),
    unique (rfp_id, summary_type, prompt_version)
);


-- ----------------------------------------------------------------------------
-- department_aliases
-- Lookup table for the standardization step in your spec.
-- "Dept. of Technology" / "CA DoT" → "California Department of Technology"
-- Seed this table; the normalize_department() function reads from it.
-- ----------------------------------------------------------------------------
create table public.department_aliases (
    id              uuid primary key default gen_random_uuid(),
    canonical_name  text not null,
    alias           text not null unique,
    created_at      timestamptz not null default now()
);
