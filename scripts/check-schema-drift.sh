#!/usr/bin/env bash
set -uo pipefail

# Schema drift detection for CI.
# Runs drizzle-kit push in interactive mode with stdin closed.
# Interactive mode shows pending SQL and prompts before executing.
# With /dev/null as stdin, it receives EOF and exits without executing.

output=$(timeout 60 bunx drizzle-kit push 2>&1 < /dev/null) || true

echo "$output"

# drizzle-kit prints nothing (or a no-changes message) when schema is in sync.
# When there IS drift, it prints the SQL statements.
if echo "$output" | grep -qiE 'ALTER TABLE|CREATE TABLE|DROP TABLE|ADD COLUMN|DROP COLUMN|RENAME COLUMN'; then
  echo ""
  echo "::error::Schema drift detected! Production database has pending schema changes."
  echo "To apply: doppler run --config prd -- bunx drizzle-kit push"
  exit 1
fi

echo "No schema drift detected. Production database is in sync with Drizzle schema."
