-- data_history_more.sql — adds the rest of the tables to the change history (sql/data_history.sql must already be run) (Jorge 2026-11-07):
-- room types and rates, Revenue Manager prices, Booking Engine settings, discount codes, restaurant layouts, short payment links.
-- Tables that do not exist are skipped. Undo: drop trigger dh_capture on each of them.
do $$
declare t text;
begin
  foreach t in array array['room_types', 'be_rates', 'booking_engine_settings', 'be_discount_codes', 'restaurant_layouts', 'payment_shortlinks'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists dh_capture on public.%I', t);
      execute format('create trigger dh_capture after update or delete on public.%I for each row execute function public.dh_capture()', t);
    end if;
  end loop;
end $$;
