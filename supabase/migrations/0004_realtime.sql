-- Supabase realtime publication. Skipped on plain Postgres (local tests, PocketBase port).
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['items', 'freezer_blocks', 'list_lines', 'list_sends', 'plan_entries', 'batches', 'recipes', 'activity_events', 'memberships', 'households']
    loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end $$;
