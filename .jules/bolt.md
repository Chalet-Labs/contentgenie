## 2025-05-15 - Header Stabilization for Next.js Fetch Caching
**Learning:** In Next.js App Router, the `fetch` cache key includes the request headers. APIs that use time-based signatures (like PodcastIndex) generate different headers every second, effectively disabling the built-in fetch cache even for identical URLs. By rounding the timestamp to a stable interval (e.g., 30 seconds), we can enable caching for that window, provided the API allows some time drift.
**Action:** When working with signed APIs in Next.js, check for time-drift tolerance in the documentation and stabilize the timestamp used for headers to the largest safe interval.

## 2026-02-10 - SQL Aggregate Optimization for Drizzle
**Learning:** Drizzle's relational query API (`db.query`) is convenient but often leads to N+1 patterns for aggregations (like counting items in a collection). Transitioning to the core `db.select()` API with `leftJoin` and `groupBy` allows performing these counts at the database level in a single query, significantly reducing latency as the data grows.
**Action:** Prefer `db.select()` with aggregations over `db.query` loops when fetching counts or averages for related entities.

## 2025-05-20 - Indexing for Aggregate Performance
**Learning:** Even with SQL aggregate functions, performance can degrade on large tables if the columns used in `WHERE` clauses for the aggregation aren't properly indexed. A composite index (e.g., `userId, episodeId`) is not efficient for queries filtering only by the second column. Adding a dedicated index on the foreign key being aggregated significantly speeds up statistic calculations.
**Action:** When adding aggregate queries, always ensure the filtered columns have appropriate indexes, especially foreign keys in join or junction tables.
