-- find_or_create_folio — one guest bill (folio) per guest, even when several screens / server jobs ask at the same moment.
-- 2026-11-01: 48 guests had 2+ folios (41 created within 2 minutes of each other), charges split across them, and the
-- check-out payment link only covers one folio. 13 code paths looked for a folio and then inserted one with nothing
-- stopping two of them doing it at once. They all call this instead: the advisory lock makes callers for the same
-- registration / booking request wait for each other, so the second one finds the folio the first one just created.
-- Run once by hand in Supabase > SQL Editor.

create or replace function public.find_or_create_folio(
  p_registration_id    text    default null,   -- registrations.id (retreat / Rooms guests)
  p_booking_request_id uuid    default null,   -- booking_requests.id (Booking Engine guests)
  p_guest_name         text    default null,   -- matched case-insensitively, ignoring spaces at the ends
  p_payment_token      text    default null,   -- token for a new folio (generated here when null)
  p_open_only          boolean default false,  -- only reuse an open folio
  p_reuse_any_open     boolean default false,  -- no folio under this name: reuse the oldest open one of the room
  p_reuse_single       boolean default false,  -- no folio under this name: reuse the room's only folio, if it has exactly one
  p_create             boolean default true    -- false = look up only, never create
) returns jsonb
language plpgsql
as $$
declare
  v public.folios;
  v_created boolean := false;
  v_n int;
begin
  if p_registration_id is null and p_booking_request_id is null then
    raise exception 'find_or_create_folio: a registration or booking request is required';
  end if;
  perform pg_advisory_xact_lock(hashtext('folio:' || coalesce(p_registration_id, p_booking_request_id::text)));

  select f.* into v from public.folios f
   where ((p_registration_id is not null and f.registration_id = p_registration_id)
       or (p_booking_request_id is not null and f.booking_request_id = p_booking_request_id))
     and lower(btrim(coalesce(f.guest_name, ''))) = lower(btrim(coalesce(p_guest_name, '')))
     and (not p_open_only or f.status = 'open')
   order by f.created_at asc
   limit 1;

  if v.id is null and p_reuse_any_open then
    select f.* into v from public.folios f
     where ((p_registration_id is not null and f.registration_id = p_registration_id)
         or (p_booking_request_id is not null and f.booking_request_id = p_booking_request_id))
       and f.status = 'open'
     order by f.created_at asc
     limit 1;
  end if;

  if v.id is null and p_reuse_single then
    select count(*) into v_n from public.folios f
     where ((p_registration_id is not null and f.registration_id = p_registration_id)
         or (p_booking_request_id is not null and f.booking_request_id = p_booking_request_id));
    if v_n = 1 then
      select f.* into v from public.folios f
       where ((p_registration_id is not null and f.registration_id = p_registration_id)
           or (p_booking_request_id is not null and f.booking_request_id = p_booking_request_id));
    end if;
  end if;

  if v.id is null and p_create then
    insert into public.folios (registration_id, booking_request_id, guest_name, name, payment_token, status)
    values (p_registration_id, p_booking_request_id, p_guest_name, p_guest_name,
            coalesce(p_payment_token, replace(gen_random_uuid()::text, '-', '')), 'open')
    returning * into v;
    v_created := true;
  end if;

  return jsonb_build_object('folio', case when v.id is null then null else to_jsonb(v) end, 'created', v_created);
end
$$;

grant execute on function public.find_or_create_folio(text, uuid, text, text, boolean, boolean, boolean, boolean)
  to anon, authenticated, service_role;
