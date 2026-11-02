-- portal_logins — passwords for the portal's smaller logins (spa staff, drivers, staff confirmation, and the old
-- 'staffAccounts' list), kept where the browser cannot read them. Until 2026-11-02 they sat in app_store as plain text
-- (or an unsalted SHA-256), readable by anyone holding the public anon key. Only the Netlify functions, with the service
-- key, read and write this table: RLS is on with no policy, and anon/authenticated have no privileges at all.
-- Run once by hand in Supabase > SQL Editor.

create table if not exists public.portal_logins (
  kind          text        not null,   -- 'spa' | 'driver' | 'confirm' | 'staff'
  account_id    text        not null,   -- the account's id in its own list (app_store blob / staff table)
  username      text        not null,   -- lower case
  name          text,
  password_hash text        not null,   -- scrypt$<salt hex>$<hash hex>
  active        boolean     not null default true,
  updated_at    timestamptz not null default now(),
  primary key (kind, account_id)
);
create unique index if not exists portal_logins_kind_username on public.portal_logins (kind, username);

alter table public.portal_logins enable row level security;
revoke all on public.portal_logins from anon, authenticated;
