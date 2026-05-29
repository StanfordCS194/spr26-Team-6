-- Track which RFPs each contractor has viewed, with a timestamp so we can
-- sort by most-recently-viewed and persist history across sessions/devices.

create table public.viewed_rfps (
    id            uuid        primary key default gen_random_uuid(),
    contractor_id uuid        not null references public.contractors(id) on delete cascade,
    rfp_id        uuid        not null references public.rfps(id) on delete cascade,
    viewed_at     timestamptz not null default now(),
    unique (contractor_id, rfp_id)
);

create index viewed_rfps_contractor_viewed_at_idx
    on public.viewed_rfps (contractor_id, viewed_at desc);

alter table public.viewed_rfps enable row level security;

create policy "viewed_rfps_all_own"
    on public.viewed_rfps for all
    to authenticated
    using (
        contractor_id in (
            select id from public.contractors where user_id = auth.uid()
        )
    )
    with check (
        contractor_id in (
            select id from public.contractors where user_id = auth.uid()
        )
    );
