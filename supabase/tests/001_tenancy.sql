-- Tenancy and role tests. Run by supabase/scripts/test-rls.sh after the migrations.
-- Simulates signed-in users the way PostgREST does: role authenticated + request.jwt.claim.sub.
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
create or replace function app_test.expect_error(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    return;
  end;
  raise exception 'ASSERT FAILED (expected an error): %', msg;
end $$;
grant usage on schema app_test to authenticated, anon;
grant execute on all functions in schema app_test to authenticated, anon;

-- Seed auth users (the shim table) so the profile trigger fires.
delete from auth.users;
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'liam@example.com', '{"display_name":"Liam"}'),
  ('22222222-2222-2222-2222-222222222222', 'sarah@example.com', '{"display_name":"Sarah"}'),
  ('33333333-3333-3333-3333-333333333333', 'daughter@example.com', '{"display_name":"Em"}'),
  ('44444444-4444-4444-4444-444444444444', 'riker@example.com', '{"display_name":"Riker"}')
on conflict do nothing;

begin;
set local role authenticated;

-- Liam creates Denton.
select app_test.as_user('11111111-1111-1111-1111-111111111111', 'liam@example.com');
select public.create_household('Denton', 'America/Chicago', '76207', 'souper_cubes') as denton \gset
select app_test.assert((select count(*) from public.households) = 1, 'liam sees exactly one household');
select app_test.assert((select role from public.memberships where household_id = :'denton') = 'owner', 'liam is owner');
select app_test.assert((select count(*) from public.locations where household_id = :'denton') = 7, 'default locations seeded');
select app_test.assert((select count(*) from public.containers where household_id = :'denton') = 4, 'souper cubes kit seeded');
select app_test.assert((select active_household_id from public.user_prefs where user_id = auth.uid()) = :'denton', 'active household set');

-- Liam adds items.
insert into public.items (household_id, name, canonical_name, category, track_mode, status)
  values (:'denton', 'Chicken thighs', 'chicken thighs', 'meat', 'count', 'ok');
insert into public.items (household_id, name, canonical_name, category) values (:'denton', 'Paper towels', 'paper towels', 'paper');
select app_test.assert((select count(*) from public.items) = 2, 'liam sees his two items');
select app_test.assert((select created_by from public.items limit 1) = auth.uid(), 'created_by filled by trigger');

-- Liam invites Sarah as editor and Em to a new household.
select public.create_invite(:'denton', 'member', 'sarah@example.com', 'editor') as sarah_token \gset
select public.create_invite(:'denton', 'household', null, 'owner', 'College Station') as cs_token \gset
select app_test.assert((select count(*) from public.invites) = 2, 'owner sees invites');

-- Sarah: cannot see Denton before accepting.
select app_test.as_user('22222222-2222-2222-2222-222222222222', 'sarah@example.com');
select app_test.assert((select count(*) from public.items) = 0, 'sarah sees nothing before accepting');
select app_test.assert((select count(*) from public.invites) = 0, 'invites hidden from non-owners');
select public.accept_invite(:'sarah_token') as sarah_hid \gset
select app_test.assert(:'sarah_hid' = :'denton', 'sarah joined denton');
select app_test.assert((select count(*) from public.items) = 2, 'sarah sees denton items');
update public.items set status = 'low' where name = 'Chicken thighs';
select app_test.assert((select status from public.items where name = 'Chicken thighs') = 'low', 'editor can update items');
-- Editors cannot touch retailers or invites.
select app_test.expect_error(format('insert into public.retailers (household_id, name, kind) values (%L, ''Instacart'', ''instacart'')', :'denton'), 'editor inserted a retailer');
select app_test.assert((select count(*) from public.retailers) = 0, 'editor could not add a retailer');
-- Sarah cannot promote herself.
select app_test.expect_error('update public.memberships set role = ''owner'' where user_id = auth.uid()', 'editor promoted herself');
select app_test.assert((select role from public.memberships where user_id = auth.uid()) = 'editor', 'sarah still editor');
-- Sarah can set her own energy.
update public.memberships set energy_level = 'little', energy_set_on = current_date where user_id = auth.uid();
select app_test.assert((select energy_level from public.memberships where user_id = auth.uid()) = 'little', 'member sets own energy');
-- A second accept of a one-use token fails.
select app_test.expect_error(format('select public.accept_invite(%L)', :'sarah_token'), 'token reused');

