#!/usr/bin/env bash
# Applies the migration to a throwaway local Postgres and checks row level security with two users.
# Needs initdb, pg_ctl and psql on PATH (brew install postgresql, or apt-get install postgresql).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
for tool in initdb pg_ctl psql; do
  command -v "$tool" >/dev/null 2>&1 || { echo "SKIPPED: $tool not found. Install PostgreSQL to run the RLS test."; exit 0; }
done
dir="$(mktemp -d)"
port="${PGPORT_TEST:-55441}"
cleanup() { pg_ctl -D "$dir/db" stop -m fast >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT
initdb -D "$dir/db" -U postgres -A trust >/dev/null
pg_ctl -D "$dir/db" -o "-p $port -k '' -c listen_addresses=127.0.0.1" -l "$dir/log" -w start >/dev/null
p() { psql -X -q -h 127.0.0.1 -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
p -f "$root/supabase/tests/auth_stub.sql"
for f in "$root"/supabase/migrations/*.sql; do p -f "$f"; done
echo "migration applied"
out="$(p -At -f "$root/supabase/tests/rls_check.sql" 2>&1)"
echo "$out"
fail=0
expect() { [[ "$out" == *"$1"* ]] || { echo "MISSING: $1"; fail=1; }; }
expect "tables without forced rls|0"
expect "public tables|14"
expect "tables where A sees its row|14"
expect "duplicate idempotency key|refused"
expect "actual cost above cap|refused"
expect "cap above quote|refused"
expect "rows of A that B sees|0"
expect "rows of A that B updated|0"
expect "rows of A that B deleted|0"
expect "B inserts with owner_id of A|refused"
expect "B adds a keyword to a project of A|refused"
expect "B adds an item to a run of A|refused"
expect "rows anon sees|0"
expect "rows A still has|4"
[[ "$out" != *"FAIL"* ]] || fail=1
[ "$fail" -eq 0 ] || { echo "RLS check FAILED"; exit 1; }
echo "RLS check passed (14 checks)"
