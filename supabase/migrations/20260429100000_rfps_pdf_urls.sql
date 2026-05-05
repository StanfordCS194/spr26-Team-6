-- Optional solicitation PDFs (up to 10 per RFP), separate from rfps.url (listing page).
alter table public.rfps add column if not exists pdf_url_1  text;
alter table public.rfps add column if not exists pdf_url_2  text;
alter table public.rfps add column if not exists pdf_url_3  text;
alter table public.rfps add column if not exists pdf_url_4  text;
alter table public.rfps add column if not exists pdf_url_5  text;
alter table public.rfps add column if not exists pdf_url_6  text;
alter table public.rfps add column if not exists pdf_url_7  text;
alter table public.rfps add column if not exists pdf_url_8  text;
alter table public.rfps add column if not exists pdf_url_9  text;
alter table public.rfps add column if not exists pdf_url_10 text;
