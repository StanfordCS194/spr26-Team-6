-- ============================================================================
-- Replace rfp_documents table with 10 flat PDF URL columns on rfps
-- ============================================================================
-- Drops the rfp_documents table (added in migration 000008) in favor of ten
-- nullable URL columns directly on the rfps table. Trade-offs:
--   - No labels or document types stored — just the URLs
--   - 10-document hard cap per RFP
--   - Simpler frontend code: rfp.pdf_url_1 .. rfp.pdf_url_10
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Drop the rfp_documents table and its dependencies
-- ----------------------------------------------------------------------------
drop policy if exists "rfp_documents_select_all_authed" on public.rfp_documents;
drop trigger if exists set_updated_at_rfp_documents     on public.rfp_documents;
drop table  if exists public.rfp_documents              cascade;


-- ----------------------------------------------------------------------------
-- 2. Add 10 nullable PDF URL columns to rfps
-- ----------------------------------------------------------------------------
alter table public.rfps
    add column if not exists pdf_url_1  text,
    add column if not exists pdf_url_2  text,
    add column if not exists pdf_url_3  text,
    add column if not exists pdf_url_4  text,
    add column if not exists pdf_url_5  text,
    add column if not exists pdf_url_6  text,
    add column if not exists pdf_url_7  text,
    add column if not exists pdf_url_8  text,
    add column if not exists pdf_url_9  text,
    add column if not exists pdf_url_10 text;

comment on column public.rfps.pdf_url_1 is
    'Google Drive share URL for the primary RFP PDF (file must be set to "anyone with link"). '
    'pdf_url_2 through pdf_url_10 hold additional documents (addenda, supplementary, etc.). '
    'Null when fewer than the slot number are available.';
