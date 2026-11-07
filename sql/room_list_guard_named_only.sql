-- room_list_guard_named_only.sql — the room-list guard (sql/room_list_guard.sql) keeps a room on a retreat only while a
-- GUEST is in it, not for an empty placeholder row (2026-11-07).
-- Why: Hilario took room 26 off Linda McGrath's and Olivia Grant's lists and it kept coming back (blocked_rooms_log:
-- "kept 26a, 26b") because both had empty, never-filled registrations for those beds, so Lexi Hawks could not get it.
-- Change: portal_reg_rooms() (the rooms the guard re-adds) now counts a registration only when it has at least one guest
-- with a name who is not cancelled. Everything else in the guard stays the same.
-- Undo: run sql/room_list_guard.sql again (it recreates the old portal_reg_rooms).

create or replace function public.portal_reg_rooms(bk text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct r.room), '{}')
  from public.registrations r
  where r.booking_id::text = bk
    and coalesce(r.room, '') <> ''
    and r.cancelled is not true
    and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(r.guests::jsonb) = 'array' then r.guests::jsonb else '[]'::jsonb end) g
      where coalesce(trim(g ->> 'name'), '') <> '' and coalesce(g ->> 'cancelled', 'false') <> 'true'
    )
$$;
