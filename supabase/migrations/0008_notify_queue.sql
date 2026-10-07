-- Push notification queue (spec: Notifications).
--
-- The notify edge function (supabase/functions/notify) runs hourly with the service role. Time-based notifications
-- (low/out at 5 pm, expiring and expired at 8 am, the weekly shop, stale prices, budget lines) are computed by the
-- function and recorded here with status 'sent'. "List sent by another member" is immediate, so a trigger on
-- list_sends queues it here and the function drains the queue on its next run (or right away when called).
--
-- One row per dedupe key per household: an hourly run that fires twice, or catches up late, never sends twice.
-- Only the service role touches this table; RLS is on with no policies for signed-in users.

create table public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  type text not null check (type in ('low_out_daily', 'expiring_2_days', 'expired', 'weekly_shop', 'cook_week_prep', 'price_book_stale', 'budget_80', 'budget_100', 'list_sent')),
  dedupe_key text not null,
  title text not null,
  body text not null default '',
  url text not null default '/',
  audience text not null default 'editors' check (audience in ('owner', 'editors', 'all_but_sender')),
  -- The member who caused it (the sender of a list), who does not get it.
  exclude_user_id uuid,
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  -- How many phones took it; 0 with status 'sent' means nobody had this kind on.
  sent_count integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (household_id, dedupe_key)
);
create index notification_queue_status_idx on public.notification_queue (status, created_at);
create index notification_queue_household_idx on public.notification_queue (household_id, created_at desc);

alter table public.notification_queue enable row level security;

-- Queue "list sent" the moment a send is recorded. Security definer so the sender's RLS does not apply to the queue.
create or replace function app.queue_list_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  retailer_name text;
  sender_name text;
  line_text text;
begin
  if new.status not in ('ordered', 'open') then
    return new;
  end if;
  select r.name into retailer_name from public.retailers r where r.id = new.retailer_id;
  select coalesce(nullif(p.display_name, ''), 'Someone') into sender_name from public.profiles p where p.user_id = new.sent_by;
  line_text := case when new.line_count = 1 then '1 line' else new.line_count || ' lines' end;
  insert into public.notification_queue (household_id, type, dedupe_key, title, body, url, audience, exclude_user_id)
  values (
    new.household_id,
    'list_sent',
    'list_sent:' || new.id,
    coalesce(sender_name, 'Someone') || ' sent the list' || case when retailer_name is null then '' else ' to ' || retailer_name end,
    line_text || ' on the way. Tap to see what was ordered.',
    '/shop/ordered',
    'all_but_sender',
    new.sent_by
  )
  on conflict (household_id, dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists list_sends_queue_notification on public.list_sends;
create trigger list_sends_queue_notification
  after insert on public.list_sends
  for each row execute function app.queue_list_sent();
