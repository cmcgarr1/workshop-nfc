-- Run this in your Supabase SQL editor
-- https://app.supabase.com → your project → SQL editor

create table if not exists items (
  id          text primary key,
  name        text not null,
  type        text not null check (type in ('location', 'container')),
  parent_id   text references items(id) on delete set null,
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger items_updated_at
  before update on items
  for each row execute function update_updated_at();

alter table items enable row level security;

-- SECURITY: no "Allow all" policy, and no anon/authenticated grants.
-- The anon key ships in the browser bundle, so granting it DML here means
-- granting it to anyone who loads the site — that combination let the whole
-- inventory be read and rewritten straight through PostgREST, bypassing the
-- authorization in pages/api/*. All data access goes through those routes
-- with the service_role key, which bypasses RLS, so service_role is the only
-- role that needs anything. RLS enabled with no policies = deny by default.
drop policy if exists "Allow all" on items;
grant select, insert, update, delete on items to service_role;

-- Seed some example data (optional - delete if you want a clean start)
insert into items (id, name, type, parent_id, notes) values
  ('shelf-north', 'North shelf', 'location', null, 'Against north wall'),
  ('shelf-south', 'South shelf', 'location', null, 'Near workbench'),
  ('bench-main',  'Main workbench', 'location', null, 'Centre of workshop'),
  ('box-red',     'Red toolbox', 'container', 'shelf-north', 'Screwdrivers, hex keys'),
  ('box-blue',    'Blue parts bin', 'container', 'shelf-north', 'Nuts, bolts, washers'),
  ('drawer-1',    'Drawer 1', 'container', 'shelf-south', 'Measuring tools')
on conflict do nothing;
