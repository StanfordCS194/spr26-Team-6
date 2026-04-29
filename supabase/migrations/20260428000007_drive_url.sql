-- ============================================================================
-- Replace PDF Storage Bucket with Google Drive URL Approach
-- ============================================================================
-- Reverses migration 000006 (Supabase storage bucket for PDFs) in favor of
-- storing a Google Drive share URL instead. Reasoning:
--   - RFPs are public solicitations, so Drive's "anyone with link" sharing
--     is appropriate.
--   - Avoids Supabase storage cost and bandwidth.
--   - Frontend can embed the PDF via Drive's /preview endpoint in an iframe
--     with no extra libraries.
--
-- The existing rfps.url column continues to hold the original source URL
-- (sam.gov page, Cal eProcure listing, etc.) as a fallback when no Drive
-- copy exists.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Tear down the storage bucket and its policies
-- ----------------------------------------------------------------------------
drop policy if exists "rfp_pdfs_read_authed"         on storage.objects;
drop policy if exists "rfp_pdfs_insert_service_only" on storage.objects;
drop policy if exists "rfp_pdfs_delete_service_only" on storage.objects;


-- ----------------------------------------------------------------------------
-- Drop the old pdf_storage_path index and column
-- pdf_extracted_at stays — still tracks OCR completion regardless of source
-- ----------------------------------------------------------------------------
drop index if exists rfps_pdf_unprocessed_idx;

alter table public.rfps
    drop column if exists pdf_storage_path;


-- ----------------------------------------------------------------------------
-- Add pdf_drive_url
-- Null = no Drive copy. Frontend should fall back to rfps.url in that case.
-- Sharing on the Drive file MUST be set to "anyone with link" or the iframe
-- preview will show a sign-in wall.
-- ----------------------------------------------------------------------------
alter table public.rfps
    add column if not exists pdf_drive_url text;

comment on column public.rfps.pdf_drive_url is
    'Google Drive share URL for the PDF (file must be set to "anyone with link"). '
    'Frontend extracts the file ID and embeds via /preview iframe. '
    'Null when no Drive copy exists — frontend should fall back to rfps.url.';

comment on column public.rfps.url is
    'Original source URL of the RFP (sam.gov solicitation page, Cal eProcure listing, etc.). '
    'Used as a fallback when pdf_drive_url is null.';


-- ----------------------------------------------------------------------------
-- Recreate the unprocessed-PDF index against pdf_drive_url
-- The OCR worker queries this to find PDFs that need extraction:
--   SELECT * FROM rfps
--    WHERE pdf_drive_url IS NOT NULL
--      AND pdf_extracted_at IS NULL;
-- ----------------------------------------------------------------------------
create index if not exists rfps_pdf_unprocessed_idx
    on public.rfps (pdf_drive_url)
    where pdf_drive_url is not null and pdf_extracted_at is null;


-- ----------------------------------------------------------------------------
-- Helper: extract the Drive file ID from a share URL
-- Handles the three common Drive URL shapes:
--   https://drive.google.com/file/d/<ID>/view?usp=sharing
--   https://drive.google.com/open?id=<ID>
--   https://drive.google.com/uc?id=<ID>&export=download
-- Returns null if no ID can be parsed.
-- ----------------------------------------------------------------------------
create or replace function public.drive_file_id(drive_url text)
returns text
language sql immutable
as $$
    select coalesce(
        substring(drive_url from '/file/d/([^/?]+)'),
        substring(drive_url from '[?&]id=([^&]+)')
    );
$$;
