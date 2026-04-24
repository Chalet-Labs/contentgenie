# Admin Panel Design Spec

## Overview

A dedicated admin panel at `/admin` replacing the current pattern of admin features hidden inside the general `/settings` page. The panel provides three sub-routes: Overview (stats dashboard), Settings (AI config + prompt template), and Episodes (global episodes table with actions).

## Access Control

- **Auth model**: Clerk `org:admin` role — same as current system, now enforced at the route level.
- **Middleware**: No changes needed. The existing Clerk middleware already protects all non-public routes via `auth.protect()`. `/admin` is covered by the existing wildcard matcher. The middleware handles **authentication** (is the user logged in?); the layout handles **authorization** (is the user an admin?).
- **Layout gate**: `src/app/(app)/admin/layout.tsx` is a server component that checks `auth().has({ role: ADMIN_ROLE })` and redirects non-admins to `/dashboard`.
- **Sidebar**: Add an "Admin" nav link (visible only when `isAdmin` via `useAuth().has({ role: ADMIN_ROLE })`) below Settings in the sidebar, with a shield/lock icon. The sidebar is already a `"use client"` component, so this hook is available.

## Route Structure

```
src/app/(app)/admin/page.tsx            → Overview (stats dashboard)
src/app/(app)/admin/settings/page.tsx   → AI config + prompt template playground
src/app/(app)/admin/episodes/page.tsx   → Global episodes table
```

Routes live inside the `(app)` route group to inherit the existing `AppShell` (sidebar, header, audio player, providers).

- **Approach**: Server-first (Approach A). Each sub-route is a server component. Client interactivity only where needed (action buttons, filters, prompt editor).
- **Shared layout**: `src/app/(app)/admin/layout.tsx` renders page header ("Admin") + horizontal tab nav using Next.js `<Link>`. The `AdminTabNav` component is `"use client"` (needs `usePathname()` for active tab state). Shared layout stays mounted; only the page content swaps on navigation.

## Settings Page Cleanup

Remove from `/settings/page.tsx`:

- `AiProviderCard` (moves to admin settings)
- `MissingTranscriptsCard` (replaced by admin episodes table)
- `BulkResummarizeCard` (moves to admin-only). **Deliberate decision**: Regular users lose access to bulk re-summarization. Rationale: re-summarization is an expensive AI operation that should be controlled by admins. Individual episode re-summarization (via the episode page) remains available to all users as before.

Settings page retains: Appearance, Notifications, Install App, Connected Accounts, Danger Zone.

## Tab 1: Overview (`/admin`)

Server component with aggregation queries against Neon. Each stat section wrapped in a `<Suspense>` boundary with a skeleton fallback to allow partial streaming — individual cards render as their queries resolve.

### Stats Grid

| Stat                     | Query Approach                                                              |
| ------------------------ | --------------------------------------------------------------------------- |
| Total podcasts           | `COUNT(*)` on podcasts                                                      |
| Total episodes           | `COUNT(*)` on episodes                                                      |
| Transcript coverage %    | `COUNT(transcriptStatus = 'available') / COUNT(*)`                          |
| Summary coverage %       | `COUNT(summaryStatus = 'completed' AND processedAt IS NOT NULL) / COUNT(*)` |
| Episodes processed today | `COUNT(processedAt >= today)`                                               |
| Queue depth              | `COUNT(summaryStatus IN ('queued', 'running', 'summarizing'))`              |
| Active jobs              | Queue depth + `COUNT(transcriptStatus = 'fetching')`                        |

### Breakdown Cards

- **Transcript source breakdown**: Count per `transcriptSource` (podcastindex / assemblyai / description-url / null). Bar or donut chart.
- **Recent failures**: Last 10 episodes with `transcriptStatus = 'failed'` or `summaryStatus = 'failed'`, with timestamp and error snippet.
- **Failure rate trend**: Failures per day for the last 7 days. Rendered as a simple table (day | count) — no charting library needed. Can upgrade to a chart later if desired.
- **Storage counts**: Total transcripts (`transcriptStatus = 'available'`) and summaries (`processedAt IS NOT NULL`).

