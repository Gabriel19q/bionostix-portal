#!/usr/bin/env bash
# Runs all migrations against a throwaway local Postgres with Supabase stubs,
# then the security tests. Needs Postgres 15+ binaries (initdb, pg_ctl, psql).
set -euo pipefail
cd "$(dirname "$0")/.."

# initdb refuses to run as root: re-run as the postgres system user on a copy
if [ "$(id -u)" = "0" ]; then
  COPY="$(mktemp -d)"
  cp -r supabase scripts "$COPY/"
  chown -R postgres "$COPY"
  status=0
  su postgres -s /bin/bash -c "bash '$COPY/scripts/test-db.sh'" || status=$?
  rm -rf "$COPY"
  exit $status
fi

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
trap '"$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

"$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" start >/dev/null

PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/stubs.sql
for f in supabase/migrations/*.sql; do
  echo "migration: $f"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f supabase/tests/security_test.sql 2>&1 >/dev/null | sed "s/^psql:[^:]*:[0-9]*: //"
echo "ALL TESTS PASSED"
