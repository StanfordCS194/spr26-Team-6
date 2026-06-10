-- Track each saved opportunity through the user's bid workflow.
alter table public.saved_rfps
  add column if not exists bid_status text;

update public.saved_rfps
set bid_status = 'reviewing'
where bid_status is null;

alter table public.saved_rfps
  alter column bid_status set default 'reviewing',
  alter column bid_status set not null;

alter table public.saved_rfps
  drop constraint if exists saved_rfps_bid_status_check;

alter table public.saved_rfps
  add constraint saved_rfps_bid_status_check
  check (bid_status in ('reviewing', 'pursuing', 'no_bid', 'submitted'));

comment on column public.saved_rfps.bid_status is
  'User-managed bid workflow status: reviewing, pursuing, no_bid, or submitted.';
