# ADR-002: Preview Database Migrations via Vercel Build

**Status:** Accepted
**Date:** 2026-02-09

## Context

Preview deployments were returning 500 errors because two separate Neon database branches were being created for each PR:

1. **Vercel Neon integration** creates a `preview/{branch-name}` branch and injects its `DATABASE_URL` into the deployment environment.
2. **GitHub Actions workflow** (`.github/workflows/neon-branch.yml`) creates a `preview/pr-{number}-{branch}` branch and runs `drizzle-kit push` against it.

Schema migrations only ran on branch #2 (GitHub Actions), but the deployment connected to branch #1 (Vercel integration) — which never received the schema updates. This caused every database query in preview deployments to fail with 500 errors due to missing tables/columns.

## Options Considered

### Option A: Keep GitHub Actions + target the Vercel-created branch

Modify the GitHub Actions workflow to detect and target the branch created by the Vercel Neon integration instead of creating its own.

- **Pro:** Keeps migrations in CI where they're visible in PR checks.
- **Con:** Fragile — requires knowing the Vercel integration's branch naming convention, introduces a race condition between Vercel deploy and GH Actions, and still creates unnecessary duplicate branches on synchronize events.

### Option B: Remove GitHub Actions + run `drizzle-kit push` in Vercel build

Delete the GitHub Actions Neon workflow entirely. Add a `vercel-build` script to `package.json` that runs `drizzle-kit push --force` before `next build` for preview deployments only.

- **Pro:** Single source of truth — migrations run against the exact `DATABASE_URL` the deployment will use at runtime. No race conditions, no branch naming assumptions, idempotent.
- **Con:** Migrations are less visible (in Vercel build logs rather than a dedicated GH Actions check). Production migrations remain a manual step.

### Option C: Remove Vercel Neon integration + use GitHub Actions only

Remove the Vercel Neon integration and manage all branch creation, DATABASE_URL injection, and cleanup via GitHub Actions.

- **Pro:** Full control over branch lifecycle.
- **Con:** Requires managing secrets injection into Vercel (complex), loses automatic branch cleanup on PR merge, reinvents what the Vercel integration already provides.

## Decision

**Option B: Remove the GitHub Actions Neon workflow and run `drizzle-kit push` in the Vercel build for preview deployments.**

## Rationale

- **Single source of truth.** The `DATABASE_URL` available during `vercel-build` is the exact same one the deployment will use at runtime. No branch mismatch is possible.
- **Idempotent.** `drizzle-kit push` is safe to run multiple times — it only applies changes that differ from the current schema. Multiple queued builds for the same PR won't conflict.
- **No race conditions.** The migration runs synchronously before `next build`, so the schema is guaranteed to be ready before any server-side code executes.
- **Vercel integration handles lifecycle.** Branch creation on PR open and cleanup on PR merge are already managed by the Neon Vercel integration — no custom GitHub Actions needed.
- **`--force` is safe for preview.** Preview Neon branches are ephemeral and isolated. The `--force` flag prevents interactive prompts in the non-TTY Vercel build environment. Production deployments skip the migration entirely — see the Production deploy section below.

## Implementation

- Delete `.github/workflows/neon-branch.yml`.
- Add a `vercel-build` script to `package.json` that conditionally runs `drizzle-kit push --force` for preview environments before `next build`.
- Vercel auto-detects the `vercel-build` script when the dashboard build command is not overridden.

## Production deploy (manual, post-merge)

> **Updated 2026-05-10 — see "2026-05 update" section below for the current workflow.** This block remains for historical context.

Production schema is **not** auto-migrated. After a migration-bearing PR merges to `main`, run:

```bash
doppler run --config prd -- bunx drizzle-kit push
```

Note: `bun run db:push` is **not** equivalent — that script uses the default Doppler config (typically dev). The explicit `--config prd` form is required for the production database.

## Consequences

- Production schema migrations remain a manual post-merge step (canonical command above).
- The `NEON_API_KEY` GitHub Actions secret and `NEON_PROJECT_ID` variable can be removed if no other workflows need them.
- Orphaned `preview/pr-*` Neon branches from the old workflow will expire via their 14-day TTL or can be manually deleted.
- Migration visibility moves from a GitHub Actions check to Vercel build logs.

## 2026-05 update: prod migration workflow

