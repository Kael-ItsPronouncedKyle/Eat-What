-- Quartermaster schema. Plain SQL on purpose: uuid keys, text + CHECK instead of enums, jsonb instead of arrays,
-- no FK to auth.users, so the tables port to PocketBase table for table (spec: Hosting cost and exit plan).
-- Every tenant table carries household_id and the standard audit/sync columns:
--   id, household_id, created_at, created_by, updated_at, updated_by, deleted_at (tombstone for offline sync).

set check_function_bodies = off;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- Sets updated_at / updated_by on every write. The one generic trigger the portability rule allows.
create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
declare
  j jsonb := to_jsonb(new);
  uid uuid := (select auth.uid());
begin
  new.updated_at := now();
  if uid is not null then
    if j ? 'updated_by' then
      new.updated_by := uid;
    end if;
    if tg_op = 'INSERT' and (j ? 'created_by') and (j ->> 'created_by') is null then
      new.created_by := uid;
    end if;
  end if;
  return new;
end $$;

-- Households the signed-in user belongs to. SECURITY DEFINER so policies never recurse into memberships.
create or replace function app.user_household_ids() returns setof uuid
language sql security definer stable set search_path = '' as $$
  select m.household_id
  from public.memberships m
  join public.households h on h.id = m.household_id
  where m.user_id = (select auth.uid())
    and m.deleted_at is null
    and h.deleted_at is null
$$;

-- Does the signed-in user hold one of these roles in the household?
create or replace function app.has_role(hid uuid, roles text[]) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.households h on h.id = m.household_id
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
      and m.deleted_at is null
      and h.deleted_at is null
  )
$$;

create or replace function app.current_role(hid uuid) returns text
language sql security definer stable set search_path = '' as $$
  select m.role from public.memberships m
  where m.household_id = hid and m.user_id = (select auth.uid()) and m.deleted_at is null
  limit 1
$$;

revoke all on function app.user_household_ids() from public;
revoke all on function app.has_role(uuid, text[]) from public;
revoke all on function app.current_role(uuid) from public;
grant execute on function app.user_household_ids() to authenticated, service_role;
grant execute on function app.has_role(uuid, text[]) to authenticated, service_role;
grant execute on function app.current_role(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key,
  display_name text not null default '',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_prefs (
  user_id uuid primary key,
  text_size text not null default 'A' check (text_size in ('A', 'A+', 'A++')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  contrast text not null default 'normal' check (contrast in ('normal', 'high')),
  font text not null default 'default' check (font in ('default', 'reading')),
  motion text not null default 'system' check (motion in ('system', 'reduced')),
  hand text not null default 'right' check (hand in ('right', 'left')),
  read_aloud boolean not null default false,
  active_household_id uuid,
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Households and membership
-- ---------------------------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Chicago',
  zip text,
  currency text not null default 'USD',
  budget_monthly_cents integer,
  budget_warn_pct integer not null default 80 check (budget_warn_pct between 1 and 100),
  quiet_from time,
  quiet_to time,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  user_id uuid,
  plate_profile jsonb not null default '{}'::jsonb,
  color text,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'editor', 'viewer', 'agent')),
  person_id uuid,
  energy_level text check (energy_level in ('little', 'some', 'plenty')),
  energy_set_on date,
  invited_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (household_id, user_id),
  foreign key (person_id, household_id) references public.persons (id, household_id) on delete set null
);
create index memberships_user_idx on public.memberships (user_id) where deleted_at is null;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  kind text not null check (kind in ('member', 'household')),
  email text,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer', 'agent')),
  new_household_name text,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses integer not null default 1,
  used_count integer not null default 0,
  created_by uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  type text not null check (type in ('allergy', 'prep', 'diet', 'cuisine')),
  payload jsonb not null default '{}'::jsonb,
  applies_to_person_id uuid,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  foreign key (applies_to_person_id, household_id) references public.persons (id, household_id) on delete set null
);

create table public.notification_prefs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null,
  type text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id, type)
);

-- ---------------------------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------------------------

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('pantry', 'fridge', 'freezer', 'cleaning', 'garage', 'bathroom', 'custom')),
  parent_id uuid,
  is_freezer_shelf boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (parent_id, household_id) references public.locations (id, household_id) on delete set null
);

