-- ============================================================================
-- Contractor eligibility + timing fields for compatibility scoring
-- ============================================================================
-- Adds the client-side inputs required by the 5-category compatibility score:
--   Cat 1 (Timing):  preferred_response_window_days
--   Cat 5 (Prereqs): certifications, set_aside_eligibility, naics_codes
-- ============================================================================

alter table public.contractors
    add column if not exists preferred_response_window_days int,
    add column if not exists certifications        text[] not null default '{}',
    add column if not exists set_aside_eligibility  text[] not null default '{}',
    add column if not exists naics_codes            text[] not null default '{}';


-- GIN indexes for array containment / overlap checks during scoring
create index if not exists contractors_certifications_gin_idx
    on public.contractors using gin (certifications);

create index if not exists contractors_set_aside_eligibility_gin_idx
    on public.contractors using gin (set_aside_eligibility);

create index if not exists contractors_naics_codes_gin_idx
    on public.contractors using gin (naics_codes);
