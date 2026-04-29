-- ============================================================================
-- PDF Storage
-- ============================================================================
-- Creates a Supabase Storage bucket for raw PDF files and adds a reference
-- column on rfps so each record can link back to its source document.
--
-- Storage path convention:
--   rfp-pdfs/<source>/<external_id>/<filename>.pdf
--   e.g. rfp-pdfs/sam.gov/W912BU25R0001/solicitation.pdf
--
-- The ingestion pipeline should:
--   1. Upload the PDF to this bucket via the service_role key.
--   2. Write the returned storage path into rfps.pdf_storage_path on upsert.
--
-- The front end can generate a signed URL on demand (never expose the bucket
-- as fully public — PDFs may contain PII like contact info):
--   supabase.storage.from('rfp-pdfs').createSignedUrl(path, 60)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Storage bucket
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'rfp-pdfs',
    'rfp-pdfs',
    false,                          -- private: access via signed URLs only
    52428800,                       -- 50 MB per file limit
    array['application/pdf']        -- PDFs only
)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- Storage RLS policies
-- Authenticated users can read (signed URL generation still requires this).
-- Only service_role can upload/delete — enforced by policy below.
-- ----------------------------------------------------------------------------

-- Authenticated users can read any object in the bucket
create policy "rfp_pdfs_read_authed"
    on storage.objects for select
    to authenticated
    using (bucket_id = 'rfp-pdfs');

-- Only service_role can insert (upload). Service_role bypasses RLS, but this
-- policy prevents any anon or authenticated user from uploading directly.
create policy "rfp_pdfs_insert_service_only"
    on storage.objects for insert
    to authenticated
    with check (false);             -- block all client-side uploads

create policy "rfp_pdfs_delete_service_only"
    on storage.objects for delete
    to authenticated
    using (false);                  -- block all client-side deletes


-- ----------------------------------------------------------------------------
-- Add pdf_storage_path to rfps
-- Nullable — not every RFP will have a PDF (sam.gov API returns structured
-- data directly; PDFs are more common from Cal eProcure / PlanetBids).
-- ----------------------------------------------------------------------------
alter table public.rfps
    add column if not exists pdf_storage_path text,
    add column if not exists pdf_extracted_at timestamptz;

comment on column public.rfps.pdf_storage_path is
    'Path within the rfp-pdfs storage bucket, e.g. sam.gov/W912BU25R0001/solicitation.pdf';

comment on column public.rfps.pdf_extracted_at is
    'Timestamp when OCR/extraction was last run on the PDF. Null = not yet processed.';


-- ----------------------------------------------------------------------------
-- Index — lets the ingestion worker quickly find RFPs with unprocessed PDFs:
--   SELECT * FROM rfps WHERE pdf_storage_path IS NOT NULL
--                        AND pdf_extracted_at IS NULL;
-- ----------------------------------------------------------------------------
create index if not exists rfps_pdf_unprocessed_idx
    on public.rfps (pdf_storage_path)
    where pdf_storage_path is not null and pdf_extracted_at is null;