create table public.containers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('tray', 'bag', 'tub', 'pan', 'jar', 'muffin_tin', 'other')),
  capacity_ml numeric not null check (capacity_ml > 0),
  count_owned integer not null default 0 check (count_owned >= 0),
  disposable boolean not null default false,
  oven_safe boolean not null default false,
  microwave_safe boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  canonical_name text not null,
  category text not null default 'pantry' check (category in (
    'produce', 'dairy', 'meat', 'seafood', 'pantry', 'frozen', 'bakery', 'beverage', 'spice', 'condiment',
    'cleaning', 'paper', 'pet', 'pharmacy', 'personal', 'household', 'other')),
  location_id uuid,
  track_mode text not null default 'status' check (track_mode in ('status', 'count')),
  status text not null default 'ok' check (status in ('ok', 'low', 'out')),
  qty numeric check (qty is null or qty >= 0),
  unit text,
  par numeric check (par is null or par >= 0),
  use_by date,
  barcode text,
  image_path text,
  always_have boolean not null default false,
  auto_list boolean not null default true,
  person_id uuid,
  default_shelf_life_days integer,
  notes text,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (location_id, household_id) references public.locations (id, household_id) on delete set null,
  foreign key (person_id, household_id) references public.persons (id, household_id) on delete set null
);
create index items_household_idx on public.items (household_id) where deleted_at is null;
create index items_canonical_idx on public.items (household_id, canonical_name);
create index items_barcode_idx on public.items (household_id, barcode) where barcode is not null;

create table public.item_aliases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null,
  alias text not null,
  source text not null default 'manual' check (source in ('voice', 'receipt', 'instacart', 'ingredient', 'manual', 'import')),
  retailer_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade
);
create index item_aliases_lookup_idx on public.item_aliases (household_id, lower(alias));

-- ---------------------------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------------------------

-- Global reference bank. No household_id: SELECT for any signed-in user, writes by service role only.
create table public.recipe_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cuisine text,
  meal_type text,
  base_yield numeric not null default 4,
  yield_unit text not null default 'servings',
  steps jsonb not null default '[]'::jsonb,
  freeze_notes text,
  reheat_notes jsonb not null default '{}'::jsonb,
  equipment jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  active_minutes integer,
  standing_minutes integer,
  total_minutes integer,
  dishes_count integer,
  container_kinds jsonb not null default '[]'::jsonb,
  est_cost_band text check (est_cost_band is null or est_cost_band in ('low', 'medium', 'high')),
  source text not null default 'bank',
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_library_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipe_library (id) on delete cascade,
  position integer not null default 0,
  ingredient_name text not null,
  canonical_name text not null,
  amount numeric,
  unit text,
  preparation text,
  optional boolean not null default false,
  group_label text,
  substitute text
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  library_id uuid,
  variant_of_recipe_id uuid,
  variant_label text,
  title text not null,
  description text,
  cuisine text,
  meal_type text,
  base_yield numeric not null default 4,
  yield_unit text not null default 'servings',
  steps jsonb not null default '[]'::jsonb,
  freeze_notes text,
  reheat_notes jsonb not null default '{}'::jsonb,
  plate_notes jsonb not null default '{}'::jsonb,
  equipment jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  active_minutes integer,
  standing_minutes integer,
  total_minutes integer,
  dishes_count integer,
  effort_score numeric,
  nutrition jsonb,
  cost_per_serving_cents integer,
  source text not null default 'manual' check (source in ('bank', 'ai', 'url', 'manual', 'transfer', 'import')),
  source_url text,
  status text not null default 'approved' check (status in ('draft', 'approved', 'archived')),
  image_path text,
  last_cooked_at timestamptz,
  times_cooked integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (variant_of_recipe_id, household_id) references public.recipes (id, household_id) on delete set null
);
create index recipes_household_idx on public.recipes (household_id) where deleted_at is null;

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  position integer not null default 0,
  ingredient_name text not null,
  canonical_name text not null,
  amount numeric,
  unit text,
  preparation text,
  optional boolean not null default false,
  group_label text,
  substitute text,
  item_id uuid,
  match_confidence numeric check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  fdc_id integer,
  grams numeric,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (item_id, household_id) references public.items (id, household_id) on delete set null
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);
create index recipe_ingredients_item_idx on public.recipe_ingredients (item_id) where item_id is not null;

