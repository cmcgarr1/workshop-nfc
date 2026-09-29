-- Adds a status column so a container can be marked "out" (pulled off the
-- shelf for an in-progress session) vs "home" (back where it lives), plus a
-- timestamp for when it went out. Powers the scan page's out/home toggle and
-- the nag script (scripts/nag-out-boxes.js) that finds anything still out
-- and raises a switchboard packet naming it.
--
-- Additive only: new nullable/defaulted columns, no drops, no rewrite of
-- existing rows. Every existing row reads as "home" by default. Run this in
-- the Supabase SQL editor (https://app.supabase.com -> your project -> SQL
-- editor) if you ever need to reapply it; it is also applied directly to
-- the live nfc_items table (see log.md on switchboard item 0588 for when).

alter table nfc_items add column if not exists status text not null default 'home' check (status in ('home', 'out'));
alter table nfc_items add column if not exists checked_out_at timestamptz;

-- Matches the grants already applied to nfc_items elsewhere in this repo
-- (see supabase-schema-gbt.sql) — without this the API's service-role
-- client can get "permission denied for table" even with RLS configured.
grant select, insert, update, delete on nfc_items to service_role;
