-- room_list_guard.sql — a retreat's room list (bookings.blocked_rooms) always holds the rooms its guests are in (2026-11-03).
-- Why: guests "disappeared" from the teacher portal, Transport and the room list whenever someone moved them to a room
-- that was not on the list (Heather Rex, Oct 8), or an old tab saved an old list over the real one. Fixing each screen
-- one by one kept missing some; this does it in the database, whatever screen or server function did the write.
--   1. Any change to a booking's room list keeps every room a guest row of that booking is in (re-added if missing).
--   2. A guest row put in a room (new, moved, or moved to another booking) adds that room to its booking's list; the
--      room it left is taken off when no other row of that booking is still in it (the same swap the Rooms screen does).
--   3. Every change to a room list is written to blocked_rooms_log: before, after, what was re-added, who, when.
-- Not touched: cancelled bookings, cancelled guest rows, rows with no room. Deleting a guest row changes nothing here.
-- Undo: sql/room_list_guard_undo.sql

create table if not exists public.blocked_rooms_log (
  id bigserial primary key,
  booking_id text not null,
  at timestamptz not null default now(),
  who text,
  source text,
  old_rooms text[],
  new_rooms text[],
  added text[],
  removed text[],
  kept text[]
);
create index if not exists blocked_rooms_log_booking on public.blocked_rooms_log (booking_id, at desc);
alter table public.blocked_rooms_log enable row level security;
drop policy if exists portal_signed_in on public.blocked_rooms_log;
create policy portal_signed_in on public.blocked_rooms_log for select to authenticated using (public.portal_signed_in());

-- the rooms guest rows of a booking are in
create or replace function public.portal_reg_rooms(bk text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct r.room), '{}')
  from public.registrations r
  where r.booking_id::text = bk and coalesce(r.room, '') <> '' and r.cancelled is not true
$$;

create or replace function public.portal_room_list_keep() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  want text[] := coalesce(new.blocked_rooms, '{}');
  missing text[];
  who text;
begin
  if coalesce(new.status, '') <> 'cancelled' then
    select coalesce(array_agg(x), '{}') into missing
    from unnest(public.portal_reg_rooms(new.id::text)) x
    where not (x = any (want));
    if array_length(missing, 1) > 0 then
      new.blocked_rooms := want || missing;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.blocked_rooms is not distinct from old.blocked_rooms then
    return new;
  end if;
  begin
    who := coalesce(nullif(auth.jwt() ->> 'name', ''), nullif(auth.jwt() ->> 'app_role', ''), current_user);
  exception when others then
    who := current_user;
  end;
  insert into public.blocked_rooms_log (booking_id, who, source, old_rooms, new_rooms, added, removed, kept)
  values (
    new.id::text, who,
    coalesce(nullif(current_setting('portal.room_list_source', true), ''), 'save'),
    case when tg_op = 'UPDATE' then old.blocked_rooms end,
    new.blocked_rooms,
    array(select x from unnest(coalesce(new.blocked_rooms, '{}')) x
          where tg_op = 'INSERT' or not (x = any (coalesce(old.blocked_rooms, '{}')))),
    array(select x from unnest(case when tg_op = 'UPDATE' then coalesce(old.blocked_rooms, '{}') else '{}' end) x
          where not (x = any (coalesce(new.blocked_rooms, '{}')))),
    coalesce(missing, '{}')
  );
  return new;
end $$;

create or replace function public.portal_reg_room_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  moved boolean := tg_op = 'UPDATE' and (old.room is distinct from new.room or old.booking_id is distinct from new.booking_id);
begin
  perform set_config('portal.room_list_source', 'guest moved to ' || coalesce(new.room, '-'), true);
  -- the room it is in now: on the list (first, so taking the old room off below finds nothing else to put back)
  if coalesce(new.room, '') <> '' and new.cancelled is not true then
    update public.bookings set blocked_rooms = coalesce(blocked_rooms, '{}') || new.room
    where id::text = new.booking_id::text and coalesce(status, '') <> 'cancelled'
      and not (new.room = any (coalesce(blocked_rooms, '{}')));
  end if;
  -- the room it left: off the list when nothing else of that booking is in it
  if moved and coalesce(old.room, '') <> '' and not exists (
       select 1 from public.registrations r
       where r.booking_id::text = old.booking_id::text and r.room = old.room and r.id <> new.id) then
    update public.bookings set blocked_rooms = array_remove(blocked_rooms, old.room)
    where id::text = old.booking_id::text and old.room = any (blocked_rooms);
  end if;
  perform set_config('portal.room_list_source', '', true);
  return null;
end $$;

-- Room Block's "unblock" saves the shorter list first and deletes that room's guest row right after (two requests), so
-- step 1 puts the room back for a moment. When the row goes within a few minutes of that, the room comes off as asked.
create or replace function public.portal_reg_room_release() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(old.room, '') <> ''
     and not exists (select 1 from public.registrations r
                     where r.booking_id::text = old.booking_id::text and r.room = old.room and r.cancelled is not true)
     and exists (select 1 from public.blocked_rooms_log l
                 where l.booking_id = old.booking_id::text and old.room = any (l.kept) and l.at > now() - interval '5 minutes') then
    perform set_config('portal.room_list_source', 'room unblocked, guest row removed', true);
    update public.bookings set blocked_rooms = array_remove(blocked_rooms, old.room)
    where id::text = old.booking_id::text and old.room = any (blocked_rooms);
    perform set_config('portal.room_list_source', '', true);
  end if;
  return null;
end $$;

drop trigger if exists portal_room_list_keep on public.bookings;
create trigger portal_room_list_keep before insert or update of blocked_rooms, status on public.bookings
  for each row execute function public.portal_room_list_keep();

drop trigger if exists portal_reg_room_sync on public.registrations;
create trigger portal_reg_room_sync after insert or update of room, booking_id, cancelled on public.registrations
  for each row execute function public.portal_reg_room_sync();

drop trigger if exists portal_reg_room_release on public.registrations;
create trigger portal_reg_room_release after delete on public.registrations
  for each row execute function public.portal_reg_room_release();