create table public.recipe_transfers (
  id uuid primary key default gen_random_uuid(),
  from_household_id uuid not null references public.households (id) on delete cascade,
  to_household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid,
  snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_by uuid,
  accepted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Freezer and planning
-- ---------------------------------------------------------------------------------------------

create table public.cook_weeks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null default 'Cook week',
  starts_on date not null,
  ends_on date not null,
  budget_target_cents integer,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'done')),
  timeline jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id)
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  cook_week_id uuid,
  recipe_id uuid not null,
  kind text not null default 'cooked' check (kind in ('cooked', 'dump_kit')),
  multiplier numeric not null default 1 check (multiplier > 0),
  container_plan jsonb not null default '[]'::jsonb,
  cook_person_id uuid,
  scheduled_on date,
  status text not null default 'planned' check (status in ('planned', 'assembled', 'cooked', 'frozen', 'skipped')),
  cooked_at timestamptz,
  estimated_cost_cents integer,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (cook_week_id, household_id) references public.cook_weeks (id, household_id) on delete set null,
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (cook_person_id, household_id) references public.persons (id, household_id) on delete set null
);

create table public.freezer_blocks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid,
  batch_id uuid,
  container_id uuid,
  location_id uuid,
  title text not null,
  portion_label text,
  portion_ml numeric,
  servings_per_block numeric not null default 1,
  count_remaining integer not null default 1 check (count_remaining >= 0),
  count_initial integer not null default 1 check (count_initial >= 0),
  person_id uuid,
  cooked_on date,
  quality_until date,
  freezer_spot text,
  food_type text not null default 'other' check (food_type in ('soup', 'cooked_meat', 'raw_marinated', 'baked', 'sauce', 'grain', 'vegetable', 'other')),
  label_text text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete set null,
  foreign key (batch_id, household_id) references public.batches (id, household_id) on delete set null,
  foreign key (container_id, household_id) references public.containers (id, household_id) on delete set null,
  foreign key (location_id, household_id) references public.locations (id, household_id) on delete set null,
  foreign key (person_id, household_id) references public.persons (id, household_id) on delete set null
);

create table public.plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date date not null,
  slot text not null default 'dinner' check (slot in ('breakfast', 'lunch', 'dinner', 'snack', 'batch')),
  kind text not null check (kind in ('recipe', 'freezer_block', 'note', 'batch')),
  recipe_id uuid,
  freezer_block_id uuid,
  batch_id uuid,
  person_id uuid,
  note text,
  servings numeric,
  position integer not null default 0,
  status text not null default 'planned' check (status in ('planned', 'cooked', 'skipped', 'moved')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete set null,
  foreign key (freezer_block_id, household_id) references public.freezer_blocks (id, household_id) on delete set null,
  foreign key (batch_id, household_id) references public.batches (id, household_id) on delete set null,
  foreign key (person_id, household_id) references public.persons (id, household_id) on delete set null
);
create index plan_entries_date_idx on public.plan_entries (household_id, date) where deleted_at is null;

create table public.cook_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  plan_entry_id uuid,
  batch_id uuid,
  cooked_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  servings_made numeric,
  deductions jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'proposed', 'confirmed', 'skipped')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (plan_entry_id, household_id) references public.plan_entries (id, household_id) on delete set null,
  foreign key (batch_id, household_id) references public.batches (id, household_id) on delete set null
);

-- ---------------------------------------------------------------------------------------------
-- Shopping, retailers, money
-- ---------------------------------------------------------------------------------------------

create table public.retailers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('instacart', 'heb', 'walmart', 'amazon', 'kroger', 'in_person', 'other')),
  config jsonb not null default '{}'::jsonb,
  is_primary_grocery boolean not null default false,
  is_primary_other boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id)
);

create table public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  match_kind text not null check (match_kind in ('category', 'item')),
  match_value text not null,
  retailer_id uuid not null,
  priority integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  foreign key (retailer_id, household_id) references public.retailers (id, household_id) on delete cascade
);

create table public.item_retailer_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null,
  retailer_id uuid not null,
  search_term text,
  external_id text,
  external_url text,
  last_price_cents integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (item_id, retailer_id),
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade,
  foreign key (retailer_id, household_id) references public.retailers (id, household_id) on delete cascade
);

create table public.list_sends (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  retailer_id uuid,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  status text not null default 'ordered' check (status in ('open', 'ordered', 'received', 'cancelled')),
  estimated_total_cents integer,
  actual_total_cents integer,
  external_url text,
  external_order_ref text,
  received_at timestamptz,
  line_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (retailer_id, household_id) references public.retailers (id, household_id) on delete set null
);

