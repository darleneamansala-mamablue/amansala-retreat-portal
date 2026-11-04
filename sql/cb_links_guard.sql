-- cb_links_guard.sql — a booking never loses the link between one of its rooms and that room's Cloudbeds reservation
-- because some screen saved an old copy (2026-11-04).
-- Why: Heather Rex's retreat (Feb 7-11) lost the links of room 10 (Heather & David) and CH4 (the Colazzis) the morning
-- after they were made; the Cloudbeds reservations were fine, only bookings.cb_reservation_ids had lost the two keys.
-- The save that did it could not be reproduced with the current code, so this guards it in the database, whatever screen
-- or server function writes the row.
--   1. A change to a booking that drops a room's link (the key is gone) while that room is still on the booking's room
--      list, the dates did not change, the booking is not cancelled, and that reservation is not now linked to another
--      room of the booking (a room move) gets the link put back.
--   2. To unlink a room on purpose, write that room's key with null (or ""): it is then removed, never put back.
--   3. Every link put back and every unlink on purpose is written to cb_links_log: booking, rooms, who, page, browser.
-- Not touched: removing a room from the list (its link may go with it), changing dates, cancelling, moving a link to
-- another room. Undo: sql/cb_links_guard_undo.sql

create table if not exists public.cb_links_log (
  id bigserial primary key,
  booking_id text not null,
  at timestamptz not null default now(),
  who text,
  page text,
  agent text,
  restored jsonb,
  unlinked jsonb
);
create index if not exists cb_links_log_at on public.cb_links_log (at desc);
alter table public.cb_links_log enable row level security;
drop policy if exists portal_signed_in on public.cb_links_log;
create policy portal_signed_in on public.cb_links_log for select to authenticated using (public.portal_signed_in());

create or replace function public.portal_cb_links_keep() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := coalesce(to_jsonb(old.cb_reservation_ids), '{}'::jsonb);
  n jsonb := coalesce(to_jsonb(new.cb_reservation_ids), '{}'::jsonb);
  restored jsonb := '{}'::jsonb;
  unlinked jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  who text;
  hdr jsonb;
begin
  -- the whole guard is best effort: whatever goes wrong in it, the save itself always goes through unchanged
  begin
  if jsonb_typeof(o) <> 'object' or jsonb_typeof(n) <> 'object' then
    return new;
  end if;
  -- 1. put back links dropped by an old copy
  if coalesce(new.status, '') <> 'cancelled'
     and new.start_date is not distinct from old.start_date
     and new.end_date is not distinct from old.end_date then
    for k, v in select * from jsonb_each(o) loop
      if v is null or v = 'null'::jsonb or v = '""'::jsonb then continue; end if;
      if n ? k then continue; end if;                                          -- still there, replaced, or unlinked on purpose
      if not (k = any (coalesce(new.blocked_rooms, '{}'))) then continue; end if;   -- room left the list
      if exists (select 1 from jsonb_each(n) e where e.value #>> '{}' = v #>> '{}') then continue; end if;   -- moved to another room
      restored := restored || jsonb_build_object(k, v);
    end loop;
  end if;
  -- 2. unlink on purpose: keys written as null / ""
  for k, v in select * from jsonb_each(n) loop
    if v = 'null'::jsonb or v = '""'::jsonb then
      unlinked := unlinked || jsonb_build_object(k, coalesce(o -> k, 'null'::jsonb));
    end if;
  end loop;
  if restored = '{}'::jsonb and unlinked = '{}'::jsonb then
    return new;
  end if;
  n := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(n || restored) e
        where e.value <> 'null'::jsonb and e.value <> '""'::jsonb);
  new := jsonb_populate_record(new, jsonb_build_object('cb_reservation_ids', n));
  begin
    who := coalesce(nullif(auth.jwt() ->> 'name', ''), nullif(auth.jwt() ->> 'sub', ''), nullif(auth.jwt() ->> 'app_role', ''), current_user);
  exception when others then
    who := current_user;
  end;
  begin
    hdr := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    hdr := null;
  end;
  insert into public.cb_links_log (booking_id, who, page, agent, restored, unlinked)
  values (new.id::text, who, left(coalesce(hdr ->> 'referer', hdr ->> 'origin'), 300), left(hdr ->> 'user-agent', 300),
          nullif(restored, '{}'::jsonb), nullif(unlinked, '{}'::jsonb));
  return new;
  exception when others then
    raise warning 'portal_cb_links_keep: %', sqlerrm;
    return new;
  end;
end $$;

-- "zz" so it runs after portal_room_list_keep (room_list_guard.sql), which may put rooms back on the list first
drop trigger if exists portal_zz_cb_links_keep on public.bookings;
create trigger portal_zz_cb_links_keep before update of cb_reservation_ids on public.bookings
  for each row execute function public.portal_cb_links_keep();

-- Check (changes nothing: everything is rolled back). Takes the link of room 10 away from Heather Rex Feb 7-11 and shows
-- it came back, then unlinks it on purpose (null) and shows it is gone. Expect: put_back = 8891035629537, unlinked = null.
-- begin;
-- update public.bookings set cb_reservation_ids = cb_reservation_ids::jsonb - '10' where id = '56ed4c2c-b9de-42e5-bb2e-0d5e89c935b5';
-- select cb_reservation_ids ->> '10' as put_back from public.bookings where id = '56ed4c2c-b9de-42e5-bb2e-0d5e89c935b5';
-- update public.bookings set cb_reservation_ids = jsonb_set(cb_reservation_ids::jsonb, '{10}', 'null') where id = '56ed4c2c-b9de-42e5-bb2e-0d5e89c935b5';
-- select cb_reservation_ids ->> '10' as unlinked from public.bookings where id = '56ed4c2c-b9de-42e5-bb2e-0d5e89c935b5';
-- rollback;
