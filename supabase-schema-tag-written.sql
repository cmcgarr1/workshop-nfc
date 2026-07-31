-- Adds a way to distinguish "logged in the database" from "has a physical
-- NFC tag actually written for it" — powers the Audit view's tagging
-- progress checklist on /inventory. Run this in the Supabase SQL editor
-- (https://app.supabase.com -> your project -> SQL editor) if you ever
-- need to reapply it; it was also applied directly to the live project.
--
-- Nullable, no backfill: existing rows simply read as "not yet tagged"
-- until someone marks them via the audit checklist's one-click action, or
-- a fresh /new-tag write sets it automatically at creation time.

alter table items add column if not exists tag_written_at timestamptz;

-- Matches the grants already applied to items (see supabase-schema-gbt.sql)
-- — without this, the API's service-role client gets "permission denied
-- for table" even with RLS configured.
grant select, insert, update, delete on items to anon, authenticated, service_role;