`drizzle-kit push` is non-convergent against populated databases for six expression-bearing indexes (HNSW with `vector_cosine_ops` + `WITH` parameters, `lower()`, partial `WHERE`, `DESC`, `AT TIME ZONE`). drizzle-kit's diff misnormalizes the schema-side serialized form vs. the DB-side form, so every push re-emits identical `DROP INDEX` + `CREATE INDEX` for those six indexes — including the HNSW indexes whose rebuilds are minutes-scale on populated tables. Real wasted prod work, and any _intentional_ schema change gets buried under the perpetual churn.

`drizzle-kit migrate` executes `drizzle/*.sql` files literally and tracks applied migrations in `drizzle.__drizzle_migrations`. No diff → no false drift → guaranteed convergence.

This update keeps the original ADR-002 decision (preview migrations via Vercel build) in spirit, evolving only the _command_ per the original "manual step or dedicated migration workflow" wording. Issue #456 / PR for the switch carries the full context.

### One-time bootstrap (per environment, NOT per build)

`migrate` requires `drizzle.__drizzle_migrations` to track which migration files have been applied. Existing environments (dev/prod) have all schema state applied via push but no tracking table.

`scripts/bootstrap-drizzle-migrations.ts` populates the table from a **frozen baseline manifest** of the 33 migration tags that existed at the cutover. Hashes and timestamps are read from `_journal.json` for those tags only — new migrations added after the cutover are NEVER auto-marked applied (they go through `drizzle-kit migrate` normally). Without that guardrail, running bootstrap on a non-bootstrapped environment after a new migration was added would mark the new migration as applied without executing its SQL — the same failure-mode-class as the `worth_it_reason` incident (Feb 2026).

The script is idempotent (re-running is a no-op) and is invoked from the Vercel preview build before `drizzle-kit migrate`. The frozen baseline manifest makes auto-bootstrap safe: bootstrap can only insert rows for the 33 cutover tags and never silently marks a post-cutover migration as applied. Running bootstrap unconditionally on every preview build closes the gap for branches forked before prod is bootstrapped (e.g. the cutover PR's own preview, or any branch forked while prod is still on `push`).

### Current canonical commands

```bash
# Local dev (unchanged): rapid prototyping
bun run db:push

# Preview (Vercel build, automatic): bootstrap (idempotent) + migrate
"vercel-build": "if [ \"$VERCEL_ENV\" = \"preview\" ]; then bun scripts/bootstrap-drizzle-migrations.ts && npx drizzle-kit migrate; fi && next build"

# Production (manual): bootstrap once at the cutover, then migrate per migration-bearing PR
doppler run --config prd -- bun scripts/bootstrap-drizzle-migrations.ts   # ONE-TIME at cutover
doppler run --config prd -- bunx drizzle-kit migrate                       # per migration-bearing PR
```

### Bootstrap ordering (cutover sequence)

Order of operations on prod for the cutover PR (this one) and beyond:

1. PR for #456 merges to `main`. (No new migration files in this PR.)
2. **Cutover step (one-time):** operator runs `bun scripts/bootstrap-drizzle-migrations.ts` against prod. Tracking table populated with 33 baseline rows.
3. Vercel preview branches forked from main after step 2 inherit the populated tracking table; the build's bootstrap step is a no-op.
4. Future migration-bearing PRs deploy via `doppler run --config prd -- bunx drizzle-kit migrate` (no bootstrap needed; baseline is already in place).

Preview branches forked **before** step 2 (including the cutover PR's own preview) self-bootstrap during `vercel-build` — the script is idempotent and the manifest is frozen, so this never marks a new migration applied without running its SQL.

Dev environment: same — operator runs the bootstrap once locally (or via CI seed) before relying on `db:migrate`.

### Rationale for keeping prod manual

Prod stays a deliberate human gate (not folded into Vercel's `production` branch of `vercel-build`) so operators see the migration step explicitly, can sequence it relative to code deploys, and can pause for cause. Convergence of `migrate` removes the _noise_ concern but doesn't change the case for keeping migrations intentional.

### Rollback paths

1. Bootstrap fails → `DROP SCHEMA drizzle CASCADE` removes only the tracking table; no data touched. Re-run the script.
2. First post-bootstrap `migrate` misbehaves → same as #1; revert the PR; prod stays on push.
3. Catastrophic → restore from a Neon branch taken from prod `main` immediately before bootstrap (recommended pre-flight: create a branch named `pre-migrate-bootstrap-YYYY-MM-DD`).
