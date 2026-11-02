-- Undo sql/phase4_portal_tables.sql: turns the rules off on those tables, so every key reads and writes them again
-- (as before phase 4). Use only if something breaks; then fix and run phase4_portal_tables.sql again.
do $$
declare t text;
begin
  foreach t in array array['bookings', 'registrations', 'payments', 'transport', 'folios', 'folio_items', 'room_types',
                           'add_ons', 'settings', 'activity_log', 'bot_log', 'app_store'] loop
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;
