-- Row level security. One pattern, applied by a helper so no table can be forgotten:
--   read   = any member of the household (viewer and up)
--   write  = the roles listed per table (editor and owner by default; agent where noted)
--   delete = the roles listed per table (editor and owner by default)
-- The anon role has no access to anything. Global reference tables are read-only for signed-in users.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;

create or replace function app.apply_tenant_policies(tbl text, write_roles text[], delete_roles text[], select_roles text[] default null)
returns void language plpgsql set search_path = '' as $$
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format('drop policy if exists %I on public.%I', tbl || '_select', tbl);
  execute format('drop policy if exists %I on public.%I', tbl || '_insert', tbl);
  execute format('drop policy if exists %I on public.%I', tbl || '_update', tbl);
  execute format('drop policy if exists %I on public.%I', tbl || '_delete', tbl);
  if select_roles is null then
    execute format('create policy %I on public.%I for select to authenticated using (household_id in (select app.user_household_ids()))', tbl || '_select', tbl);
  else
    execute format('create policy %I on public.%I for select to authenticated using (app.has_role(household_id, %L))', tbl || '_select', tbl, select_roles);
  end if;
  execute format('create policy %I on public.%I for insert to authenticated with check (app.has_role(household_id, %L))', tbl || '_insert', tbl, write_roles);
  execute format('create policy %I on public.%I for update to authenticated using (app.has_role(household_id, %L)) with check (app.has_role(household_id, %L))', tbl || '_update', tbl, write_roles, write_roles);
  execute format('create policy %I on public.%I for delete to authenticated using (app.has_role(household_id, %L))', tbl || '_delete', tbl, delete_roles);
end $$;

do $$
declare
  editors text[] := array['owner', 'editor'];
  editors_and_agent text[] := array['owner', 'editor', 'agent'];
  owners text[] := array['owner'];
  nobody text[] := array[]::text[];
begin
  -- Inventory
  perform app.apply_tenant_policies('locations', editors, editors);
  perform app.apply_tenant_policies('containers', editors, editors);
  perform app.apply_tenant_policies('items', editors_and_agent, editors);
  perform app.apply_tenant_policies('item_aliases', editors_and_agent, editors);
  perform app.apply_tenant_policies('item_retailer_links', editors, editors);
  -- Recipes and planning
  perform app.apply_tenant_policies('recipes', editors_and_agent, editors);
  perform app.apply_tenant_policies('recipe_ingredients', editors_and_agent, editors);
  perform app.apply_tenant_policies('cook_weeks', editors, editors);
  perform app.apply_tenant_policies('batches', editors, editors);
  perform app.apply_tenant_policies('freezer_blocks', editors, editors);
  perform app.apply_tenant_policies('plan_entries', editors_and_agent, editors);
  perform app.apply_tenant_policies('cook_sessions', editors, editors);
  -- Shopping and money
  perform app.apply_tenant_policies('retailers', owners, owners);
  perform app.apply_tenant_policies('routing_rules', editors, editors);
  perform app.apply_tenant_policies('list_lines', editors_and_agent, editors);
  perform app.apply_tenant_policies('list_sends', editors, editors);
  perform app.apply_tenant_policies('receipts', editors, editors);
  perform app.apply_tenant_policies('receipt_lines', editors, editors);
  perform app.apply_tenant_policies('prices', editors, editors);
  perform app.apply_tenant_policies('spend', editors, editors);
  -- Household settings
  perform app.apply_tenant_policies('persons', editors, editors);
  perform app.apply_tenant_policies('rules', editors, editors);
  perform app.apply_tenant_policies('ingredient_fdc_overrides', editors, editors);
  -- Partner and activity: anyone who can write may log; nobody deletes history from the client.
  perform app.apply_tenant_policies('partner_turns', editors_and_agent, nobody);
  perform app.apply_tenant_policies('activity_events', editors_and_agent, nobody);
  -- Invites: owners only, in every direction.
  perform app.apply_tenant_policies('invites', owners, owners, owners);
end $$;

-- Households: members read; owners update; nobody inserts or deletes from the client (see app.create_household).
alter table public.households enable row level security;
create policy households_select on public.households for select to authenticated
  using (id in (select app.user_household_ids()));
