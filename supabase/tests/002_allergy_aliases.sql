-- Allergy alias tests: a family rule ("nuts") flags its members ("almond"), whole words only, with the exception list.
-- Run by supabase/scripts/test-rls.sh after the migrations and 001_tenancy.sql; self-contained like that file.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset footer off
create schema if not exists app_test;
create or replace function app_test.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
create or replace function app_test.as_user(uid uuid, email text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'role', 'authenticated')::text, true);
end $$;
-- Count of ingredients (from the list) that the household's rules flag, deduped per ingredient.
create or replace function app_test.flagged(hid uuid, ings text[]) returns bigint language sql as $$
  select count(distinct ingredient) from public.check_allergies(hid, ings)
$$;
grant usage on schema app_test to authenticated, anon;
grant execute on all functions in schema app_test to authenticated, anon;

delete from auth.users;
insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'cook@example.com', '{"display_name":"Cook"}')
on conflict do nothing;

begin;
set local role authenticated;
select app_test.as_user('55555555-5555-5555-5555-555555555555', 'cook@example.com');
select public.create_household('Alias House', 'America/Chicago', '77840', 'basic') as hid \gset

-- The alias table is readable and seeded with every family.
select app_test.assert((select count(distinct family) from app.allergen_aliases) = 11, 'eleven allergen families seeded');
select app_test.assert(exists (select 1 from app.allergen_aliases where family = 'nuts' and term = 'peanut'), 'nuts covers peanut');
select app_test.assert(not exists (select 1 from app.allergen_aliases where family = 'tree nuts' and term = 'peanut'), 'tree nuts leaves peanut out');

-- Nuts: every member, plural or singular, by whole word only.
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"nuts","severity":"severe"}');
select app_test.assert(app_test.flagged(:'hid', array['sliced almonds', 'walnut halves', 'pecans', 'roasted cashews', 'pistachios', 'hazelnuts', 'macadamia nuts', 'pine nuts', 'peanuts', 'peanut butter', 'mixed nuts']) = 11, 'nuts flags every nut');
select app_test.assert(app_test.flagged(:'hid', array['coconut', 'coconut milk', 'nutmeg', 'butternut squash', 'doughnuts', 'water chestnuts', 'rice']) = 0, 'nuts does not flag coconut, nutmeg, butternut, water chestnut');
select app_test.assert((select severity from public.check_allergies(:'hid', array['almonds']) limit 1) = 'severe', 'family match carries the rule severity');
-- One row per ingredient and rule even when several terms match ("peanut" and "nut").
select app_test.assert((select count(*) from public.check_allergies(:'hid', array['peanut nut mix'])) = 1, 'one row per ingredient and rule');
update public.rules set active = false where household_id = :'hid';

-- Tree nuts: no peanut.
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"tree nuts"}');
select app_test.assert(app_test.flagged(:'hid', array['almonds', 'pine nuts']) = 2, 'tree nuts flags almond and pine nut');
select app_test.assert(app_test.flagged(:'hid', array['peanuts', 'peanut butter']) = 0, 'tree nuts does not flag peanut');
update public.rules set active = false where household_id = :'hid';

-- Eggs: egg and mayonnaise, never eggplant.
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"eggs","substitute":"applesauce"}');
select app_test.assert(app_test.flagged(:'hid', array['2 eggs', '1 egg, beaten', 'egg noodles', 'mayonnaise']) = 4, 'eggs flags egg and mayonnaise');
select app_test.assert(app_test.flagged(:'hid', array['eggplant', '1 large eggplant, cubed', 'veggie burger']) = 0, 'eggs does not flag eggplant');
select app_test.assert((select substitute from public.check_allergies(:'hid', array['mayonnaise']) limit 1) = 'applesauce', 'alias match carries the substitute');
update public.rules set active = false where household_id = :'hid';

