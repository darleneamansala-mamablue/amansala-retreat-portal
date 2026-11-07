-- data_history_undo.sql — turns the change history off (sql/data_history.sql). The history already saved is kept;
-- add "drop table public.data_history;" at the end only if you also want to delete it.
do $$
declare t text;
begin
  foreach t in array array['bookings', 'registrations', 'folios', 'folio_items', 'payments', 'transport', 'booking_requests', 'commissions', 'app_store'] loop
    if to_regclass('public.' || t) is not null then execute format('drop trigger if exists dh_capture on public.%I', t); end if;
  end loop;
end $$;
drop function if exists public.dh_capture();
drop function if exists public.dh_json_before(jsonb, jsonb);
drop function if exists public.data_history_search(text, text, timestamptz, int);
