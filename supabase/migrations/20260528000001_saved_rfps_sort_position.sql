-- Custom ordering for saved RFPs in the profile drawer.
alter table public.saved_rfps
  add column if not exists sort_position integer;

comment on column public.saved_rfps.sort_position is
  'User-defined order in profile (custom sort). Lower values appear first.';

-- Backfill positions from save time so custom sort works for existing rows.
with ranked as (
  select
    contractor_id,
    rfp_id,
    (row_number() over (
      partition by contractor_id
      order by saved_at asc, rfp_id asc
    ) - 1)::integer as pos
  from public.saved_rfps
)
update public.saved_rfps s
set sort_position = ranked.pos
from ranked
where s.contractor_id = ranked.contractor_id
  and s.rfp_id = ranked.rfp_id
  and s.sort_position is null;
