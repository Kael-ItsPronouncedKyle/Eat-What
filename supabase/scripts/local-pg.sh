#!/usr/bin/env bash
# Throwaway local Postgres for schema and RLS tests. No Supabase CLI needed.
# Usage: local-pg.sh up | down | psql [args]
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=${QM_PG_DIR:-/tmp/qm-pg}
PORT=${QM_PG_PORT:-5433}
export PGHOST=$DIR PGPORT=$PORT PGUSER=postgres
run_as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi; }
case "${1:-}" in
  up)
    mkdir -p "$DIR"; [ "$(id -u)" = "0" ] && chown postgres "$DIR" || true
    if [ ! -d "$DIR/data" ]; then
      run_as_pg "$PGBIN/initdb -D $DIR/data -A trust -U postgres >$DIR/initdb.log 2>&1"
    fi
    if ! "$PGBIN/pg_isready" -h "$DIR" -p "$PORT" >/dev/null 2>&1; then
      run_as_pg "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c log_min_messages=warning' -l $DIR/pg.log start >/dev/null"
    fi
    "$PGBIN/pg_isready" -h "$DIR" -p "$PORT"
    # Supabase shims so migrations written for Supabase run unchanged.
    psql -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
SQL
    echo "local postgres up at $DIR port $PORT"
    ;;
  down)
    run_as_pg "$PGBIN/pg_ctl -D $DIR/data stop -m fast >/dev/null" || true
    echo "stopped"
    ;;
  reset)
    psql -v ON_ERROR_STOP=1 -q -c "drop schema if exists public cascade; create schema public; grant all on schema public to postgres; grant usage on schema public to anon, authenticated, service_role;"
    echo "public schema reset"
    ;;
  psql)
    shift; exec psql "$@"
    ;;
  *)
    echo "usage: $0 up|down|reset|psql [args]"; exit 1;;
esac
