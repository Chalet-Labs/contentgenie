# ADR-010: Per-User Daily Summarization Rate Limit

**Status:** Proposed
**Date:** 2026-02-27
**Issue:** [#64](https://github.com/Chalet-Labs/contentgenie/issues/64)

## Context

Each episode summarization consumes paid API resources: OpenRouter/Z.AI for AI inference and AssemblyAI for audio transcription. The existing rate limiter (ADR-001) enforces a per-user hourly quota of 10 summarizations per rolling hour. This prevents short-term abuse but does not cap total daily spend — a determined user can trigger 240 summarizations per day (10/hour * 24 hours).

Issue #64 requests a **per-user daily limit** (e.g., 5 per day) to provide tighter cost control. The limit should be configurable without redeployment, apply to both manual and batch summarization flows, and return clear feedback when exhausted.

### Summarization entry points

All summarization ultimately flows through the same Trigger.dev `summarize-episode` task, but there are four distinct entry points:

1. **Manual single** — `POST /api/episodes/summarize` (user clicks "Summarize")
2. **Manual batch** — `POST /api/episodes/batch-summarize` (user clicks "Summarize Recent" for up to 20 episodes)
3. **Bulk re-summarize** — `POST /api/episodes/bulk-resummarize` (admin action, already has its own dedicated rate limit and admin-only guard)
4. **Scheduled polling** — `poll-new-episodes` Trigger.dev scheduled task (system-initiated, no user context)

## Options Considered

### Option A: New `rate-limiter-flexible` instance with 24-hour window

Add a second `RateLimiterPostgres` instance using `createRateLimitChecker` (from ADR-001) with `duration: 86400` (24 hours) and a new `keyPrefix: "daily-summarize"`. The limit is a hardcoded constant configurable only via code change + deploy.

- **Pro:** Minimal new code. Reuses proven pattern. Fully distributed. No schema change.
- **Con:** Limit requires a deploy to change. 24-hour rolling window means the window slides (not calendar-day aligned). No admin UI for tuning.

### Option B: Database-configurable limit via `app_config` table + `rate-limiter-flexible`

Same distributed rate limiting as Option A, but store the daily limit value in a new `app_config` key-value table (or extend `ai_config`). Admin can update the limit via a Settings UI or server action. The rate limiter reads the limit from the DB on each check (with short in-memory cache for hot path).

- **Pro:** Limit adjustable without deploy. Admin self-service. Distributed.
- **Con:** More complex: new table or schema extension, cache invalidation, admin UI work. Overkill if the limit rarely changes.

### Option C: Environment variable limit + `rate-limiter-flexible` (chosen)

Same distributed rate limiting as Option A, but read the limit from an environment variable (`DAILY_SUMMARIZE_LIMIT`) with a sensible default (e.g., 5). Configurable in Doppler without code changes; takes effect on next cold start (serverless) or restart.

- **Pro:** Configurable without deploy (Doppler update + Vercel redeploy or function cold start). Simple. No schema changes. Reuses ADR-001 infrastructure.
- **Con:** Not instant — requires a redeploy or cold start to pick up changes. No admin UI. Rolling window, not calendar-day.

### Option D: SQL-based counting (no `rate-limiter-flexible`)

Add a `summarization_log` table that records each summarization event with `(userId, createdAt)`. Check count via `SELECT COUNT(*) WHERE userId = ? AND createdAt > NOW() - INTERVAL '24 hours'` before allowing summarization.

- **Pro:** Exact count. Queryable history. Can be extended for analytics.
- **Con:** Custom SQL. No atomic consume-and-check (race conditions in serverless). Higher write amplification. Diverges from established ADR-001 pattern.

## Decision

**Option C** — Environment variable limit + existing `rate-limiter-flexible` Postgres infrastructure.

## Rationale

1. **Consistent with ADR-001.** Uses the same `createRateLimitChecker` factory pattern already proven for the hourly limit, OPML import limit, and bulk re-summarize limit. No new rate limiting infrastructure.

2. **Configurable without code changes.** The `DAILY_SUMMARIZE_LIMIT` environment variable is managed in Doppler. Changing it requires a Doppler update and a Vercel redeploy (or waiting for cold start), which is an acceptable operational workflow for a limit that changes infrequently.

3. **Minimal blast radius.** The change adds a second `checkRateLimit` call in the same two routes that already perform hourly rate limiting. No schema migrations, no new tables, no admin UI.

4. **Rolling window is acceptable.** A 24-hour rolling window (vs. calendar-day reset) is actually more fair — it prevents a user from exhausting their quota at 11:59 PM and getting a fresh quota at 12:00 AM. The trade-off is that users can't predict exactly when their quota resets, but the `retryAfterMs` value returned by `rate-limiter-flexible` provides that information for the UI.

5. **Auto-triggered summarizations (polling) are exempt.** The scheduled `poll-new-episodes` task runs in Trigger.dev Cloud with no user context. These are system-initiated and should not count against any user's quota. This is naturally handled by the architecture: the rate limit check only exists in the API routes (`/api/episodes/summarize` and `/api/episodes/batch-summarize`), which require Clerk authentication. The Trigger.dev task bypasses these routes entirely.

6. **Bulk re-summarize is separately gated.** The admin-only bulk re-summarize flow already has its own rate limit (1 per hour, admin-only). Adding the daily limit there would be redundant and would prevent admins from doing their job.

## Implementation

### New daily rate limiter

In `src/lib/rate-limit.ts`, add a new checker:

```typescript
const DAILY_SUMMARIZE_LIMIT = Number(process.env.DAILY_SUMMARIZE_LIMIT) || 5;
const DAILY_SUMMARIZE_DURATION = 86400; // 24 hours

export const checkDailyLimit = createRateLimitChecker({
  points: DAILY_SUMMARIZE_LIMIT,
  duration: DAILY_SUMMARIZE_DURATION,
  keyPrefix: "daily-summarize",
});
```

### Bug fix: move cache check before rate limit in single summarize route

The current single summarize route (`POST /api/episodes/summarize`) checks the rate limit **before** the cache check. This means returning a cached summary (no API cost) still consumes a rate limit point. The batch summarize route already does this correctly (cache check first). As part of this change, reorder the single summarize route to: auth -> validation -> **cache check** -> daily limit -> hourly limit -> trigger task.

### Enforcement points

1. **`POST /api/episodes/summarize`** — After auth, validation, and cache check, call `checkDailyLimit(userId)` then the existing hourly `checkRateLimit`. Return 429 with a descriptive message ("Daily summarization limit reached") and include `retryAfterMs` and `dailyLimit` in the response. **Also reorder** the existing hourly check to be after cache check (bug fix).

2. **`POST /api/episodes/batch-summarize`** — Call `checkDailyLimit(userId, uncachedIds.length)` after auth and cache check, before the existing hourly `checkRateLimit`. The `points` parameter ensures a batch of 5 episodes consumes 5 daily points.

3. **`POST /api/episodes/bulk-resummarize`** — **No change.** Admin-only, separately rate limited.

4. **`poll-new-episodes`** — **No change.** System-initiated, no user context.

### API response enhancement

When the daily limit is hit, return:

```json
{
  "error": "Daily summarization limit reached. Please try again tomorrow.",
  "retryAfterMs": 43200000,
  "dailyLimit": 5
}
```

This gives the frontend enough information to display a meaningful message and optionally show a countdown.

### Frontend changes

Update the `BatchSummarizeButton` and the single-episode summarize flow to detect the daily limit error (check for `dailyLimit` in the 429 response body) and display a user-friendly message distinct from the hourly rate limit.

### Environment variable

Add `DAILY_SUMMARIZE_LIMIT` to Doppler (`dev`, `stg`, `prd` configs) with a default of `5`. Document in `docs/secrets-management.md`.

## Consequences

- A new `rate-limiter-flexible` key prefix (`daily-summarize`) will create rows in the existing `rate_limits` table. No schema migration needed.
- The existing hourly rate limit (10/hour) remains as a burst limiter. The daily limit (5/day default) provides tighter overall cost control. Both limits are enforced independently — a request must pass both.
- Users who hit the daily limit get a clear message with retry timing. The frontend can display this distinctly from the hourly burst limit.
- The limit is adjustable per environment via Doppler without code changes.
- Auto-triggered summarizations from feed polling are exempt, ensuring the system continues to function even when individual users hit their limits.
