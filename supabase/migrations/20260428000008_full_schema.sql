-- ============================================================================
-- Schema additions for full Cal eProcure / scraper output
-- ============================================================================
-- Adds fields surfaced by the actual scraper output (sample.json):
--   - name, statement_of_work, deliverables, location_level: top-level RFP data
--   - metadata: source-specific structured extras (UNSPSC codes, bidder
--     conference info, event metadata, amendments_noted, etc.)
--   - rfp_documents: one row per attached PDF/document on an RFP
--
-- Replaces the single pdf_drive_url column from migration 000007 — RFPs
-- typically have multiple attachments (main RFP, addenda, supplementary docs)
-- and need a proper relational structure.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Loosen the source check constraint
-- The scraper produces human-readable source names ("Cal eProcure",
-- "PlanetBids") that don't match the snake_case values from the original
-- migration. Update the constraint to accept the scraper's canonical values.
-- ----------------------------------------------------------------------------
alter table public.rfps drop constraint if exists rfps_source_check;
alter table public.rfps add constraint rfps_source_check
    check (source in ('sam.gov', 'Cal eProcure', 'PlanetBids', 'other'));


-- ----------------------------------------------------------------------------
-- 2. New top-level columns on rfps
-- ----------------------------------------------------------------------------
alter table public.rfps
    add column if not exists name              text,
    add column if not exists statement_of_work text,
    add column if not exists deliverables      text[] not null default '{}',
    add column if not exists location_level    text,
    add column if not exists metadata          jsonb not null default '{}';

comment on column public.rfps.name is
    'Short descriptive name (e.g. "CalHEERS SDMO system development & operations"). '
    'The "title" column holds the formal title with the RFP number.';

comment on column public.rfps.statement_of_work is
    'Statement of work / scope of services description.';

comment on column public.rfps.deliverables is
    'Array of deliverable bullet points extracted from the RFP.';

comment on column public.rfps.location_level is
    'Geographic granularity: typically city / county / state / federal. '
    'Free-text to allow regional/national/international values without schema changes.';

comment on column public.rfps.metadata is
    'Source-specific structured metadata: event_type, event_version, unspsc_codes, '
    'mandatory_bidder_conference, amendments_noted, etc. Distinct from raw_data, '
    'which holds the unmodified original payload.';


-- ----------------------------------------------------------------------------
-- 3. Remove the single-PDF columns from migration 000007
-- Documents are now properly modeled in the rfp_documents table below.
-- Drop the index first since it references the column.
-- ----------------------------------------------------------------------------
drop index if exists rfps_pdf_unprocessed_idx;

alter table public.rfps
    drop column if exists pdf_drive_url,
    drop column if exists pdf_extracted_at;


-- ----------------------------------------------------------------------------
-- 4. rfp_documents table
-- One row per attached document on an RFP. Common types:
--   'rfp'        — the main RFP package (typically one per RFP)
--   'addendum'   — official addenda / amendments
--   'attachment' — appendices, exhibits, attachments
--   'misc'       — supplementary docs that don't fit above
--   'other'      — fallback
-- ----------------------------------------------------------------------------
create table public.rfp_documents (
    id                uuid primary key default gen_random_uuid(),
    rfp_id            uuid not null references public.rfps(id) on delete cascade,

    label             text not null,                          -- display label, e.g. "Main RFP Package"
    drive_url         text not null,                          -- Google Drive share URL (anyone with link)
    document_type     text not null
                      check (document_type in ('rfp','addendum','attachment','misc','other')),
    sort_order        int  not null default 0,                -- display order in the UI

    pdf_extracted_at  timestamptz,                            -- null = OCR not yet run

    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

comment on table public.rfp_documents is
    'Documents attached to an RFP (main package, addenda, supplementary). '
    'Stored as Google Drive share URLs — files must be set to "anyone with link".';

create index rfp_documents_rfp_id_idx
    on public.rfp_documents (rfp_id, sort_order);

create index rfp_documents_type_idx
    on public.rfp_documents (rfp_id, document_type);

-- OCR worker queue: documents not yet extracted
create index rfp_documents_unprocessed_idx
    on public.rfp_documents (rfp_id)
    where pdf_extracted_at is null;

-- updated_at trigger (function defined in migration 000004)
create trigger set_updated_at_rfp_documents
    before update on public.rfp_documents
    for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 5. RLS for rfp_documents
-- Same model as rfps: any authenticated user can read; writes via service_role
-- ----------------------------------------------------------------------------
alter table public.rfp_documents enable row level security;

create policy "rfp_documents_select_all_authed"
    on public.rfp_documents for select
    to authenticated
    using (true);


-- ----------------------------------------------------------------------------
-- 6. Index for metadata querying
-- Lets you efficiently filter on UNSPSC codes, event_type, etc.
-- Example: SELECT * FROM rfps WHERE metadata @> '{"event_type": "Sell Event / RFx"}'
-- ----------------------------------------------------------------------------
create index rfps_metadata_gin_idx
    on public.rfps using gin (metadata);
