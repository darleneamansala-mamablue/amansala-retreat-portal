-- phase4_portal_tables.sql — security plan phase 4, the portal's own tables (2026-11-02).
-- After this, the public anon key reads and writes NONE of these tables. Signed-in sessions (the database pass from
-- staff-login / portal-login: app_role admin, staff, spa, driver, confirm) keep full access, exactly as today. A teacher's
-- pass (teacher-data.js: app_role teacher + booking_id) sees only its own retreat, its guests, payments and transport,
-- the shared settings its portal reads, and writes only its own retreat. Every existing policy on these tables is
-- dropped first (several were "allow everyone"). Server functions use the service key and are not affected.
-- Undo: sql/phase4_portal_tables_undo.sql (turns the rules off again on all of them).

create or replace function public.portal_teacher_bk() returns text
language sql stable as $$
  select case when coalesce(auth.jwt() ->> 'app_role', '') = 'teacher' then auth.jwt() ->> 'booking_id' end
$$;

-- app_store keys a teacher's portal reads (measured 2026-11-02) -- not staff accounts, spa clients, leads, orders, logs
create or replace function public.portal_teacher_reads(k text) returns boolean
language sql stable as $$
  select k in ('casa_shanti_dismissed', 'casita4_dismissed', 'contract_library', 'contract_snapshots', 'dailyReportMealRate',
               'deletedTransportIds', 'menuGihOverride', 'menuMealRows', 'menuOverride', 'menuOverride2', 'menuWeekVariants',
               'menuProteinPrices', 'menuRecipeCosts', 'menuProteinAssign', 'menuIngredientCatalog', 'menuActualKg',
               'retreat_balance_schedule', 'retreat_booking_config', 'smallGroupPricing', 'tourCosts', 'tourDefaultTimes',
               'tourWeekdays', 'tour_guide_names', 'transport_meeting_points', 'clear_signal', 'cas_sync', 'db_pass',
               'deletedBookingIds', 'deletedRegIds', 'deletedPaymentIds', 'portal_settings', 'issueAcks')
      or k = 'room_prompts_' || coalesce(public.portal_teacher_bk(), '-')
$$;

-- app_store keys a teacher's portal writes
create or replace function public.portal_teacher_writes(k text) returns boolean
language sql stable as $$
  select k in ('issueAcks', 'contract_snapshots')
      or k = 'room_prompts_' || coalesce(public.portal_teacher_bk(), '-')
      or k like 'cas_log:%'
$$;

do $$
declare t text; p record;
begin
  foreach t in array array['bookings', 'registrations', 'payments', 'transport', 'folios', 'folio_items', 'room_types',
                           'add_ons', 'settings', 'activity_log', 'bot_log', 'app_store'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy portal_signed_in on public.%I for all to authenticated using (public.portal_signed_in()) with check (public.portal_signed_in())', t);
  end loop;
end $$;

-- teachers: their own retreat
create policy teacher_own on public.bookings for select to authenticated using (id::text = public.portal_teacher_bk());
create policy teacher_own_update on public.bookings for update to authenticated using (id::text = public.portal_teacher_bk()) with check (id::text = public.portal_teacher_bk());
create policy teacher_own on public.registrations for all to authenticated using (booking_id::text = public.portal_teacher_bk()) with check (booking_id::text = public.portal_teacher_bk());
create policy teacher_own on public.payments for all to authenticated using (booking_id::text = public.portal_teacher_bk()) with check (booking_id::text = public.portal_teacher_bk());
create policy teacher_own on public.transport for all to authenticated using (booking_id::text = public.portal_teacher_bk()) with check (booking_id::text = public.portal_teacher_bk());
create policy teacher_read on public.room_types for select to authenticated using (public.portal_teacher_bk() is not null);
create policy teacher_read on public.add_ons for select to authenticated using (public.portal_teacher_bk() is not null);
create policy teacher_read on public.settings for select to authenticated using (public.portal_teacher_bk() is not null);
create policy teacher_own on public.bot_log for select to authenticated using (booking_id::text = public.portal_teacher_bk());
create policy teacher_insert on public.activity_log for insert to authenticated with check (public.portal_teacher_bk() is not null);
create policy teacher_read on public.app_store for select to authenticated using (public.portal_teacher_reads(key));
create policy teacher_insert on public.app_store for insert to authenticated with check (public.portal_teacher_writes(key));
create policy teacher_update on public.app_store for update to authenticated using (public.portal_teacher_writes(key)) with check (public.portal_teacher_writes(key));
