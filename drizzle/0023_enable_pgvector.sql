-- Enable pgvector extension (issue #380, epic #376 canonical topics).
-- Idempotent: safe to re-run via drizzle-kit push --force on preview branches.
CREATE EXTENSION IF NOT EXISTS vector;