All queries are simple aggregations — single DB round-trip with a few `COUNT`/`GROUP BY` queries.

## Tab 2: Settings (`/admin/settings`)

### AI Config Card

Migrated from existing `AiProviderCard` — no functional changes:

- Provider select: `openrouter` | `zai`
- Model text input (free-text)
- Save button → calls existing `updateAiConfig` server action

### Prompt Template Card (New)

`"use client"` component with three areas:

**Editor area:**

- Large `<textarea>` with the current system prompt template.
- Supports placeholder variables: `{{title}}`, `{{transcript}}`, `{{podcastName}}`, `{{description}}`, etc.
- Reference list of available placeholders shown below the textarea.

**Preview/test area:**

- Episode picker: server-side search combobox with debounced autocomplete. Fetches a limited result set (max 20) matching the search query from episodes with `transcriptStatus = 'available'`. Shows podcast name + episode title. Does not load all episodes into the client.
- "Test Prompt" button: Takes the current textarea content (unsaved), interpolates the selected episode's data, sends to the AI model (using currently configured provider/model), and streams the response back.
- Result display: Scrollable area showing the streamed AI response. Dry run only — nothing saved to the episode record.
- Loading/error states: Spinner during generation, error display on failure.

**Actions:**

- Save button: Persists prompt template to DB. Disabled while a test is running.
- Reset to default button: Restores the hardcoded prompt from code (with confirmation dialog).

### New API Route

`POST /api/admin/test-prompt` — accepts `{ prompt, episodeId }`, interpolates the template, calls the AI, and streams the response. Admin-only.

### DB Changes

- Add `summarizationPrompt` column (text, nullable) to the `aiConfig` table.
- When `null`, summarization falls back to the hardcoded default prompt in code.
- Existing behavior is preserved as the default — admins opt in to customization.

### Prompt Pipeline Integration

`getActiveAiConfig()` in `src/lib/ai/config.ts` must be extended to return `summarizationPrompt` alongside `provider` and `model`. The `AiConfig` type is updated accordingly. The Trigger.dev `summarize-episode` task (which calls the AI) reads the prompt from `getActiveAiConfig()` at execution time — if `summarizationPrompt` is non-null, it uses that; otherwise it uses the hardcoded default. No changes to the task trigger interface — the prompt is fetched fresh inside the task, not passed as a payload parameter.

### Validation

- Client-side: Warn if prompt doesn't contain `{{transcript}}` placeholder.
- Server-side: Non-empty, max 10,000 characters.

## Tab 3: Episodes (`/admin/episodes`)

Server component with URL-driven filters via `searchParams`.

### Table Columns

| Column     | Source                      | Notes                                                                                            |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| Checkbox   | —                           | Multi-select for batch actions                                                                   |
| Podcast    | `podcasts.title` (join)     | Small artwork thumbnail + name                                                                   |
| Episode    | `episodes.title`            | Truncated, links to `/episode/[id]`                                                              |
| Published  | `episodes.datePublished`    | Relative date (e.g. "3 days ago")                                                                |
| Transcript | `episodes.transcriptStatus` | Badge: available (green), fetching (yellow), missing (gray), failed (red)                        |
| Source     | `episodes.transcriptSource` | Only shown when transcript available; dash otherwise                                             |
| Summary    | `episodes.summaryStatus`    | Badge: completed (green), running/summarizing (yellow), queued (blue), failed (red), none (gray) |
| Score      | `episodes.worthItScore`     | Numeric 0–10, blank if not scored                                                                |
| Actions    | —                           | Direct buttons (not dropdown)                                                                    |

### Filters (URL `searchParams`-driven, server-side)

