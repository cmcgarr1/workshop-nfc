-- Categories become many-to-many: an item can have several categories,
-- and a category can be shared by many items. Run this in your Supabase
-- SQL editor (https://app.supabase.com -> your project -> SQL editor).
--
-- This is additive and safe to rerun. It does NOT drop or touch
-- contents.category — that column is left in place, untouched, as a
-- fallback until you're happy the new tables are working. Drop it
-- yourself later with:
--   alter table contents drop column category;

create table if not exists categories (
  id          text primary key default (gen_random_uuid())::text,
  name        text not null,
  user_id     uuid references auth.users(id),
  created_at  timestamptz default now()
);

-- One category name per user, case-insensitive ("Hand tools" and
-- "hand tools" are the same category).
create unique index if not exists categories_user_name_unique
  on categories (user_id, lower(name));

create table if not exists content_categories (
  content_id   text not null references contents(id) on delete cascade,
  category_id  text not null references categories(id) on delete cascade,
  user_id      uuid references auth.users(id),
  primary key (content_id, category_id)
);

alter table categories enable row level security;
alter table content_categories enable row level security;

-- SECURITY: no "Allow all" policy, and no anon/authenticated grants.
-- The anon key ships in the browser bundle, so granting it DML here means
-- granting it to anyone who loads the site — that combination let the whole
-- inventory be read and rewritten straight through PostgREST, bypassing the
-- authorization in pages/api/*. All data access goes through those routes
-- with the service_role key, which bypasses RLS, so service_role is the only
-- role that needs anything. RLS enabled with no policies = deny by default.
drop policy if exists "Allow all" on categories;
drop policy if exists "Allow all" on content_categories;

-- Matches the grants already applied to items/contents (see
-- supabase-schema-gbt.sql) — without these, the API's service-role
-- client gets "permission denied for table" even with RLS configured.
grant select, insert, update, delete on categories to service_role;
grant select, insert, update, delete on content_categories to service_role;

-- Backfill: turn every existing contents.category string into a real
-- category row, one per distinct (user, name). Safe to rerun --
-- ON CONFLICT matches the unique index above.
insert into categories (name, user_id)
select trim(c.category), c.user_id
from contents c
where c.category is not null and trim(c.category) <> ''
group by trim(c.category), c.user_id
on conflict (user_id, lower(name)) do nothing;

-- Link every existing contents row to the category row that now
-- represents its old single category string.
insert into content_categories (content_id, category_id, user_id)
select c.id, cat.id, c.user_id
from contents c
join categories cat
  on lower(cat.name) = lower(trim(c.category))
  and cat.user_id = c.user_id
where c.category is not null and trim(c.category) <> ''
on conflict (content_id, category_id) do nothing;
