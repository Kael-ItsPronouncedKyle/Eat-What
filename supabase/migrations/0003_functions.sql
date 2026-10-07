-- RPCs the client calls through supabase.rpc(). SECURITY DEFINER so they can cross the membership bootstrap gap.

-- Default locations and containers every new household starts with.
create or replace function app.seed_household_defaults(hid uuid, kit text default 'basic')
returns void language plpgsql security definer set search_path = '' as $$
declare freezer_id uuid;
begin
  insert into public.locations (household_id, name, kind, sort_order) values
    (hid, 'Pantry', 'pantry', 0),
    (hid, 'Fridge', 'fridge', 1),
    (hid, 'Cleaning closet', 'cleaning', 3),
    (hid, 'Bathroom', 'bathroom', 4),
    (hid, 'Garage', 'garage', 5);
  insert into public.locations (household_id, name, kind, sort_order) values (hid, 'Freezer', 'freezer', 2) returning id into freezer_id;
  insert into public.locations (household_id, name, kind, parent_id, is_freezer_shelf, sort_order)
    values (hid, 'Freezer shelf', 'freezer', freezer_id, true, 0);

  if kit = 'souper_cubes' then
    insert into public.containers (household_id, name, kind, capacity_ml, count_owned, disposable, oven_safe, microwave_safe, sort_order) values
      (hid, 'Souper Cubes 2-cup tray', 'tray', 480, 2, false, false, false, 0),
      (hid, 'Souper Cubes 1-cup tray', 'tray', 240, 2, false, false, false, 1),
      (hid, 'Souper Cubes 1/2-cup tray', 'tray', 120, 1, false, false, false, 2),
      (hid, 'Quart zip bag', 'bag', 950, 20, true, false, false, 3);
  elsif kit = 'cheapest' then
    insert into public.containers (household_id, name, kind, capacity_ml, count_owned, disposable, oven_safe, microwave_safe, sort_order) values
      (hid, 'Quart zip bag', 'bag', 950, 25, true, false, false, 0),
      (hid, 'Gallon zip bag', 'bag', 3800, 10, true, false, false, 1),
      (hid, 'Muffin tin (12)', 'muffin_tin', 90, 1, false, true, false, 2),
      (hid, 'Saved tub', 'tub', 500, 6, false, false, true, 3);
  else
    insert into public.containers (household_id, name, kind, capacity_ml, count_owned, disposable, oven_safe, microwave_safe, sort_order) values
      (hid, 'Quart zip bag', 'bag', 950, 20, true, false, false, 0),
      (hid, 'Deli quart', 'tub', 950, 6, false, false, true, 1),
      (hid, 'Foil pan', 'pan', 2400, 4, true, true, false, 2);
  end if;
end $$;

-- Creates a household with the caller as owner. The only way a household comes into being from the client.
create or replace function public.create_household(p_name text, p_timezone text default 'America/Chicago', p_zip text default null, p_kit text default 'basic')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
  n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select count(*) into n from public.memberships m join public.households h on h.id = m.household_id
    where m.user_id = uid and m.role = 'owner' and m.deleted_at is null and h.deleted_at is null;
  if n >= 5 then raise exception 'household limit reached' using errcode = '23514'; end if;
  insert into public.households (name, timezone, zip, created_by) values (p_name, p_timezone, p_zip, uid) returning id into hid;
  insert into public.memberships (household_id, user_id, role, created_by) values (hid, uid, 'owner', uid);
  insert into public.persons (household_id, name, user_id, sort_order)
    values (hid, coalesce((select p.display_name from public.profiles p where p.user_id = uid), 'Me'), uid, 0);
  update public.memberships m set person_id = p.id from public.persons p
    where m.household_id = hid and m.user_id = uid and p.household_id = hid and p.user_id = uid;
  perform app.seed_household_defaults(hid, p_kit);
  insert into public.user_prefs (user_id, active_household_id) values (uid, hid)
    on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  return hid;
end $$;
revoke all on function public.create_household(text, text, text, text) from public;
grant execute on function public.create_household(text, text, text, text) to authenticated;

