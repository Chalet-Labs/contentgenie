# ADR-030: nuqs for URL Search Param State Management

**Status:** Accepted
**Date:** 2026-03-29
**Issue:** [#247](https://github.com/Chalet-Labs/contentgenie/issues/247)

## Context

Two surfaces in the app manage URL search params manually:

1. **Discover page** (`/discover`) — single `q` param, managed via `useSearchParams` + `useRouter` + `URLSearchParams` construction.
2. **Admin episodes page** (`/admin/episodes`) — six params (`podcastId`, `transcriptStatus[]`, `summaryStatus[]`, `dateFrom`, `dateTo`, `page`), managed via a custom `parseEpisodeFilters` function on the server and a local `filters` state + `URLSearchParams` construction on the client.

Both patterns share the same problems:

- Manual serialization/deserialization with no type safety — a mistyped key or wrong parser silently produces `undefined`
- Arrays require careful repeated-key handling (`URLSearchParams.append`) that diverges between client construction and server parsing
- Client state must be manually kept in sync with the URL (via `useEffect` + `router.replace`)
- No single source of truth — client and server use different parsing logic that can drift
- Boilerplate: every new URL-param surface re-implements the same pattern

## Decision

Adopt [nuqs](https://nuqs.47ng.com/) v2 for type-safe URL search param management.

### Setup

Install `nuqs` and wrap root layout children with `<NuqsAdapter>` from `nuqs/adapters/next/app`. This enables all nuqs hooks app-wide without per-page setup.

### Parser definitions

Shared parser maps live in `src/lib/search-params/`:

- `discover.ts` — exports `discoverSearchParams` for the `q` param
- `admin-episodes.ts` — exports `adminEpisodeSearchParams` (client parsers) and `loadAdminEpisodeSearchParams` (server loader via `createLoader`)

A single parser definition serves both client hooks and server-side loader, ensuring client and server always agree on serialization format and defaults.

### Client hooks

- Single param: `useQueryState(key, parser)` — replaces `useSearchParams().get()` + `router.replace()`
- Multiple params: `useQueryStates(parsers, options)` — replaces local `filters` state + `useEffect` + `URLSearchParams` construction; updates are batched into a single URL write

### Server-side parsing

`createLoader(parsers)(searchParams)` replaces `parseEpisodeFilters(searchParams)` in the admin page Server Component. Next.js 14.2.x delivers `searchParams` as a synchronous `Record<string, string | string[] | undefined>` prop — no `await` needed.

Note: `createSearchParamsCache` (which uses `React.cache` internally) was considered but requires React 19. This project uses React 18.3.1, which does not expose `React.cache` as a public API. `createLoader` provides equivalent functionality for a single-call-per-request pattern without the memoization overhead.

### Array serialization format

**New format:** comma-separated — `?transcriptStatus=available,failed`
**Previous format:** repeated keys — `?transcriptStatus=available&transcriptStatus=failed`

nuqs's native `parseAsArrayOf` uses comma separation. Adopting this format avoids fighting the library with a custom parser.

This is a breaking change for persisted URLs (bookmarks, shared links). However, the admin episodes page is an internal tool with no external consumers, no SEO surface, and no documented URL contract. No bookmarks or external links point at these filtered views. The benefit of simpler, more readable URLs outweighs the cost of invalidating any manually-bookmarked admin URLs.

### Options

- Admin filters: `{ shallow: false, history: 'replace' }` — `shallow: false` triggers a server re-render on every filter change so the Server Component re-fetches data.
- Discover page: default options (`shallow: true`) — the URL update is client-only; data fetching is triggered by the `useEffect` on the `q` value.

## Migration scope

| Surface               | Before                                                  | After                             |
| --------------------- | ------------------------------------------------------- | --------------------------------- |
| Discover `q` param    | `useSearchParams` + `useRouter`                         | `useQueryState`                   |
| Admin episode filters | `parseEpisodeFilters` + local state + `URLSearchParams` | `useQueryStates` + `createLoader` |

The `EpisodeFilters` interface and `buildEpisodeWhereConditions()` Drizzle query builder are unchanged — they consume the same typed shape regardless of how params are parsed.

## Future guidance

All new URL-param surfaces should use nuqs. Define parsers in `src/lib/search-params/<feature>.ts`, export both client parsers and a server loader, and import from there in both the page Server Component and client components. Do not add new `useSearchParams`/`useRouter` URL manipulation patterns.

## Consequences

- `nuqs` added as a runtime dependency (2.8.9, ~8 kB gzipped)
- `<NuqsAdapter>` in root layout is required — removing it would break all nuqs hooks silently
- Admin filter URL format changes (comma-separated arrays) — internal tool, acceptable
- `parseEpisodeFilters` server function removed — replaced by `loadAdminEpisodeSearchParams(searchParams)`
- `EpisodeFiltersBar` no longer accepts an `initialFilters` prop — reads URL state directly
- Test files for migrated components use `withNuqsTestingAdapter` from `nuqs/adapters/testing`
- Global `next/navigation` mock in `src/test/setup.ts` is unchanged — 9+ non-migrated components still depend on it