create policy households_update on public.households for update to authenticated
  using (app.has_role(id, array['owner'])) with check (app.has_role(id, array['owner']));

-- Memberships: a member sees the roster; owners change roles or remove members; nobody inserts from the client.
alter table public.memberships enable row level security;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or household_id in (select app.user_household_ids()));
create policy memberships_update on public.memberships for update to authenticated
  using (app.has_role(household_id, array['owner']) or user_id = (select auth.uid()))
  with check (app.has_role(household_id, array['owner']) or user_id = (select auth.uid()));
create policy memberships_delete on public.memberships for delete to authenticated
  using (app.has_role(household_id, array['owner']) or user_id = (select auth.uid()));

-- A member may only change their own energy fields unless they are an owner.
create or replace function app.guard_membership_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if not app.has_role(old.household_id, array['owner']) then
    if new.role is distinct from old.role or new.user_id is distinct from old.user_id
       or new.household_id is distinct from old.household_id or new.deleted_at is distinct from old.deleted_at then
      raise exception 'only an owner can change roles or membership' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger guard_membership_update before update on public.memberships
  for each row execute function app.guard_membership_update();

-- Never leave a household with zero owners.
create or replace function app.guard_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare remaining integer;
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and (new.role <> 'owner' or new.deleted_at is not null)) then
    if old.role = 'owner' and old.deleted_at is null then
      select count(*) into remaining from public.memberships m
      where m.household_id = old.household_id and m.role = 'owner' and m.deleted_at is null and m.id <> old.id;
      if remaining = 0 and exists (select 1 from public.households h where h.id = old.household_id and h.deleted_at is null) then
        raise exception 'a household needs at least one owner' using errcode = '23514';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_last_owner before update or delete on public.memberships
  for each row execute function app.guard_last_owner();

-- Agents (Riker) may draft list lines but never mark them ordered; sends are human only.
create or replace function app.guard_agent_list_line() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.current_role(new.household_id) = 'agent' and new.status in ('ordered', 'received') then
    raise exception 'an agent cannot send or receive a list' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_agent_list_line before insert or update on public.list_lines
  for each row execute function app.guard_agent_list_line();

-- Per-user tables.
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or user_id in (
    select m.user_id from public.memberships m where m.household_id in (select app.user_household_ids()) and m.deleted_at is null));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

alter table public.user_prefs enable row level security;
create policy user_prefs_all on public.user_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_all on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.notification_prefs enable row level security;
create policy notification_prefs_all on public.notification_prefs for all to authenticated
  using (user_id = (select auth.uid()) and household_id in (select app.user_household_ids()))
  with check (user_id = (select auth.uid()) and household_id in (select app.user_household_ids()));

-- Recipe transfers: the sender's editors insert; the receiver's editors read and accept.
alter table public.recipe_transfers enable row level security;
create policy recipe_transfers_select on public.recipe_transfers for select to authenticated
  using (from_household_id in (select app.user_household_ids()) or to_household_id in (select app.user_household_ids()));
create policy recipe_transfers_insert on public.recipe_transfers for insert to authenticated
  with check (app.has_role(from_household_id, array['owner', 'editor']));
create policy recipe_transfers_update on public.recipe_transfers for update to authenticated
  using (app.has_role(to_household_id, array['owner', 'editor']))
  with check (app.has_role(to_household_id, array['owner', 'editor']));

-- AI usage: members may read their household's usage; only functions write it.
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (household_id in (select app.user_household_ids()));

-- Global reference tables: read for signed-in users, writes only via service role.
alter table public.recipe_library enable row level security;
create policy recipe_library_select on public.recipe_library for select to authenticated using (true);
alter table public.recipe_library_ingredients enable row level security;
create policy recipe_library_ingredients_select on public.recipe_library_ingredients for select to authenticated using (true);
alter table public.product_cache enable row level security;
create policy product_cache_select on public.product_cache for select to authenticated using (true);
create policy product_cache_insert on public.product_cache for insert to authenticated with check (true);
alter table public.usda_foods enable row level security;
create policy usda_foods_select on public.usda_foods for select to authenticated using (true);

-- Belt and braces: fail loudly if any public table is left without RLS.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise exception 'table public.% has no row level security', t;
  end loop;
end $$;
