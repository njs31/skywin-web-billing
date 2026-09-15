#!/bin/bash
# Applies db/manual-migrations/*.sql that haven't been applied yet, tracked
# in a schema_migrations table inside production Postgres itself. Safe to
# run on every deploy — already-applied files are skipped. Run from the
# repo root, where it can reach the skywin-postgres container via
# `docker compose exec` (so: on the VPS, not from a dev machine).
#
#   bash scripts/run-migrations.sh
#
# Deliberately avoids psql -v / nested shell-variable passing through
# `docker compose exec ... sh -c '...'` — that route broke in practice
# (quoting collapses across the extra shell layers). Writing each query to
# a plain temp file and piping it over stdin is the pattern that's held up
# reliably all through this project's manual migrations, so that's what
# this uses too. Migration filenames are our own (always
# YYYY-MM-DD-description.sql), never external input, so plain string
# interpolation into the temp file is fine here.
set -euo pipefail
cd "$(dirname "$0")/.."

PSQL_CMD='psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

docker compose exec -T postgres sh -c "$PSQL_CMD" <<'SQL'
create table if not exists schema_migrations (
  filename text primary key,
  applied_at timestamp not null default now()
);
SQL

shopt -s nullglob
for f in db/manual-migrations/*.sql; do
  name=$(basename "$f")

  tmp_check=$(mktemp)
  printf "select count(*) from schema_migrations where filename = '%s';\n" "$name" > "$tmp_check"
  already=$(docker compose exec -T postgres sh -c 'psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$tmp_check" | tr -d '[:space:]')
  rm -f "$tmp_check"

  if [ "$already" = "1" ]; then
    echo "skip (already applied): $name"
    continue
  fi

  echo "applying: $name"
  docker compose exec -T postgres sh -c "$PSQL_CMD" < "$f"

  tmp_insert=$(mktemp)
  printf "insert into schema_migrations (filename) values ('%s');\n" "$name" > "$tmp_insert"
  docker compose exec -T postgres sh -c "$PSQL_CMD" < "$tmp_insert"
  rm -f "$tmp_insert"
  echo "applied: $name"
done
