# ADR-029: Form Pattern Boundary — react-hook-form vs Manual State

## Status

Accepted

## Context

PR #245 migrated four submit-cycle forms to `react-hook-form` + Zod + shadcn `<Form>`. Five interactive input surfaces remain on manual `useState`. Issue #235 evaluated whether these should also migrate, be left as-is, or adopt an alternative pattern.

The migrated forms (RSS feed, collection dialog, bookmark dialog, AI provider config) all follow submit-cycle semantics: user fills fields → validates → submits → sees success/error. `react-hook-form` adds value here through declarative validation, automatic error display via `<FormMessage>`, `isSubmitting`/`isValid` state, and type-safe form values.

The remaining surfaces do not follow submit-cycle semantics.

## Decision

**Two form patterns coexist intentionally.** The boundary is determined by whether the surface follows submit-cycle semantics.

### Pattern 1: react-hook-form + Zod + shadcn `<Form>`

Use when the surface has **all** of:
- A submit event (user explicitly triggers save/create/update)
- Field validation that should display inline errors
- Two or more fields (single validated fields are borderline — use judgment)

Current surfaces using this pattern:
- `src/components/podcasts/rss-feed-form.tsx` — RSS feed URL input
- `src/components/library/collection-dialog.tsx` — Create/edit collection
- `src/components/library/bookmarks-list.tsx` — Add bookmark dialog
- `src/components/settings/ai-provider-card.tsx` — AI provider selection

### Pattern 2: Manual `useState`

Use when the surface has **any** of:
- No submit event (autosave, URL navigation, immediate-apply controls)
- Complex non-form state that dominates the component (upload state machines, streaming, abort controllers)
- A single ephemeral input (auto-dismissing popovers, search boxes)

Current surfaces using this pattern and why:

| Surface | File | Why manual state is appropriate |
|---|---|---|
| Discover search | `src/app/(app)/discover/discover-content.tsx` | URL navigation (`router.replace`), not a data mutation. No validation needed. |
| OPML import | `src/components/podcasts/opml-import-form.tsx` | 5-state machine (idle→uploading→processing→done→error) + Trigger.dev realtime progress. The core complexity is the upload lifecycle, not field management. |
| Bookmark note popover | `src/components/audio-player/bookmark-button.tsx` | Ephemeral popover with 5s auto-dismiss. Single optional text input after bookmark is already created. |
| Notes editor | `src/components/library/notes-editor.tsx` | Autosave on debounce — no submit cycle at all. |
| Prompt template editor | `src/components/admin/settings/prompt-template-card.tsx` | Admin tool with streaming test output, abort controller, debounced combobox search. Core complexity is in streaming/search, not form fields. |

### Shared validation constants

To prevent client/server validation drift, the `MAX_SHORT_TEXT` constant (500 chars) is exported from `src/lib/schemas/library.ts` and referenced by all surfaces that enforce this limit — both Zod schemas in RHF forms and manual checks in useState forms.

### Error display conventions

Error feedback follows the interaction context, not the form pattern:

| Context | Pattern | Rationale |
|---|---|---|
| Field validation in RHF forms | `<FormMessage>` below the field | Inline, persistent, tied to specific field |
| Action/mutation failures | `toast.error()` | Transient, non-blocking, not tied to a field |
| Data loading failures | Inline `<p className="text-destructive">` | Persistent until resolved, replaces content area |
| Warnings (non-blocking) | Inline `<p className="text-yellow-600">` | Visible but non-obstructive |

## Consequences

- New submit-cycle forms should use react-hook-form + Zod + shadcn `<Form>`. Contributors don't need to decide — the criteria above determine the pattern.
- New non-submit surfaces (autosave, URL-driven, streaming) should use manual state. Forcing RHF onto these surfaces adds boilerplate without benefit.
- The `MAX_SHORT_TEXT` constant prevents silent validation drift between client forms and server schemas.
- If a surface evolves from manual to submit-cycle (e.g., adding validation to the search input), it should migrate to RHF at that point — not preemptively.
