# Share Button Improvements

## Summary

Upgrade the share button from a single-action clipboard copy to a dropdown menu with richer share text. Include episode summaries in shared content, fix the podcast ID inconsistency, and remove generic filler text.

## Current State

- `ShareButton` component (`src/components/ui/share-button.tsx`) uses Web Share API with clipboard fallback
- Shares generic text like "Check out this episode of X on ContentGenie"
- Used on episode, podcast, and collection pages
- Bug: podcast page uses `podcastIndexId` on desktop but `id` on mobile — different URLs for the same podcast

## Changes

### 1. ShareButton becomes a dropdown menu

Replace the single-action button with a `DropdownMenu` (shadcn/ui). Options:

| Option | When shown | Action |
|---|---|---|
| **Share** | `navigator.share` available | Opens native OS share sheet with formatted text |
| **Copy link** | Always | Copies URL to clipboard |
| **Copy with summary** | `summary` prop provided | Copies formatted text + URL to clipboard |

The button trigger renders identically to the current button (Share2 icon + "Share" label). Existing `size` and `variant` props continue to work.

### 2. New `summary` prop

Add an optional `summary?: string` prop to `ShareButton`. When present, the "Copy with summary" menu item appears. Call sites pass `worthItReason` for episodes; podcasts and collections omit it.

### 3. Share text format

**Episode — native share and "Copy with summary":**

```
<Episode Title>

<worthItReason>

<URL>
```

**Episode without worthItReason — native share:**

```
<Episode Title>

<URL>
```

**Podcast — native share:**

```
<Podcast Title>

<URL>
```

**Collection — native share:**

```
<Collection Name>

<URL>
```

"Copy link" always copies only the URL.

### 4. Remove generic filler text

All call sites stop passing "Check out this episode/podcast on ContentGenie" style text. The title and optional summary speak for themselves.

### 5. Fix podcast ID inconsistency

Both desktop and mobile podcast share buttons use `podcast.podcastIndexId` for the URL path, matching the route structure (`/podcast/[id]` expects the PodcastIndex ID).

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

Both desktop and mobile:

```tsx
<ShareButton
  title={podcast.title}
  text={podcast.title}
  url={`${process.env.NEXT_PUBLIC_APP_URL}/podcast/${podcast.podcastIndexId}`}
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
  - Native share sends correct `shareData`
- Verify podcast page passes `podcastIndexId` in both layouts

## Out of scope

- Splitting the `summary` field into a dedicated TLDR field (separate task)
- UTM tracking parameters on shared URLs
- OG meta tags / link previews
