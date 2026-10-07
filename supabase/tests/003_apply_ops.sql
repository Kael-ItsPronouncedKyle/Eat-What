-- apply_ops tests: delta adds and clamps, a base mismatch leaves a sync_events row, patch and softDelete apply,
-- and a member of another household cannot adjust. Self-contained like 001 and 002.
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
-- One op through apply_ops; returns that op's result object.
create or replace function app_test.one_op(op jsonb) returns jsonb language sql as $$
  select public.apply_ops(jsonb_build_array(op)) -> 0
$$;
grant usage on schema app_test to authenticated, anon;
grant execute on all functions in schema app_test to authenticated, anon;

delete from auth.users;
insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'delta@example.com', '{"display_name":"Delta"}'),
  ('77777777-7777-7777-7777-777777777777', 'other@example.com', '{"display_name":"Other"}')
on conflict do nothing;

begin;
set local role authenticated;
select app_test.as_user('66666666-6666-6666-6666-666666666666', 'delta@example.com');
select public.create_household('Delta House', 'America/Chicago', '76207', 'basic') as hid \gset

insert into public.freezer_blocks (household_id, title, count_remaining, count_initial) values (:'hid', 'Chili', 2, 2);
select id as block from public.freezer_blocks where title = 'Chili' \gset
insert into public.items (household_id, name, canonical_name, category, track_mode, status, qty, par, unit)
  values (:'hid', 'Eggs', 'egg', 'dairy', 'count', 'ok', 5, 2, 'each');
select id as eggs from public.items where name = 'Eggs' \gset

-- Two phones each ate one block offline, both saw 2. Both land: the counter converges to 0.
select app_test.one_op(jsonb_build_object('table', 'freezer_blocks', 'id', :'block', 'kind', 'delta', 'payload', '{"field":"count_remaining","delta":-1}'::jsonb, 'base', 2)) as r1 \gset
select app_test.assert((:'r1'::jsonb ->> 'ok')::boolean, 'first delta applied');
select app_test.assert((:'r1'::jsonb ->> 'value')::numeric = 1, 'first delta leaves 1');
select app_test.assert(not (:'r1'::jsonb ->> 'base_mismatch')::boolean, 'first delta base matched');
select app_test.assert((select count(*) from public.sync_events) = 0, 'no sync event when base matches');
select app_test.one_op(jsonb_build_object('table', 'freezer_blocks', 'id', :'block', 'kind', 'delta', 'payload', '{"field":"count_remaining","delta":-1}'::jsonb, 'base', 2)) as r2 \gset
select app_test.assert((:'r2'::jsonb ->> 'ok')::boolean, 'second delta applied even though its base was stale');
select app_test.assert((:'r2'::jsonb ->> 'base_mismatch')::boolean, 'second delta reports the mismatch');
select app_test.assert((select count_remaining from public.freezer_blocks where id = :'block') = 0, 'two eaten: counter converged to 0');
select app_test.assert((select count(*) from public.sync_events where row_id = :'block' and kind = 'base_mismatch') = 1, 'base mismatch logged one sync event');
select app_test.assert((select detail ->> 'base' from public.sync_events limit 1) = '2' and (select detail ->> 'found' from public.sync_events limit 1) = '1', 'sync event carries base and found');

-- Clamp at zero.
select app_test.one_op(jsonb_build_object('table', 'freezer_blocks', 'id', :'block', 'kind', 'delta', 'payload', '{"field":"count_remaining","delta":-5}'::jsonb)) as r3 \gset
select app_test.assert((:'r3'::jsonb ->> 'ok')::boolean and (:'r3'::jsonb ->> 'value')::numeric = 0, 'delta below zero clamps at 0');
select app_test.assert((select count_remaining from public.freezer_blocks where id = :'block') = 0, 'row clamped at 0');
select app_test.assert((select count(*) from public.sync_events) = 1, 'an op without base logs nothing');

-- Items: qty delta re-derives status in count mode.
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'delta', 'payload', '{"field":"qty","delta":-4}'::jsonb, 'base', 5)) as r4 \gset
select app_test.assert((:'r4'::jsonb ->> 'ok')::boolean and (:'r4'::jsonb ->> 'value')::numeric = 1, 'eggs 5 - 4 = 1');
select app_test.assert((select status from public.items where id = :'eggs') = 'low', 'under par reads low');
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'delta', 'payload', '{"field":"qty","delta":-1}'::jsonb, 'base', 1));
select app_test.assert((select status from public.items where id = :'eggs') = 'out', 'zero reads out');
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'delta', 'payload', '{"field":"qty","delta":6}'::jsonb, 'base', 0));
select app_test.assert((select qty from public.items where id = :'eggs') = 6 and (select status from public.items where id = :'eggs') = 'ok', 'restock reads ok');

