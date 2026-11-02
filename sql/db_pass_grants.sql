-- db_pass_grants.sql — security plan phase 2. With the database pass, the portal's requests arrive as the role
-- 'authenticated' instead of 'anon'. Before switching it on, 'authenticated' must be able to do exactly what 'anon' can
-- do today on every table -- no more (staff.password_hash stays unreadable, portal_logins stays closed). Nothing is locked
-- by this file: that is phase 4. Run once by hand in Supabase > SQL Editor (safe to run again).

do $$
declare r record;
begin
  -- table privileges: copy anon's, table by table
  for r in
    select table_name, privilege_type from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
  loop
    execute format('grant %s on public.%I to authenticated', r.privilege_type, r.table_name);
  end loop;
  -- column privileges (staff: anon may read every column except password_hash)
  for r in
    select table_name, column_name, privilege_type from information_schema.column_privileges
    where grantee = 'anon' and table_schema = 'public'
      and (table_name, privilege_type) not in (select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public')
  loop
    execute format('grant %s (%I) on public.%I to authenticated', r.privilege_type, r.column_name, r.table_name);
  end loop;
end $$;

-- staff: the same column-only read anon has (no password_hash)
revoke select on public.staff from authenticated;
grant select (id, name, username, role, active, permissions) on public.staff to authenticated;

-- the password table stays closed to the browser either way
revoke all on public.portal_logins from authenticated;

grant usage on all sequences in schema public to authenticated;
grant execute on function public.find_or_create_folio(text, uuid, text, text, boolean, boolean, boolean, boolean) to authenticated;

-- check: tables where authenticated and anon differ (should return no rows, except staff/portal_logins)
select table_name, string_agg(distinct grantee || ':' || privilege_type, ', ') as grants
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name
having count(*) filter (where grantee = 'anon') <> count(*) filter (where grantee = 'authenticated');