-- Shellfish.
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"shellfish"}');
select app_test.assert(app_test.flagged(:'hid', array['shrimp, peeled', 'prawns', 'crab meat', 'lobster tail', 'crawfish', 'sea scallops', 'clams', 'mussels', 'oysters']) = 9, 'shellfish flags every member');
select app_test.assert(app_test.flagged(:'hid', array['oyster mushrooms', 'crab apples', 'salmon']) = 0, 'shellfish skips oyster mushroom, crab apple, salmon');
update public.rules set active = false where household_id = :'hid';

-- Dairy, with plant milks and nut butters left out.
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"dairy"}');
select app_test.assert(app_test.flagged(:'hid', array['whole milk', 'cheddar cheese', 'unsalted butter', 'heavy cream', 'half and half', 'half-and-half', 'greek yogurt', 'whey protein', 'ghee', 'cheddar', 'fresh mozzarella', 'grated parmesan', 'feta']) = 13, 'dairy flags every member');
select app_test.assert(app_test.flagged(:'hid', array['coconut milk', 'almond milk', 'oat milk', 'soy milk', 'peanut butter', 'almond butter', 'cocoa butter', 'coconut cream', 'cream of tartar', 'olive oil']) = 0, 'dairy skips plant milks and nut butters');
select app_test.assert(app_test.flagged(:'hid', array['coconut milk and whole milk']) = 1, 'an exception phrase does not hide a real match');
select app_test.assert(app_test.flagged(:'hid', array['coconut milk, coconut milk', 'coconut milk coconut cream']) = 0, 'a repeated exception phrase is still the exception');
update public.rules set active = false where household_id = :'hid';

-- Gluten and wheat share one list.
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"gluten"}');
select app_test.assert(app_test.flagged(:'hid', array['wheat berries', 'flour', 'all-purpose flour', 'bread flour', 'cake flour', 'sourdough bread', 'pasta', 'couscous', 'pearl barley', 'rye', 'seitan', 'soy sauce']) = 12, 'gluten flags every member');
select app_test.assert(app_test.flagged(:'hid', array['rice', 'cornstarch', 'buckwheat']) = 0, 'gluten skips rice, cornstarch, buckwheat');
update public.rules set active = false where household_id = :'hid';
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"wheat"}');
select app_test.assert(app_test.flagged(:'hid', array['all-purpose flour', 'pasta', 'soy sauce']) = 3, 'wheat flags the gluten list');
update public.rules set active = false where household_id = :'hid';

-- Soy, sesame, fish.
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"soy"}');
select app_test.assert(app_test.flagged(:'hid', array['soy sauce', 'firm tofu', 'edamame', 'tempeh', 'white miso', 'soy milk']) = 6, 'soy flags every member');
update public.rules set active = false where household_id = :'hid';
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"sesame"}');
select app_test.assert(app_test.flagged(:'hid', array['tahini', 'sesame seeds']) = 2, 'sesame flags tahini');
select app_test.assert(app_test.flagged(:'hid', array['soy sauce']) = 0, 'sesame skips soy sauce');
update public.rules set active = false where household_id = :'hid';
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"fish"}');
select app_test.assert(app_test.flagged(:'hid', array['salmon fillet', 'canned tuna', 'cod', 'tilapia', 'anchovies', 'fish sauce', 'white fish']) = 7, 'fish flags every member');
select app_test.assert(app_test.flagged(:'hid', array['shrimp', 'oyster mushrooms']) = 0, 'fish skips shrimp and oyster mushroom');
update public.rules set active = false where household_id = :'hid';

-- A plain rule with no family still works by whole word, and inactive rules are ignored.
insert into public.rules (household_id, type, payload) values (:'hid', 'allergy', '{"ingredient":"cilantro"}');
select app_test.assert(app_test.flagged(:'hid', array['fresh cilantro', 'rice']) = 1, 'plain rule matches whole word');
select app_test.assert((select count(*) from public.check_allergies(:'hid', array['almonds', '2 eggs', 'shrimp'])) = 0, 'inactive family rules are ignored');

rollback;
select 'allergy alias tests passed' as result;
