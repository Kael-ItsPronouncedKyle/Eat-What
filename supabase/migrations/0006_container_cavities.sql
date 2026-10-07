-- Containers: count_owned is now the number of trays (or bags, tubs, jars) owned and
-- cavities is the portions one tray holds at once. Capacity in blocks = count_owned * cavities.
alter table public.containers
  add column cavities integer not null default 1 check (cavities >= 1);

-- Existing Souper Cubes rows were seeded as trays already (2, 2, 1); give them their real cavity counts.
update public.containers set cavities = 4 where kind = 'tray' and capacity_ml = 480 and cavities = 1;
update public.containers set cavities = 6 where kind = 'tray' and capacity_ml = 240 and cavities = 1;
update public.containers set cavities = 8 where kind = 'tray' and capacity_ml = 120 and cavities = 1;

-- Re-declare the seed so new households get cavities too. Same rows as before plus the cavities column.
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
    insert into public.containers (household_id, name, kind, capacity_ml, count_owned, cavities, disposable, oven_safe, microwave_safe, sort_order) values
      (hid, 'Souper Cubes 2-cup tray', 'tray', 480, 2, 4, false, false, false, 0),
      (hid, 'Souper Cubes 1-cup tray', 'tray', 240, 2, 6, false, false, false, 1),
      (hid, 'Souper Cubes 1/2-cup tray', 'tray', 120, 1, 8, false, false, false, 2),
      (hid, 'Quart zip bag', 'bag', 950, 20, 1, true, false, false, 3);
  elsif kit = 'cheapest' then
    insert into public.containers (household_id, name, kind, capacity_ml, count_owned, cavities, disposable, oven_safe, microwave_safe, sort_order) values
      (hid, 'Quart zip bag', 'bag', 950, 25, 1, true, false, false, 0),
      (hid, 'Gallon zip bag', 'bag', 3800, 10, 1, true, false, false, 1),
      (hid, 'Muffin tin (12)', 'muffin_tin', 90, 1, 12, false, true, false, 2),
      (hid, 'Saved tub', 'tub', 500, 6, 1, false, false, true, 3);
  else
    insert into public.containers (household_id, name, kind, capacity_ml, count_owned, cavities, disposable, oven_safe, microwave_safe, sort_order) values
      (hid, 'Quart zip bag', 'bag', 950, 20, 1, true, false, false, 0),
      (hid, 'Deli quart', 'tub', 950, 6, 1, false, false, true, 1),
      (hid, 'Foil pan', 'pan', 2400, 4, 1, true, true, false, 2);
  end if;
end $$;
