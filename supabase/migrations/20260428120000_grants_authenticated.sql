-- ============================================================================
-- Table privileges for PostgREST / supabase-js (authenticated role)
-- ============================================================================
-- RLS policies only apply *after* the session role has base privileges on the
-- table. Without GRANT, Postgres returns:
--   permission denied for table contractors
-- before any policy runs.
-- ============================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.contractors to authenticated;
grant select, insert, update, delete on table public.contractor_past_projects to authenticated;
grant select, insert, update, delete on table public.rfps to authenticated;
grant select, insert, update, delete on table public.rfp_chunks to authenticated;
grant select, insert, update, delete on table public.rfp_amendments to authenticated;
grant select, insert, update, delete on table public.saved_rfps to authenticated;
grant select, insert, update, delete on table public.scores to authenticated;
grant select, insert, update, delete on table public.rfp_summaries to authenticated;
grant select, insert, update, delete on table public.department_aliases to authenticated;
