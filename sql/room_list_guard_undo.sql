-- Undo sql/room_list_guard.sql: room lists go back to being written only by the screens. The log table and what it
-- recorded are kept.
drop trigger if exists portal_room_list_keep on public.bookings;
drop trigger if exists portal_reg_room_sync on public.registrations;
drop trigger if exists portal_reg_room_release on public.registrations;
drop function if exists public.portal_reg_room_release();
drop function if exists public.portal_room_list_keep();
drop function if exists public.portal_reg_room_sync();
drop function if exists public.portal_reg_rooms(text);
