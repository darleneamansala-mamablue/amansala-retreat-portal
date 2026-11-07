-- data_history.sql — every change keeps what was there before, so nothing overwritten or deleted is ever lost (Jorge 2026-11-07).
-- For each UPDATE / DELETE on the main tables a row goes into data_history with who did it, which fields changed and the
-- previous version; the portal's History screen (modules/data-history.js + netlify/functions/data-history.js) lists them
-- and restores a version with one click.
--   * bookings, registrations, folios, folio_items, payments, transport, booking_requests, commissions: the whole previous
--     row (old_data) and the new values of the fields that changed (new_data).
--   * app_store: only what changed inside the value -- for a list of records (spa appointments, tickets...) the records that
--     were removed or edited, for an object the keys that changed -- not the whole 260 KB blob each time. Backups, logs and
--     menu archives are skipped (they are copies already).
--   * Never blocks a save: if writing the history fails, the change still goes through.
--   * Kept 120 days (netlify/functions/data-history-cleanup.js deletes older rows every night).
-- Undo: sql/data_history_undo.sql

create table if not exists public.data_history (
  id bigserial primary key,
  at timestamptz not null default now(),
  tbl text not null,
  op text not null,
  row_id text,
  who text,
  changed text[],
  old_data jsonb,
  new_data jsonb
);
create index if not exists data_history_row on public.data_history (tbl, row_id, at desc);
create index if not exists data_history_at on public.data_history (at desc);
alter table public.data_history enable row level security;
drop policy if exists portal_signed_in on public.data_history;
create policy portal_signed_in on public.data_history for select to authenticated using (public.portal_signed_in());

-- what `a` had that `b` does not: list -> the records of a not in b (removed or edited); object -> a's values of the keys
-- that differ; anything else -> a itself
create or replace function public.dh_json_before(a jsonb, b jsonb) returns jsonb
language plpgsql immutable as $$
begin
  if a is null then return null; end if;
  if jsonb_typeof(a) = 'array' and jsonb_typeof(b) = 'array' then
    return (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(a) e except select x from jsonb_array_elements(b) x) d);
  end if;
  if jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
    return (select coalesce(jsonb_object_agg(k, a -> k), '{}'::jsonb) from jsonb_object_keys(a) k where (a -> k) is distinct from (b -> k));
  end if;
  return a;
end $$;

create or replace function public.dh_capture() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text; o jsonb; n jsonb; ch text[]; oldd jsonb; newd jsonb; rid text;
begin
  begin
    begin
      who := coalesce(nullif(auth.jwt() ->> 'name', ''), nullif(auth.jwt() ->> 'app_role', ''), current_user);
    exception when others then who := current_user; end;
    if tg_op = 'DELETE' then o := to_jsonb(old); else n := to_jsonb(new); end if;
    if tg_op = 'UPDATE' then o := to_jsonb(old); end if;
    rid := case when tg_table_name = 'app_store' then coalesce(o, n) ->> 'key' else coalesce(coalesce(o, n) ->> 'id', coalesce(o, n) ->> 'key') end;
    if tg_table_name = 'app_store' then
      if rid ~ '(_bk_|backup|_log|^cas_log|_before_|^menu_archive_|^climas_sent$|^room_price_genie|heartbeat|^session)' then return coalesce(new, old); end if;
      if tg_op = 'UPDATE' then
        if (o -> 'value') is not distinct from (n -> 'value') then return new; end if;
        oldd := jsonb_build_object('value', public.dh_json_before(o -> 'value', n -> 'value'), 'updated_at', o -> 'updated_at');
        newd := jsonb_build_object('value', public.dh_json_before(n -> 'value', o -> 'value'));
        ch := array['value'];
      else
        oldd := o; ch := array['*'];
      end if;
    else
      if tg_op = 'UPDATE' then
        select array_agg(k), jsonb_object_agg(k, n -> k) into ch, newd
        from jsonb_object_keys(n) k where k <> 'updated_at' and (o -> k) is distinct from (n -> k);
        if ch is null then return new; end if;
        oldd := o;
      else
        oldd := o; ch := array['*'];
      end if;
    end if;
    insert into public.data_history (tbl, op, row_id, who, changed, old_data, new_data) values (tg_table_name, tg_op, rid, who, ch, oldd, newd);
  exception when others then
    raise warning 'data_history: %', sqlerrm;   -- the save itself always goes through
  end;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['bookings', 'registrations', 'folios', 'folio_items', 'payments', 'transport', 'booking_requests', 'commissions', 'app_store'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists dh_capture on public.%I', t);
      execute format('create trigger dh_capture after update or delete on public.%I for each row execute function public.dh_capture()', t);
    end if;
  end loop;
end $$;

-- search for the History screen (called by netlify/functions/data-history.js with the service key only): newest first,
-- optional table, text anywhere in the row (name, room, description...) and start time
create or replace function public.data_history_search(p_tbl text, p_q text, p_since timestamptz, p_limit int)
returns setof public.data_history
language sql stable security definer set search_path = public as $$
  select * from public.data_history h
  where (coalesce(p_tbl, '') = '' or h.tbl = p_tbl)
    and (p_since is null or h.at >= p_since)
    and (coalesce(p_q, '') = '' or h.row_id ilike '%' || p_q || '%' or h.old_data::text ilike '%' || p_q || '%' or h.new_data::text ilike '%' || p_q || '%')
  order by h.at desc
  limit least(coalesce(p_limit, 100), 300)
$$;
revoke all on function public.data_history_search(text, text, timestamptz, int) from public, anon, authenticated;

