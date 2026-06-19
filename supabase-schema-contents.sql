-- Run this in Supabase SQL editor. Safe to rerun.
-- Adds a "contents" table: structured logged items that live inside
-- a container OR location (or nothing, if unassigned).

create table if not exists contents (
  id              uuid primary key default gen_random_uuid(),
  parent_item_id  text references items(id) on delete set null,
  item_name       text not null,
  description     text default '',
  category        text default '',
  date_added      timestamptz default now(),
  date_acquired   date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create or replace function update_contents_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists contents_updated_at on contents;

create trigger contents_updated_at
  before update on contents
  for each row execute function update_contents_updated_at();

alter table contents enable row level security;

drop policy if exists "Allow all" on contents;

create policy "Allow all" on contents
  for all
  using (true)
  with check (true);

-- Table-level grants — required in addition to the RLS policy above.
-- (See the note in supabase-schema-gbt.sql for why this matters.)
grant select, insert, update, delete on contents to anon, authenticated, service_role;

-- Helpful index since most queries filter by parent_item_id
create index if not exists contents_parent_item_id_idx on contents(parent_item_id);