create table public.list_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid,
  name text not null,
  qty numeric check (qty is null or qty >= 0),
  unit text,
  reasons jsonb not null default '[]'::jsonb,
  retailer_id uuid,
  status text not null default 'open' check (status in ('open', 'ordered', 'received', 'dropped')),
  list_send_id uuid,
  search_term text,
  price_cents_est integer,
  note text,
  position integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  foreign key (item_id, household_id) references public.items (id, household_id) on delete set null,
  foreign key (retailer_id, household_id) references public.retailers (id, household_id) on delete set null,
  foreign key (list_send_id, household_id) references public.list_sends (id, household_id) on delete set null
);
-- One open line per item: a plan need and a Low flag merge into the same line.
create unique index list_lines_open_item_idx on public.list_lines (household_id, item_id)
  where status = 'open' and item_id is not null and deleted_at is null;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  retailer_id uuid,
  uploaded_by uuid,
  storage_path text,
  purchased_on date,
  total_cents integer,
  status text not null default 'uploaded' check (status in ('uploaded', 'parsed', 'reviewed', 'purged')),
  raw_result jsonb,
  list_send_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (retailer_id, household_id) references public.retailers (id, household_id) on delete set null,
  foreign key (list_send_id, household_id) references public.list_sends (id, household_id) on delete set null
);

create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  receipt_id uuid not null,
  raw_text text not null,
  qty numeric,
  unit_price_cents integer,
  line_total_cents integer,
  item_id uuid,
  status text not null default 'unmatched' check (status in ('matched', 'unmatched', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (receipt_id, household_id) references public.receipts (id, household_id) on delete cascade,
  foreign key (item_id, household_id) references public.items (id, household_id) on delete set null
);

create table public.prices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null,
  retailer_id uuid,
  price_cents integer not null check (price_cents >= 0),
  unit_qty numeric,
  unit text,
  source text not null default 'manual' check (source in ('receipt', 'manual', 'web', 'starter', 'instacart', 'import')),
  observed_on date not null default current_date,
  receipt_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade,
  foreign key (retailer_id, household_id) references public.retailers (id, household_id) on delete set null,
  foreign key (receipt_id, household_id) references public.receipts (id, household_id) on delete set null
);
create index prices_item_idx on public.prices (household_id, item_id, observed_on desc) where deleted_at is null;

create table public.spend (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  retailer_id uuid,
  amount_cents integer not null,
  kind text not null check (kind in ('estimated', 'actual')),
  category text not null default 'groceries' check (category in ('groceries', 'cleaning', 'household', 'pet', 'pharmacy', 'other')),
  occurred_on date not null default current_date,
  list_send_id uuid,
  receipt_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  foreign key (retailer_id, household_id) references public.retailers (id, household_id) on delete set null,
  foreign key (list_send_id, household_id) references public.list_sends (id, household_id) on delete set null,
  foreign key (receipt_id, household_id) references public.receipts (id, household_id) on delete set null
);
create index spend_month_idx on public.spend (household_id, occurred_on) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- Partner, activity, AI usage
-- ---------------------------------------------------------------------------------------------

create table public.partner_turns (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid,
  utterance text not null,
  transcript_confidence numeric,
  intents jsonb not null default '[]'::jsonb,
  applied jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'needs_confirm', 'applied', 'rejected', 'failed')),
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (id, household_id)
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  actor_user_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text not null,
  before jsonb,
  after jsonb,
  source text not null default 'tap' check (source in ('tap', 'voice', 'receipt', 'scan', 'sync', 'import', 'system', 'agent')),
  partner_turn_id uuid,
  cook_session_id uuid,
  undo_of_event_id uuid,
  undone_by_event_id uuid,
  created_at timestamptz not null default now(),
  foreign key (partner_turn_id, household_id) references public.partner_turns (id, household_id) on delete set null
);
create index activity_events_household_idx on public.activity_events (household_id, created_at desc);
create index activity_events_entity_idx on public.activity_events (entity_type, entity_id);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete set null,
  user_id uuid,
  fn text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  images integer not null default 0,
  cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Global caches (no household_id)
-- ---------------------------------------------------------------------------------------------

create table public.product_cache (
  barcode text primary key,
  name text,
  brand text,
  image_url text,
  category text,
  raw jsonb,
  fetched_at timestamptz not null default now()
);

create table public.usda_foods (
  fdc_id integer primary key,
  description text not null,
  nutrients_per_100g jsonb not null default '{}'::jsonb,
  portions jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

create table public.ingredient_fdc_overrides (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  canonical_name text not null,
  fdc_id integer not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (household_id, canonical_name)
);

-- ---------------------------------------------------------------------------------------------
-- updated_at triggers on every table that has the column
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at'
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function app.set_updated_at()', t);
  end loop;
end $$;
