-- Contents table: individual logged items (distinct from the `items`
-- table, which holds locations/containers). Each content row optionally
-- belongs to a container/box via parent_item_id, which references items.id.
-- box_name / location_name shown in the UI are expected to be joined in
-- by the /api/contents route, not stored directly on this table.

create table if not exists contents (
  id              text primary key,
  item_name       text not null,
  description     text default '',
  category        text default '',
  parent_item_id  text references items(id) on delete set null,
  date_added      timestamptz default now(),
  date_acquired   date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists contents_updated_at on contents;
create trigger contents_updated_at
  before update on contents
  for each row execute function update_updated_at();

alter table contents enable row level security;

drop policy if exists "Allow all" on contents;
create policy "Allow all" on contents
  for all using (true) with check (true);
