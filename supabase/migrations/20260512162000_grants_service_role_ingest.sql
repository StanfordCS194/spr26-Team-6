-- Grants needed by one-off/server-side ingestion scripts that use the
-- Supabase service role key through PostgREST.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.rfps to service_role;
grant select, insert, update, delete on table public.rfp_documents to service_role;
grant select, insert, update, delete on table public.rfp_summaries to service_role;
