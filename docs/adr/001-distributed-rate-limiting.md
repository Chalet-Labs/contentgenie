# ADR-001: Distributed Rate Limiting with rate-limiter-flexible

**Status:** Accepted
**Date:** 2025-02-08
**Issue:** [#44](https://github.com/Chalet-Labs/contentgenie/issues/44)

## Context

The batch summarize (`/api/episodes/batch-summarize`) and single summarize (`/api/episodes/summarize`) API endpoints use an in-memory `Map` for rate limiting (10 summarizations per user per hour). In a serverless environment (Vercel), each function instance has its own memory space:

- Cold starts wipe the map, resetting all rate limit state.
- Concurrent instances maintain independent counters, allowing users to exceed limits.

We need a distributed rate limiter that shares state across all instances and survives cold starts.

## Options Considered

### Option A: Upstash Redis (`@upstash/ratelimit`)

Serverless Redis with a purpose-built rate limiting SDK.

- **Pro:** Sub-millisecond latency (~1-5ms), sliding window out of the box, zero config.
- **Con:** New vendor dependency, new secrets to manage, vendor lock-in on the SDK.

### Option B: Neon Postgres (DIY)

Custom rate limit table with hand-written atomic upserts using the existing database.

- **Pro:** No new infrastructure.
- **Con:** DIY implementation (atomic SQL, window expiry, stale row cleanup), higher latency (~20-50ms), added connection pressure.

### Option C: `rate-limiter-flexible` + Neon Postgres

Open-source library (MIT) with pluggable backends, including Postgres. Handles atomic upserts, window management, and stale row cleanup internally.

- **Pro:** No new vendor, no custom SQL, built-in insurance limiter (in-memory fallback), backend-swappable.
- **Con:** Postgres latency (~20-50ms per check), adds a library-managed table.

## Decision

**Option C: `rate-limiter-flexible` with the existing Neon Postgres database.**

## Rationale

- **No new infrastructure or vendor.** Reuses the existing Neon database — no new accounts, secrets, or services to monitor.
- **No DIY rate limit SQL.** The library handles atomic upserts, window expiry, and stale row cleanup automatically.
- **Built-in insurance limiter.** If Postgres is temporarily unreachable, an in-memory fallback keeps rate limiting functional instead of failing open or blocking all requests.
- **Backend-swappable.** The library uses the same API regardless of backend. If we add Redis later, it's a one-class change — no application logic rewrites.
- **Latency is acceptable.** Both summarize endpoints already perform DB queries and trigger background jobs. The ~30ms overhead of a Postgres-backed rate limit check is negligible relative to the overall request lifecycle.

## Implementation

- Add `rate-limiter-flexible` as a dependency.
- Create a shared `src/lib/rate-limit.ts` module, consolidating the duplicated rate limiter from both routes.
- Use `RateLimiterPostgres` with the existing Neon connection.
- Configure: 10 points per 1-hour window (preserving current per-user quota).
- Enable the insurance limiter for graceful failover.
- Update tests to cover the distributed behavior.

## Consequences

- A library-managed table will be created in the Neon database (auto-provisioned by `rate-limiter-flexible`).
- Rate limit state becomes durable across cold starts and shared across instances.
- If we later need sub-5ms rate limiting (e.g., high-throughput public API), we can swap to `RateLimiterRedis` with the same application code.
