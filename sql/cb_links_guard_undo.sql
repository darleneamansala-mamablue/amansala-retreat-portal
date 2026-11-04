-- Undo sql/cb_links_guard.sql: Cloudbeds links go back to being written only by the screens. The log table and what it
-- recorded are kept.
drop trigger if exists portal_zz_cb_links_keep on public.bookings;
drop function if exists public.portal_cb_links_keep();
