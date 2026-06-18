-- Create table (safe to rerun)
create table if not exists items (
  id          text primary key,
  name        text not null,
  type        text not null check (type in ('location', 'container')),
  parent_id   text references items(id) on delete set null,
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Auto-update updated_at (safe to rerun)
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Make trigger creation safe (drop before create)
drop trigger if exists items_updated_at on items;

create trigger items_updated_at
  before update on items
  for each row execute function update_updated_at();

-- RLS enable (safe to rerun)
alter table items enable row level security;

-- Policy creation is *not* automatically idempotent in Postgres.
-- So drop the policy if it exists, then recreate it.
drop policy if exists "Allow all" on items;

create policy "Allow all" on items
  for all
  using (true)
  with check (true);

-- Table-level grants (safe to rerun)
-- RLS policies only take effect if the underlying Postgres role
-- already has table privileges. Some setup paths (e.g. certain
-- migration/integration tools) create tables without auto-granting
-- these to Supabase's standard API roles, which causes
-- "permission denied for table items" even with RLS configured correctly.
grant select, insert, update, delete on items to anon, authenticated, service_role;

-- Seed data (safe to rerun)
insert into items (id, name, type, parent_id, notes) values
  ('shelf-north', 'North shelf', 'location', null, 'Against north wall'),
  ('shelf-south', 'South shelf', 'location', null, 'Near workbench'),
  ('bench-main',  'Main workbench', 'location', null, 'Centre of workshop'),
  ('box-red',     'Red toolbox', 'container', 'shelf-north', 'Screwdrivers, hex keys'),
  ('box-blue',    'Blue parts bin', 'container', 'shelf-north', 'Nuts, bolts, washers'),
  ('drawer-1',    'Drawer 1', 'container', 'shelf-south', 'Measuring tools')
on conflict (id) do nothing;
