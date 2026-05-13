-- ============================================================================
-- RAG: allow authenticated clients to call vector match RPCs via PostgREST
-- ============================================================================
-- Table grants alone are insufficient; supabase.rpc requires EXECUTE on the
-- function. Grant by resolved regprocedure so argument types stay correct.
-- ============================================================================

do $$
declare
  fn text;
begin
  for fn in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('match_rfp_chunks', 'match_past_projects')
  loop
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end$$;
