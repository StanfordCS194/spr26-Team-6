-- Adds `exclusions text[]` for contractor "no-go" terms used by the
-- compatibility scoring gate (hard-zero a match when any exclusion term
-- appears in the RFP).

alter table public.contractors
    add column if not exists exclusions text[] not null default '{}';

create index if not exists contractors_exclusions_gin_idx
    on public.contractors using gin (exclusions);