-- Delta is only for the two counters.
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'delta', 'payload', '{"field":"par","delta":1}'::jsonb)) as r5 \gset
select app_test.assert(not (:'r5'::jsonb ->> 'ok')::boolean, 'delta on par is refused');
select app_test.assert((select par from public.items where id = :'eggs') = 2, 'par untouched');

-- A batch: patch, delta and softDelete in one call, results in order; one bad op does not stop the rest.
select public.apply_ops(jsonb_build_array(
  jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'patch', 'payload', '{"notes":"brown","use_by":"2030-01-02","updated_at":"2030-01-01T00:00:00Z"}'::jsonb),
  jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'patch', 'payload', '{"no_such_column":1}'::jsonb),
  jsonb_build_object('table', 'freezer_blocks', 'id', :'block', 'kind', 'delta', 'payload', '{"field":"count_remaining","delta":3}'::jsonb, 'base', 0),
  jsonb_build_object('table', 'freezer_blocks', 'id', :'block', 'kind', 'softDelete', 'payload', null)
)) as batch \gset
select app_test.assert(jsonb_array_length(:'batch'::jsonb) = 4, 'one result per op');
select app_test.assert((:'batch'::jsonb -> 0 ->> 'ok')::boolean, 'patch applied');
select app_test.assert((select notes from public.items where id = :'eggs') = 'brown' and (select use_by from public.items where id = :'eggs') = date '2030-01-02', 'patch set text and date columns');
select app_test.assert(not (:'batch'::jsonb -> 1 ->> 'ok')::boolean and (:'batch'::jsonb -> 1 ->> 'error') like 'unknown column%', 'unknown column is refused with a reason');
select app_test.assert((:'batch'::jsonb -> 2 ->> 'ok')::boolean and (:'batch'::jsonb -> 2 ->> 'value')::numeric = 3, 'delta after a failed op still applies');
select app_test.assert((:'batch'::jsonb -> 3 ->> 'ok')::boolean, 'softDelete applied');
select app_test.assert((select deleted_at from public.freezer_blocks where id = :'block') is not null, 'block tombstoned');
-- Patch can null a column and cannot move a row between households.
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'patch', 'payload', '{"notes":null}'::jsonb));
select app_test.assert((select notes from public.items where id = :'eggs') is null, 'patch nulls a column');
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'patch', 'payload', '{"household_id":"00000000-0000-0000-0000-000000000001"}'::jsonb)) as r6 \gset
select app_test.assert(not (:'r6'::jsonb ->> 'ok')::boolean, 'patch may not change household_id');
-- Unknown kind and unknown table are refused per op.
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'explode', 'payload', null)) as r7 \gset
select app_test.assert(not (:'r7'::jsonb ->> 'ok')::boolean, 'unknown kind refused');
select app_test.one_op(jsonb_build_object('table', 'pg_shadow', 'id', :'eggs', 'kind', 'softDelete', 'payload', null)) as r8 \gset
select app_test.assert(not (:'r8'::jsonb ->> 'ok')::boolean, 'non household table refused');

-- RLS: a member of another household cannot adjust, patch or delete these rows, and cannot see the sync event.
select app_test.as_user('77777777-7777-7777-7777-777777777777', 'other@example.com');
select public.create_household('Other House', 'America/Chicago', '77840', 'basic') as other \gset
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'delta', 'payload', '{"field":"qty","delta":-6}'::jsonb, 'base', 6)) as x1 \gset
select app_test.assert(not (:'x1'::jsonb ->> 'ok')::boolean, 'other household delta refused');
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'patch', 'payload', '{"name":"Hacked"}'::jsonb)) as x2 \gset
select app_test.assert(not (:'x2'::jsonb ->> 'ok')::boolean, 'other household patch refused');
select app_test.one_op(jsonb_build_object('table', 'items', 'id', :'eggs', 'kind', 'softDelete', 'payload', null)) as x3 \gset
select app_test.assert(not (:'x3'::jsonb ->> 'ok')::boolean, 'other household softDelete refused');
select app_test.assert((select count(*) from public.sync_events) = 0, 'sync events hidden from other households');

select app_test.as_user('66666666-6666-6666-6666-666666666666', 'delta@example.com');
select app_test.assert((select qty from public.items where id = :'eggs') = 6, 'eggs untouched by the other household');
select app_test.assert((select name from public.items where id = :'eggs') = 'Eggs', 'name untouched by the other household');
select app_test.assert((select deleted_at from public.items where id = :'eggs') is null, 'eggs not tombstoned by the other household');
select app_test.assert((select count(*) from public.sync_events) = 1, 'owner still sees the sync event');

-- Anonymous gets nothing.
reset role;
set local role anon;
select app_test.assert(not has_function_privilege('anon', 'public.apply_ops(jsonb)', 'execute'), 'anon cannot call apply_ops');

rollback;
select 'apply_ops tests passed' as result;
