#!/usr/bin/env bash
# Apply every migration to the local Postgres, then run the SQL tests. Exit non-zero on any failure.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
export QM_PG_DIR=${QM_PG_DIR:-/tmp/qm-pg} QM_PG_PORT=${QM_PG_PORT:-5433}
export PGHOST=$QM_PG_DIR PGPORT=$QM_PG_PORT PGUSER=postgres
bash "$HERE/local-pg.sh" up >/dev/null
bash "$HERE/local-pg.sh" reset >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -f "$f"
done
fail=0
for t in "$ROOT"/supabase/tests/*.sql; do
  echo "test $(basename "$t")"
  if ! psql -v ON_ERROR_STOP=1 -q -f "$t"; then fail=1; fi
done
if [ $fail -ne 0 ]; then echo "RLS TESTS FAILED"; exit 1; fi
echo "all SQL tests passed"