-- Em accepts the household invite: a brand new tenant.
select app_test.as_user('33333333-3333-3333-3333-333333333333', 'daughter@example.com');
select public.accept_invite(:'cs_token') as cs \gset
select app_test.assert(:'cs' <> :'denton', 'college station is a new household');
select app_test.assert((select name from public.households where id = :'cs') = 'College Station', 'household named from invite');
select app_test.assert((select count(*) from public.items) = 0, 'college station sees no denton items');
select app_test.assert((select count(*) from public.households) = 1, 'college station sees only itself');
insert into public.items (household_id, name, canonical_name, category) values (:'cs', 'Tortillas', 'tortillas', 'bakery');
-- Cross-tenant insert is rejected.
select app_test.expect_error(format('insert into public.items (household_id, name, canonical_name, category) values (%L, ''Sneaky'', ''sneaky'', ''other'')', :'denton'), 'cross tenant insert succeeded');
-- Cross-tenant update silently affects zero rows.
update public.items set name = 'Hacked' where household_id = :'denton';
select app_test.assert((select count(*) from public.items where name = 'Hacked') = 0, 'cross tenant update affected nothing');
-- Child row with mismatched household is rejected by the composite FK.
insert into public.item_aliases (household_id, item_id, alias) values (:'cs', (select id from public.items where name = 'Tortillas'), 'torts');
select app_test.expect_error(format('insert into public.item_aliases (household_id, item_id, alias) values (%L, ''00000000-0000-0000-0000-000000000001'', ''ghost'')', :'cs'), 'orphan alias inserted');

-- Liam sees Denton only and Sarah on the roster; the last owner cannot leave.
select app_test.as_user('11111111-1111-1111-1111-111111111111', 'liam@example.com');
select app_test.assert((select count(*) from public.items) = 2, 'liam still sees only denton items');
select app_test.assert((select count(*) from public.memberships where household_id = :'denton') = 2, 'roster shows two members');
select app_test.assert((select count(*) from public.profiles) = 2, 'liam sees profiles of his household only');
select app_test.expect_error('delete from public.memberships where user_id = auth.uid()', 'last owner left');
select app_test.assert((select count(*) from public.memberships where user_id = auth.uid()) = 1, 'owner membership intact');
-- Owner adds a retailer and routes paper goods there.
insert into public.retailers (household_id, name, kind, is_primary_other) values (:'denton', 'Amazon', 'amazon', true);
insert into public.routing_rules (household_id, match_kind, match_value, retailer_id)
  values (:'denton', 'category', 'paper', (select id from public.retailers where name = 'Amazon'));
select app_test.assert((select count(*) from public.routing_rules) = 1, 'routing rule stored');
-- Allergy check.
insert into public.rules (household_id, type, payload) values (:'denton', 'allergy', '{"ingredient":"coconut","substitute":"lime juice","severity":"avoid"}');
select app_test.assert((select count(*) from public.check_allergies(:'denton', array['coconut milk', 'rice'])) = 1, 'allergy check flags coconut milk');
insert into public.rules (household_id, type, payload) values (:'denton', 'allergy', '{"ingredient":"egg","severity":"severe"}');
select app_test.assert((select count(*) from public.check_allergies(:'denton', array['eggplant', 'veggie burger', '2 eggs', 'egg noodles'])) = 2, 'allergy check matches whole words only');

-- Riker joins as agent: may draft a list line, may not mark it ordered, may not delete.
select public.create_invite(:'denton', 'member', 'riker@example.com', 'agent') as riker_token \gset
select app_test.as_user('44444444-4444-4444-4444-444444444444', 'riker@example.com');
select public.accept_invite(:'riker_token');
insert into public.list_lines (household_id, name, qty, unit, reasons) values (:'denton', 'Dawn', 1, 'bottle', '[{"kind":"low"}]');
select app_test.expect_error('update public.list_lines set status = ''ordered'' where name = ''Dawn''', 'agent ordered');
select app_test.assert((select status from public.list_lines where name = 'Dawn') = 'open', 'agent could not mark ordered');
delete from public.list_lines where name = 'Dawn';
select app_test.assert((select count(*) from public.list_lines where name = 'Dawn') = 1, 'agent could not delete');
select app_test.expect_error(format('insert into public.list_sends (household_id) values (%L)', :'denton'), 'agent sent');

-- Anonymous gets nothing.
reset role;
set local role anon;
select app_test.expect_error('select count(*) from public.items', 'anon read items');

rollback;
select 'tenancy tests passed' as result;