- Podcast (combobox)
- Transcript status (multi-select)
- Summary status (multi-select)
- Date range (from/to date pickers)

Filter changes update the URL via `router.push` — small `"use client"` filter bar component. The table re-renders server-side with fresh data on each navigation.

### Pagination

Server-side, 25 rows per page, `?page=N` param. Total count displayed.

### Row Actions (Direct Buttons)

Two buttons per row, context-aware:

- **Fetch Transcript**: Solid accent button when `transcriptStatus` is `missing` or `failed`. Disabled (grayed) when `available`. Shows "Fetching..." when `transcriptStatus = 'fetching'`. Calls existing `POST /api/episodes/fetch-transcript`.
- **Summarize / Re-summarize**: Label depends on state. When `summaryStatus` is `null` (never summarized) and transcript is available: show "Summarize" (solid outline). When `completed` or `failed`: show "Re-summarize" (outline accent). Disabled when transcript is not available or when in-progress (`queued`/`running`/`summarizing` — shows status text). Calls existing re-summarize endpoint.

### Batch Actions (Toolbar Above Table)

- **Fetch All Missing**: Up to 20 episodes, uses existing `POST /api/episodes/batch-fetch-transcripts`.
- **Re-summarize Selected**: Checkbox selection + bulk action button. New endpoint `POST /api/admin/batch-resummarize` accepts `{ episodeIds: number[] }` — explicit episode selection (unlike the existing filter-based `/api/episodes/bulk-resummarize`). Admin-only, no rate limit. Reuses existing summarization Trigger.dev task.

### Optimistic Updates

Action buttons are small client islands. After triggering an action, they optimistically update the status badge (e.g. `missing` → `fetching`). For in-progress rows (`fetching`, `queued`, `running`, `summarizing`), the client island polls the episode status every 5 seconds until the status resolves to a terminal state (`available`, `completed`, `failed`), then updates the badge. This avoids requiring a full page reload to see final status after background jobs complete.

## New API Routes Summary

| Route                               | Method | Purpose                                                                                                  |
| ----------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/test-prompt`       | POST   | Dry-run prompt template against an episode, stream AI response                                           |
| `POST /api/admin/batch-resummarize` | POST   | Bulk re-summarize selected episodes by ID (admin-only, no rate limit). Input: `{ episodeIds: number[] }` |

## DB Schema Changes

| Table      | Column                | Type           | Notes                          |
| ---------- | --------------------- | -------------- | ------------------------------ |
| `aiConfig` | `summarizationPrompt` | text, nullable | `null` = use hardcoded default |

### Migration

After updating `src/db/schema.ts`, run `bun run db:generate` and `bun run db:push`. For production: run `doppler run --config prd -- bunx drizzle-kit push` before deploying the code that references the new column. See MEMORY.md gotcha on production schema drift.

## Components to Create

- `/admin/layout.tsx` — shared layout with admin gate + tab nav
- `/admin/page.tsx` — Overview stats dashboard
- `/admin/settings/page.tsx` — AI config + prompt template playground
- `/admin/episodes/page.tsx` — Episodes table shell
- `AdminTabNav` — `"use client"` horizontal tab nav component (needs `usePathname()`)
- `PromptTemplateEditor` — `"use client"` prompt editor with test area
- `EpisodesTable` — server-rendered table
- `EpisodeFilters` — `"use client"` filter bar
- `EpisodeActionButtons` — `"use client"` per-row action buttons
- `OverviewStats` — stats grid + breakdown cards

## Components to Remove from Settings

- `AiProviderCard` import and usage in `/settings/page.tsx`
- `MissingTranscriptsCard` import and usage in `/settings/page.tsx`
- `BulkResummarizeCard` import and usage in `/settings/page.tsx`

## Testing

- Unit tests for admin overview aggregation queries
- Unit tests for prompt template interpolation logic
- Unit tests for filter param parsing
- Component tests for action button state logic
- Integration test: admin gate redirects non-admin users
