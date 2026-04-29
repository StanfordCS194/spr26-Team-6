-- ============================================================================
-- Functions and Triggers
-- ============================================================================


-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger set_updated_at_contractors
    before update on public.contractors
    for each row execute function public.set_updated_at();

create trigger set_updated_at_contractor_past_projects
    before update on public.contractor_past_projects
    for each row execute function public.set_updated_at();

create trigger set_updated_at_rfps
    before update on public.rfps
    for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- match_rfp_chunks
-- Vector similarity search across RFP chunks. Returns the most relevant chunks
-- for a given query embedding (e.g. embedded contractor profile or past project).
--
-- Usage from supabase-js:
--   supabase.rpc('match_rfp_chunks', {
--     query_embedding: [...],
--     match_threshold: 0.75,
--     match_count: 20
--   })
-- ----------------------------------------------------------------------------
create or replace function public.match_rfp_chunks(
    query_embedding   vector(1536),
    match_threshold   float default 0.7,
    match_count       int   default 10,
    filter_rfp_ids    uuid[] default null
)
returns table (
    id          uuid,
    rfp_id      uuid,
    chunk_text  text,
    metadata    jsonb,
    similarity  float
)
language sql stable
as $$
    select
        c.id,
        c.rfp_id,
        c.chunk_text,
        c.metadata,
        1 - (c.embedding <=> query_embedding) as similarity
    from public.rfp_chunks c
    where c.embedding is not null
      and (filter_rfp_ids is null or c.rfp_id = any(filter_rfp_ids))
      and 1 - (c.embedding <=> query_embedding) > match_threshold
    order by c.embedding <=> query_embedding
    limit match_count;
$$;


-- ----------------------------------------------------------------------------
-- match_past_projects
-- Vector similarity over a contractor's past projects. Used during scoring to
-- find their most relevant prior work for a given RFP chunk/requirement.
-- ----------------------------------------------------------------------------
create or replace function public.match_past_projects(
    query_embedding        vector(1536),
    match_threshold        float default 0.7,
    match_count            int   default 10,
    filter_contractor_id   uuid  default null
)
returns table (
    id            uuid,
    contractor_id uuid,
    project_name  text,
    description   text,
    similarity    float
)
language sql stable
as $$
    select
        p.id,
        p.contractor_id,
        p.project_name,
        p.description,
        1 - (p.embedding <=> query_embedding) as similarity
    from public.contractor_past_projects p
    where p.embedding is not null
      and (filter_contractor_id is null or p.contractor_id = filter_contractor_id)
      and 1 - (p.embedding <=> query_embedding) > match_threshold
    order by p.embedding <=> query_embedding
    limit match_count;
$$;


-- ----------------------------------------------------------------------------
-- normalize_department
-- Returns the canonical department name for a given alias. Falls back to the
-- input if no alias is found. Case-insensitive exact match first; you can
-- extend this with trigram similarity if needed.
-- ----------------------------------------------------------------------------
create or replace function public.normalize_department(input_name text)
returns text
language sql stable
as $$
    select coalesce(
        (select canonical_name
           from public.department_aliases
          where lower(alias) = lower(trim(input_name))
          limit 1),
        trim(input_name)
    );
$$;


-- ----------------------------------------------------------------------------
-- normalize_department_fuzzy
-- Trigram-based fuzzy fallback when the exact alias isn't in the table.
-- Returns the canonical name with the highest similarity above threshold.
-- Use this in your data-processing layer before insert/upsert.
-- ----------------------------------------------------------------------------
create or replace function public.normalize_department_fuzzy(
    input_name  text,
    threshold   float default 0.6
)
returns text
language sql stable
as $$
    with exact as (
        select canonical_name
          from public.department_aliases
         where lower(alias) = lower(trim(input_name))
         limit 1
    ),
    fuzzy as (
        select canonical_name,
               similarity(alias, input_name) as sim
          from public.department_aliases
         where similarity(alias, input_name) > threshold
         order by sim desc
         limit 1
    )
    select coalesce(
        (select canonical_name from exact),
        (select canonical_name from fuzzy),
        trim(input_name)
    );
$$;


-- ----------------------------------------------------------------------------
-- trim_scores_cache
-- Spec: keep 100 most recent scores per contractor.
-- After each insert, prune anything beyond the top 100 by computed_at.
-- ----------------------------------------------------------------------------
create or replace function public.trim_scores_cache()
returns trigger
language plpgsql
as $$
begin
    delete from public.scores
     where contractor_id = new.contractor_id
       and id not in (
           select id
             from public.scores
            where contractor_id = new.contractor_id
            order by computed_at desc
            limit 100
       );
    return new;
end;
$$;

create trigger trim_scores_after_insert
    after insert on public.scores
    for each row execute function public.trim_scores_cache();


-- ----------------------------------------------------------------------------
-- record_rfp_amendment
-- Helper for the scraper to call when it detects a content_hash change.
-- Updates the RFP and writes an amendment row in one go.
-- ----------------------------------------------------------------------------
create or replace function public.record_rfp_amendment(
    p_rfp_id            uuid,
    p_amendment_number  text,
    p_description       text,
    p_changes           jsonb,
    p_new_content_hash  text
)
returns uuid
language plpgsql
as $$
declare
    amendment_id uuid;
begin
    insert into public.rfp_amendments (rfp_id, amendment_number, description, changes)
    values (p_rfp_id, p_amendment_number, p_description, p_changes)
    returning id into amendment_id;

    update public.rfps
       set content_hash    = p_new_content_hash,
           last_amended_at = now(),
           status          = 'amended'
     where id = p_rfp_id;

    return amendment_id;
end;
$$;
