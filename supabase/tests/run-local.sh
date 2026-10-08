#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres database and runs the access-rule tests.
# Needs a local Postgres (psql, createdb, dropdb on PATH).
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=error}"
cd "$(dirname "$0")/.."
DB="autokolab_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/stubs.sql
for f in ../packages/autokolab/sql/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f tests/policies.sql
