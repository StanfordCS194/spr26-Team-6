-- ============================================================================
-- Idempotently ensure every compatibility-scoring column exists on
-- `contractors`, then force PostgREST to reload its schema cache.
--
-- Symptom this fixes: client-side updates fail with
--   "Could not find the 'certifications' column of 'contractors' in the
--   schema cache".
-- That happens when an earlier migration added the column but the
-- PostgREST API hasn't reloaded yet. NOTIFY pgrst is the canonical fix in
-- Supabase / PostgREST.
-- ============================================================================

alter table public.contractors
    add column if not exists preferred_response_window_days int,
    add column if not exists certifications        text[] not null default '{}',
    add column if not exists set_aside_eligibility  text[] not null default '{}',
    add column if not exists naics_codes            text[] not null default '{}',
    add column if not exists exclusions             text[] not null default '{}';


-- GIN indexes for array containment / overlap (idempotent).
create index if not exists contractors_certifications_gin_idx
    on public.contractors using gin (certifications);

create index if not exists contractors_set_aside_eligibility_gin_idx
    on public.contractors using gin (set_aside_eligibility);

create index if not exists contractors_naics_codes_gin_idx
    on public.contractors using gin (naics_codes);

create index if not exists contractors_exclusions_gin_idx
    on public.contractors using gin (exclusions);


-- Force PostgREST to reload its schema cache so the REST API sees the new
-- columns immediately. Without this, Supabase clients can return
-- "column not found in schema cache" until the next restart.
notify pgrst, 'reload schema';