-- Owners mint invites. Returns the raw token once; only its hash is stored.
create or replace function public.create_invite(p_household_id uuid, p_kind text, p_email text default null, p_role text default 'editor', p_new_household_name text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  raw text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not app.has_role(p_household_id, array['owner']) then raise exception 'only an owner can invite' using errcode = '42501'; end if;
  if p_kind not in ('member', 'household') then raise exception 'bad invite kind'; end if;
  if p_role not in ('owner', 'editor', 'viewer', 'agent') then raise exception 'bad role'; end if;
  raw := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.invites (household_id, kind, email, role, new_household_name, token_hash, created_by)
    values (p_household_id, p_kind, lower(p_email), p_role, p_new_household_name, encode(extensions.digest(raw, 'sha256'), 'hex'), uid);
  return raw;
end $$;
revoke all on function public.create_invite(uuid, text, text, text, text) from public;
grant execute on function public.create_invite(uuid, text, text, text, text) to authenticated;

-- The invitee redeems a token. kind=member joins the origin household; kind=household creates a fresh one they own.
create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv public.invites%rowtype;
  hid uuid;
  caller_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into inv from public.invites i
    where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and i.deleted_at is null
    for update;
  if inv.id is null then raise exception 'invite not found' using errcode = 'P0002'; end if;
  if inv.expires_at < now() then raise exception 'invite expired' using errcode = 'P0002'; end if;
  if inv.used_count >= inv.max_uses then raise exception 'invite already used' using errcode = 'P0002'; end if;
  if inv.email is not null and inv.email <> caller_email then raise exception 'invite is for a different email' using errcode = '42501'; end if;

  if inv.kind = 'member' then
    hid := inv.household_id;
    insert into public.memberships (household_id, user_id, role, invited_by, created_by)
      values (hid, uid, inv.role, inv.created_by, uid)
      on conflict (household_id, user_id) do update set role = excluded.role, deleted_at = null, updated_at = now();
    insert into public.persons (household_id, name, user_id, sort_order)
      select hid, coalesce((select p.display_name from public.profiles p where p.user_id = uid), 'New member'), uid, 99
      where not exists (select 1 from public.persons p where p.household_id = hid and p.user_id = uid);
    update public.memberships m set person_id = p.id from public.persons p
      where m.household_id = hid and m.user_id = uid and p.household_id = hid and p.user_id = uid and m.person_id is null;
  else
    insert into public.households (name, created_by) values (coalesce(inv.new_household_name, 'New household'), uid) returning id into hid;
    insert into public.memberships (household_id, user_id, role, invited_by, created_by) values (hid, uid, 'owner', inv.created_by, uid);
    insert into public.persons (household_id, name, user_id, sort_order)
      values (hid, coalesce((select p.display_name from public.profiles p where p.user_id = uid), 'Me'), uid, 0);
    update public.memberships m set person_id = p.id from public.persons p
      where m.household_id = hid and m.user_id = uid and p.household_id = hid and p.user_id = uid;
    perform app.seed_household_defaults(hid, 'basic');
  end if;

  update public.invites set used_count = used_count + 1, accepted_by = uid, accepted_at = now() where id = inv.id;
  insert into public.user_prefs (user_id, active_household_id) values (uid, hid)
    on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  return hid;
end $$;
revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

-- Soft delete a household (owner only). A service-role job hard-deletes after 30 days.
create or replace function public.delete_household(p_household_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_role(p_household_id, array['owner']) then raise exception 'only an owner can delete a household' using errcode = '42501'; end if;
  update public.households set deleted_at = now() where id = p_household_id;
end $$;
revoke all on function public.delete_household(uuid) from public;
grant execute on function public.delete_household(uuid) to authenticated;

-- Allergy check in SQL so every writer (app, partner, Riker) gets the same answer. Code wins over the model.
create or replace function public.check_allergies(p_household_id uuid, p_ingredients text[])
returns table (ingredient text, rule_id uuid, person_id uuid, substitute text, severity text)
language sql security invoker stable set search_path = '' as $$
  select ing, r.id, r.applies_to_person_id, r.payload ->> 'substitute', coalesce(r.payload ->> 'severity', 'avoid')
  from unnest(p_ingredients) as ing
  join public.rules r on r.household_id = p_household_id and r.type = 'allergy' and r.active and r.deleted_at is null
  where lower(ing) ~ ('\m' || regexp_replace(lower(r.payload ->> 'ingredient'), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || 's?\M')
$$;
grant execute on function public.check_allergies(uuid, text[]) to authenticated;

-- Copy a library recipe into a household (used by the starter kit and "add from bank").
create or replace function public.copy_library_recipe(p_household_id uuid, p_library_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare rid uuid;
begin
  if not app.has_role(p_household_id, array['owner', 'editor']) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.recipes (household_id, library_id, title, description, cuisine, meal_type, base_yield, yield_unit, steps, freeze_notes, reheat_notes,
    equipment, tags, active_minutes, standing_minutes, total_minutes, dishes_count, source, source_url, status)
  select p_household_id, l.id, l.title, l.description, l.cuisine, l.meal_type, l.base_yield, l.yield_unit, l.steps, l.freeze_notes, l.reheat_notes,
    l.equipment, l.tags, l.active_minutes, l.standing_minutes, l.total_minutes, l.dishes_count, 'bank', l.source_url, 'approved'
  from public.recipe_library l where l.id = p_library_id
  returning id into rid;
  if rid is null then raise exception 'library recipe not found' using errcode = 'P0002'; end if;
  insert into public.recipe_ingredients (household_id, recipe_id, position, ingredient_name, canonical_name, amount, unit, preparation, optional, group_label, substitute)
  select p_household_id, rid, position, ingredient_name, canonical_name, amount, unit, preparation, optional, group_label, substitute
  from public.recipe_library_ingredients where recipe_id = p_library_id;
  return rid;
end $$;
grant execute on function public.copy_library_recipe(uuid, uuid) to authenticated;

-- Keep profiles in step with auth.users (Supabase). Harmless where auth.users is a shim.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)), new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'auth' and tablename = 'users') then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
    execute 'create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user()';
  end if;
end $$;
