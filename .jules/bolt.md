## 2025-05-15 - Header Stabilization for Next.js Fetch Caching
**Learning:** In Next.js App Router, the `fetch` cache key includes the request headers. APIs that use time-based signatures (like PodcastIndex) generate different headers every second, effectively disabling the built-in fetch cache even for identical URLs. By rounding the timestamp to a stable interval (e.g., 30 seconds), we can enable caching for that window, provided the API allows some time drift.
**Action:** When working with signed APIs in Next.js, check for time-drift tolerance in the documentation and stabilize the timestamp used for headers to the largest safe interval.

## 2026-02-10 - SQL Aggregate Optimization for Drizzle
**Learning:** Drizzle's relational query API (`db.query`) is convenient but often leads to N+1 patterns for aggregations (like counting items in a collection). Transitioning to the core `db.select()` API with `leftJoin` and `groupBy` allows performing these counts at the database level in a single query, significantly reducing latency as the data grows.
**Action:** Prefer `db.select()` with aggregations over `db.query` loops when fetching counts or averages for related entities.

## 2025-05-20 - Indexing for Aggregate Performance
**Learning:** Even with SQL aggregate functions, performance can degrade on large tables if the columns used in `WHERE` clauses for the aggregation aren't properly indexed. A composite index (e.g., `userId, episodeId`) is not efficient for queries filtering only by the second column. Adding a dedicated index on the foreign key being aggregated significantly speeds up statistic calculations.
**Action:** When adding aggregate queries, always ensure the filtered columns have appropriate indexes, especially foreign keys in join or junction tables.

## 2026-02-13 - Selective Column Fetching for Large Text Fields
**Learning:** Drizzle ORM's relational query API (`db.query`) fetches all columns by default. When related entities (like `episodes`) contain large text fields (like `transcription` or `summary`), fetching a list of these entities can result in massive database payloads (megabytes) even if only the title and ID are displayed. Using the `columns` property to explicitly select only needed fields significantly reduces database I/O, network bandwidth, and application memory usage.
**Action:** Always use selective column fetching (`columns`) when querying lists of entities that contain high-volume data fields that are not displayed in the list.

## 2026-02-14 - JOIN for Existence Checks
**Learning:** Checking for an item's existence in a junction table (e.g., checking if an episode is in a user's library using a external ID) is often done via sequential queries: find entity by external ID, then find junction entry by internal ID. This is inefficient. Using a single `db.select()` with a JOIN and `.limit(1)` consolidates the operation into one database round-trip and avoids fetching the full entity data.
**Action:** Replace multi-step existence checks with a single JOIN query.

## 2026-02-15 - Prefer Column Exclusion for Maintainability
**Learning:** When using Drizzle's relational query API (`db.query`), optimizing for large text fields can be done via whitelisting (`columns: { title: true, ... }`) or blacklisting (`columns: { transcription: false }`). Blacklisting is more maintainable as it ensures new metadata fields added to the schema automatically flow through to the application without breaking consumers that expect a full object, while still providing the performance benefit of skipping high-volume data.
**Action:** Use column exclusion (`fieldName: false`) instead of whitelisting for better schema maintainability when optimizing for large fields.

## 2026-02-16 - API Batching for Multi-Feed Queries
**Learning:** The PodcastIndex API supports batching multiple feed IDs in a single request to endpoints like `/episodes/byfeedid`. This allows replacing N sequential or concurrent API calls with a single round-trip when fetching recent episodes from multiple subscriptions.
**Action:** Always check API documentation for batching support when performing multiple related network requests. Update library utilities to support stringified batch IDs.
