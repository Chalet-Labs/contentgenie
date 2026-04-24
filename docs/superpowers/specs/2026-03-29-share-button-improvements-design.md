# Share Button Improvements

## Summary

Upgrade the share button from a single-action clipboard copy to a dropdown menu with richer share text. Include episode summaries in shared content and remove generic filler text.

## Current State

- `ShareButton` component (`src/components/ui/share-button.tsx`) uses Web Share API with clipboard fallback
- Shares generic text like "Check out this episode of X on ContentGenie"
- Used on episode, podcast, and collection pages
- Podcast page has two code paths using different TypeScript types (`podcastIndexId` for DB records, `id` for API responses) — both resolve to the same PodcastIndex feed ID

## Changes

### 1. ShareButton becomes a dropdown menu

Replace the single-action button with a `DropdownMenu` (shadcn/ui). Options:

| Option                | When shown                  | Action                                                                 |
| --------------------- | --------------------------- | ---------------------------------------------------------------------- |
| **Share**             | `navigator.share` available | Opens native OS share sheet with title, summary (if provided), and URL |
| **Copy link**         | Always                      | Copies URL to clipboard                                                |
| **Copy with summary** | `summary` prop provided     | Copies formatted text + URL to clipboard                               |

The button trigger renders identically to the current button (Share2 icon + "Share" label). Existing `size` and `variant` props continue to work.

### 2. New `summary` prop

Add an optional `summary?: string` prop to `ShareButton`. When present, the "Copy with summary" menu item appears. Call sites pass `worthItReason` for episodes; podcasts and collections omit it.

### 3. Share text format

**Episode — native share and "Copy with summary":**

```text
<Episode Title>

<worthItReason>

<URL>
```

**Episode without worthItReason — native share:**

```text
<Episode Title>

<URL>
```

**Podcast — native share:**

```text
<Podcast Title>

<URL>
```

**Collection — native share:**

```text
<Collection Name>

<URL>
```

"Copy link" always copies only the URL.

### 4. Remove generic filler text

All call sites stop passing "Check out this episode/podcast on ContentGenie" style text. The title and optional summary speak for themselves.

### 5. Podcast share URLs

The podcast page has two code paths with different TypeScript types:

- **RSS-sourced podcasts** (DB schema type): uses `podcast.podcastIndexId`
- **PodcastIndex API-sourced podcasts** (`PodcastIndexPodcast` type): uses `podcast.id`

Both represent the same PodcastIndex feed ID and produce the same URL. Each path uses the correct property for its type.

## Call site changes

### Episode page (`src/app/(app)/episode/[id]/page.tsx`)

```tsx
<ShareButton
  title={episode.title}
  text={episode.title}
  url={`${process.env.NEXT_PUBLIC_APP_URL}/episode/${episodeId}`}
  summary={episode.worthItReason ?? undefined}
/>
```

### Podcast page (`src/app/(app)/podcast/[id]/page.tsx`)

RSS-sourced (DB schema type):

```tsx
<ShareButton
  title={podcast.title}
  text={podcast.title}
  url={`${process.env.NEXT_PUBLIC_APP_URL}/podcast/${podcast.podcastIndexId}`}
/>
```

PodcastIndex API-sourced (`PodcastIndexPodcast` type):

```tsx
<ShareButton
  title={podcast.title}
  text={podcast.title}
  url={`${process.env.NEXT_PUBLIC_APP_URL}/podcast/${podcast.id}`}
/>
```

### Collection page (`src/app/(app)/library/collection/[id]/page.tsx`)

```tsx
<ShareButton
  title={collection.name}
  text={collection.name}
  url={`${process.env.NEXT_PUBLIC_APP_URL}/library/collection/${collectionId}`}
/>
```

## Testing

- Update existing `share-button.test.tsx` to cover:
  - Dropdown rendering with all three options
  - "Share" option hidden when `navigator.share` unavailable
  - "Copy with summary" hidden when no `summary` prop
  - "Copy link" copies only URL
  - "Copy with summary" copies formatted text with title + summary + URL
  - Native share sends correct `shareData` (with and without summary)
- Verify podcast page uses correct ID property for each type

## Out of scope

- Splitting the `summary` field into a dedicated TLDR field (separate task)
- UTM tracking parameters on shared URLs
- OG meta tags / link previews
