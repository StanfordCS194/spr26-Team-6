-- viewed_rfps was added after grants_authenticated.sql; authenticated role needs
-- table privileges before RLS policies apply (same pattern as saved_rfps).

grant select, insert, update, delete on table public.viewed_rfps to authenticated;
