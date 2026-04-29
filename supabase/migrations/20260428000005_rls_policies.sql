-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- Strategy:
--   - User-owned rows (contractors, past projects, saved_rfps, scores):
--     accessible only to the owning auth user.
--   - Public-ish rows (rfps, rfp_chunks, rfp_amendments, rfp_summaries,
--     department_aliases): readable by any authenticated user, writable
--     only via service_role (your scrapers/ingestion workers).
--
-- service_role bypasses RLS, so scrapers writing through the service key
-- don't need any policies — that's intentional.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Enable RLS on every table
-- ----------------------------------------------------------------------------
alter table public.contractors             enable row level security;
alter table public.contractor_past_projects enable row level security;
alter table public.rfps                    enable row level security;
alter table public.rfp_chunks              enable row level security;
alter table public.rfp_amendments          enable row level security;
alter table public.rfp_summaries           enable row level security;
alter table public.saved_rfps              enable row level security;
alter table public.scores                  enable row level security;
alter table public.department_aliases      enable row level security;


-- ----------------------------------------------------------------------------
-- contractors: user can CRUD their own row
-- ----------------------------------------------------------------------------
create policy "contractors_select_own"
    on public.contractors for select
    to authenticated
    using (auth.uid() = user_id);

create policy "contractors_insert_own"
    on public.contractors for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "contractors_update_own"
    on public.contractors for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "contractors_delete_own"
    on public.contractors for delete
    to authenticated
    using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- contractor_past_projects: only the owning contractor
-- ----------------------------------------------------------------------------
create policy "past_projects_all_own"
    on public.contractor_past_projects for all
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


-- ----------------------------------------------------------------------------
-- rfps / rfp_chunks / rfp_amendments / rfp_summaries: read-only for users
-- Writes happen via service_role from the ingestion pipeline.
-- ----------------------------------------------------------------------------
create policy "rfps_select_all_authed"
    on public.rfps for select
    to authenticated
    using (true);

create policy "rfp_chunks_select_all_authed"
    on public.rfp_chunks for select
    to authenticated
    using (true);

create policy "rfp_amendments_select_all_authed"
    on public.rfp_amendments for select
    to authenticated
    using (true);

create policy "rfp_summaries_select_all_authed"
    on public.rfp_summaries for select
    to authenticated
    using (true);


-- ----------------------------------------------------------------------------
-- saved_rfps: only the owning contractor
-- ----------------------------------------------------------------------------
create policy "saved_rfps_all_own"
    on public.saved_rfps for all
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


-- ----------------------------------------------------------------------------
-- scores: contractor can read their own; writes via service_role only
-- ----------------------------------------------------------------------------
create policy "scores_select_own"
    on public.scores for select
    to authenticated
    using (
        contractor_id in (
            select id from public.contractors where user_id = auth.uid()
        )
    );


-- ----------------------------------------------------------------------------
-- department_aliases: read-only reference data
-- ----------------------------------------------------------------------------
create policy "department_aliases_select_all_authed"
    on public.department_aliases for select
    to authenticated
    using (true);
