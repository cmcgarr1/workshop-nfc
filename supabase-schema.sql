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

-- Allow public read/write (fine for a personal workshop app)
-- For a shared/multi-user workshop, add auth instead
alter table items enable row level security;

create policy "Allow all" on items
  for all using (true) with check (true);

-- Seed some example data (optional - delete if you want a clean start)
insert into items (id, name, type, parent_id, notes) values
  ('shelf-north', 'North shelf', 'location', null, 'Against north wall'),
  ('shelf-south', 'South shelf', 'location', null, 'Near workbench'),
  ('bench-main',  'Main workbench', 'location', null, 'Centre of workshop'),
  ('box-red',     'Red toolbox', 'container', 'shelf-north', 'Screwdrivers, hex keys'),
  ('box-blue',    'Blue parts bin', 'container', 'shelf-north', 'Nuts, bolts, washers'),
  ('drawer-1',    'Drawer 1', 'container', 'shelf-south', 'Measuring tools')
on conflict do nothing;
