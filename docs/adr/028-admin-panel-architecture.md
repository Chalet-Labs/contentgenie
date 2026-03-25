# ADR-028: Admin Panel Architecture

## Status

Accepted

## Context

Admin features are currently embedded in the general `/settings` page as conditionally-rendered cards (`AiProviderCard`, `MissingTranscriptsCard`, `BulkResummarizeCard`). This has several problems:

1. **Discoverability**: Admin capabilities are hidden inside a user-facing page.
2. **Authorization model**: Each card individually checks `useAuth().has({ role: ADMIN_ROLE })` on the client — no route-level enforcement.
3. **Scalability**: Adding new admin features (prompt template editor, global episodes table, overview dashboard) would further bloat the settings page.
4. **Separation of concerns**: User settings and admin operations are mixed in one component.

## Decision

Create a dedicated admin panel at `/admin` with its own layout, route-level authorization, and three sub-routes:

- `/admin` — Overview stats dashboard (server component with Suspense boundaries)
- `/admin/settings` — AI config + prompt template playground
- `/admin/episodes` — Global episodes table with filters and actions

### Key architectural choices:

1. **Server-first rendering**: All three pages are server components. Client interactivity is isolated to small `"use client"` islands (tab nav, filter bar, action buttons, prompt editor).

2. **Layout-level authorization**: `src/app/(app)/admin/layout.tsx` checks `auth().has({ role: ADMIN_ROLE })` server-side and redirects non-admins to `/dashboard`. This replaces per-component client-side checks.

3. **URL-driven state for episodes**: Filters and pagination use `searchParams` — server-side rendering, shareable URLs, no client state for data fetching.

4. **DB schema extension**: Add `summarizationPrompt` (text, nullable) to `aiConfig` table. When null, the hardcoded default prompt in `src/lib/prompts.ts` is used. This preserves existing behavior as the default.

5. **Prompt pipeline integration**: `getActiveAiConfig()` returns `summarizationPrompt` alongside `provider` and `model`. The Trigger.dev `summarize-episode` task reads it at execution time — no payload changes needed.

6. **Settings page cleanup**: Remove the three admin cards from `/settings/page.tsx`. Regular users lose access to bulk re-summarization (deliberate — it's an expensive operation). Individual episode re-summarization remains available.

## Consequences

- Admin features are centralized and discoverable.
- Route-level auth eliminates the pattern of every component checking roles independently.
- The `summarizationPrompt` column adds a nullable text field — zero migration risk, backward compatible.
- The settings page becomes simpler and user-focused.
- New shadcn/ui components needed: `table`, `checkbox`, `command` (used with `popover` for combobox pattern). Tab navigation uses a custom `AdminTabNav` component with `Link` elements.
