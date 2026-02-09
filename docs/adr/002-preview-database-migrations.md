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
- **`--force` is safe for preview.** Preview Neon branches are ephemeral and isolated. The `--force` flag prevents interactive prompts in the non-TTY Vercel build environment. Production deployments skip the migration entirely (manual control via `bun run db:push`).

## Implementation

- Delete `.github/workflows/neon-branch.yml`.
- Add a `vercel-build` script to `package.json` that conditionally runs `drizzle-kit push --force` for preview environments before `next build`.
- Vercel auto-detects the `vercel-build` script when the dashboard build command is not overridden.

## Consequences

- Production schema migrations remain a manual step (`bun run db:push` locally or via a dedicated migration workflow).
- The `NEON_API_KEY` GitHub Actions secret and `NEON_PROJECT_ID` variable can be removed if no other workflows need them.
- Orphaned `preview/pr-*` Neon branches from the old workflow will expire via their 14-day TTL or can be manually deleted.
- Migration visibility moves from a GitHub Actions check to Vercel build logs.
