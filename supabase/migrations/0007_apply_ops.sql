-- Delta ops. Two phones that each ate one block offline both land: the client queues "count_remaining minus 1", not
-- "count_remaining is 1", and apply_ops adds it on the server. Counters never go below zero.
--
-- apply_ops(ops jsonb) takes an array of { table, id, kind: 'patch' | 'delta' | 'softDelete', payload, base? } and
-- returns one result per op in the same order. It runs as the caller (security invoker), so every row still passes RLS:
-- a member of another household gets ok=false and nothing changes. A delta whose `base` (the value the phone saw when
-- it queued the op) differs from the value found still applies, and a row goes into public.sync_events so the activity
-- feed can say "counted twice" later.

create table public.sync_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  table_name text not null,
  row_id uuid not null,
  kind text not null check (kind in ('base_mismatch')),
  detail jsonb,
  created_at timestamptz not null default now()
);
create index sync_events_household_idx on public.sync_events (household_id, created_at desc);
grant select, insert, update, delete on public.sync_events to authenticated;
grant all on public.sync_events to service_role;

-- Same shape as activity_events: anyone who can write may log one; nobody deletes history from the client.
select app.apply_tenant_policies('sync_events', array['owner', 'editor', 'agent'], array[]::text[]);

create or replace function public.apply_ops(ops jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  op jsonb;
  results jsonb := '[]'::jsonb;
  res jsonb;
  v_table text;
  v_kind text;
  v_id uuid;
  v_payload jsonb;
  v_field text;
  v_delta numeric;
  v_base numeric;
  v_hid uuid;
  v_cur numeric;
  v_next numeric;
  v_col text;
  v_type text;
  v_set text;
  v_key text;
  n integer;
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if ops is null or jsonb_typeof(ops) <> 'array' then raise exception 'ops must be a json array'; end if;

  for op in select * from jsonb_array_elements(ops) loop
    v_table := null; v_kind := null; v_id := null; res := null;
    begin
      v_table := op ->> 'table';
      v_kind := op ->> 'kind';
      v_payload := op -> 'payload';
      if v_table is null or v_table !~ '^[a-z_]+$' then raise exception 'bad table name'; end if;
      if not exists (
        select 1 from pg_attribute a
        where a.attrelid = ('public.' || quote_ident(v_table))::regclass and a.attname = 'household_id' and a.attnum > 0 and not a.attisdropped
      ) then raise exception 'not a household table: %', v_table; end if;
      v_id := (op ->> 'id')::uuid;
      if v_id is null then raise exception 'op needs an id'; end if;

      if v_kind = 'delta' then
        v_field := v_payload ->> 'field';
        v_delta := (v_payload ->> 'delta')::numeric;
        v_base := (op ->> 'base')::numeric;
        if v_delta is null then raise exception 'delta needs a number'; end if;
        if not ((v_table = 'items' and v_field = 'qty') or (v_table = 'freezer_blocks' and v_field = 'count_remaining')) then
          raise exception 'delta is not allowed on %.%', v_table, coalesce(v_field, '?');
        end if;
        execute format('select household_id, %I from public.%I where id = $1 for update', v_field, v_table) into v_hid, v_cur using v_id;
        if v_hid is null then raise exception 'row not found' using errcode = 'P0002'; end if;
        v_next := greatest(0, coalesce(v_cur, 0) + v_delta);
        if v_table = 'items' then
          -- Count mode re-derives status the same way the app does: 0 is out, under par is low, else ok.
          update public.items set qty = v_next,
            status = case when track_mode = 'count'
              then (case when v_next <= 0 then 'out' when par is not null and par > 0 and v_next < par then 'low' else 'ok' end)
              else status end
            where id = v_id;
        else
          update public.freezer_blocks set count_remaining = v_next::integer where id = v_id;
        end if;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'not allowed' using errcode = '42501'; end if;
        res := jsonb_build_object('ok', true, 'kind', v_kind, 'table', v_table, 'id', v_id, 'value', v_next, 'base_mismatch', false);
        if v_base is not null and v_base is distinct from coalesce(v_cur, 0) then
          insert into public.sync_events (household_id, table_name, row_id, kind, detail)
            values (v_hid, v_table, v_id, 'base_mismatch',
              jsonb_build_object('field', v_field, 'delta', v_delta, 'base', v_base, 'found', coalesce(v_cur, 0), 'result', v_next));
          res := res || jsonb_build_object('base_mismatch', true);
        end if;

      elsif v_kind = 'patch' then
        if v_payload is null or jsonb_typeof(v_payload) <> 'object' then raise exception 'patch needs an object payload'; end if;
        v_set := '';
        for v_key in select jsonb_object_keys(v_payload) loop
          if v_key in ('id', 'household_id', 'created_at', 'created_by') then raise exception 'patch may not change %', v_key; end if;
          select a.attname, format_type(a.atttypid, a.atttypmod) into v_col, v_type from pg_attribute a
            where a.attrelid = ('public.' || quote_ident(v_table))::regclass and a.attname = v_key and a.attnum > 0 and not a.attisdropped;
          if v_col is null then raise exception 'unknown column %.%', v_table, v_key; end if;
          if v_type = 'jsonb' then
            v_set := v_set || format('%s%I = (case when jsonb_typeof($2 -> %L) = ''null'' then null else $2 -> %L end)',
              case when v_set = '' then '' else ', ' end, v_col, v_key, v_key);
          else
            v_set := v_set || format('%s%I = (case when jsonb_typeof($2 -> %L) = ''null'' then null else ($2 ->> %L)::%s end)',
              case when v_set = '' then '' else ', ' end, v_col, v_key, v_key, v_type);
          end if;
        end loop;
        if v_set = '' then raise exception 'patch has no columns'; end if;
        execute format('update public.%I set %s where id = $1', v_table, v_set) using v_id, v_payload;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'row not found' using errcode = 'P0002'; end if;
        res := jsonb_build_object('ok', true, 'kind', v_kind, 'table', v_table, 'id', v_id);

      elsif v_kind = 'softDelete' then
        execute format('update public.%I set deleted_at = now() where id = $1', v_table) using v_id;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'row not found' using errcode = 'P0002'; end if;
        res := jsonb_build_object('ok', true, 'kind', v_kind, 'table', v_table, 'id', v_id);

      else
        raise exception 'unknown op kind %', coalesce(v_kind, '?');
      end if;
    exception when others then
      -- Only this op rolls back; the rest of the batch still applies.
      res := jsonb_build_object('ok', false, 'kind', v_kind, 'table', v_table, 'id', op ->> 'id', 'error', sqlerrm, 'code', sqlstate);
    end;
    results := results || res;
  end loop;
  return results;
end $$;
revoke all on function public.apply_ops(jsonb) from public;
grant execute on function public.apply_ops(jsonb) to authenticated;
