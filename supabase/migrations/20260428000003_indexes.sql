-- ============================================================================
-- Indexes
-- ============================================================================
-- HNSW indexes for vector similarity (better recall than IVFFlat, no training).
-- GIN indexes for array containment and trigram fuzzy search.
-- B-tree for the obvious filter/sort columns surfaced in the UI sidebar.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Vector indexes (cosine distance — pair with `<=>` operator in queries)
-- ----------------------------------------------------------------------------
create index contractor_past_projects_embedding_hnsw_idx
    on public.contractor_past_projects
    using hnsw (embedding vector_cosine_ops);

create index rfp_chunks_embedding_hnsw_idx
    on public.rfp_chunks
    using hnsw (embedding vector_cosine_ops);


-- ----------------------------------------------------------------------------
-- RFP filter / sort indexes
-- These map directly to sidebar filters: location, due date, contract amount, tags.
-- ----------------------------------------------------------------------------
create index rfps_status_idx          on public.rfps (status);
create index rfps_due_date_idx        on public.rfps (due_date);
create index rfps_posted_date_idx     on public.rfps (posted_date desc);
create index rfps_state_idx           on public.rfps (state);
create index rfps_department_idx      on public.rfps (department);
create index rfps_source_idx          on public.rfps (source);
create index rfps_is_relevant_idx     on public.rfps (is_relevant) where is_relevant = true;
create index rfps_amount_idx          on public.rfps (contract_amount_min, contract_amount_max);

-- Tag filtering (e.g. WHERE tags @> ARRAY['cybersecurity'])
create index rfps_tags_gin_idx        on public.rfps using gin (tags);

-- Fuzzy department lookup for the normalizer
create index rfps_department_trgm_idx
    on public.rfps using gin (department gin_trgm_ops);

create index department_aliases_alias_trgm_idx
    on public.department_aliases using gin (alias gin_trgm_ops);


-- ----------------------------------------------------------------------------
-- Score cache lookups
-- ----------------------------------------------------------------------------
create index scores_contractor_score_idx
    on public.scores (contractor_id, score desc);

create index scores_computed_at_idx
    on public.scores (contractor_id, computed_at desc);


-- ----------------------------------------------------------------------------
-- Saved RFPs / past projects lookups
-- ----------------------------------------------------------------------------
create index saved_rfps_contractor_idx
    on public.saved_rfps (contractor_id, saved_at desc);

create index contractor_past_projects_contractor_idx
    on public.contractor_past_projects (contractor_id);


-- ----------------------------------------------------------------------------
-- Contractor preference indexes (used when filtering "RFPs matching my industries")
-- ----------------------------------------------------------------------------
create index contractors_industries_gin_idx
    on public.contractors using gin (industries);

create index contractors_sub_industries_gin_idx
    on public.contractors using gin (sub_industries);
