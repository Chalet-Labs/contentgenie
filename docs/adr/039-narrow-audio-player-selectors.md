# ADR-039: Narrow Selector Hooks for Audio Player Context

**Status:** Accepted
**Date:** 2026-04-25
**Issue:** [#351](https://github.com/Chalet-Labs/contentgenie/issues/351)
**Extends:** [ADR-004](./004-audio-player-state-management.md)

## Context

ADR-004 established three nested contexts for the in-app audio player:

- `AudioPlayerAPIContext` — stable action dispatchers (never re-renders subscribers).
- `AudioPlayerStateContext` — playback state via `useReducer` (~13 fields today: `currentEpisode`, `isPlaying`, `isBuffering`, `isVisible`, `duration`, `volume`, `playbackSpeed`, `hasError`, `errorMessage`, `queue`, `chapters`, `chaptersLoading`, `sleepTimer`).
- `AudioPlayerProgressContext` — high-frequency timing (`currentTime`, `buffered`).

That split solved the original 4 Hz `timeupdate` re-render storm. A new symptom has surfaced as the product matured:

- `useAudioPlayerState()` is a fat subscription. Any reducer dispatch — `SET_VOLUME`, `SET_PLAYBACK_SPEED`, `SET_BUFFERING`, `SET_SLEEP_TIMER`, queue mutations, chapter loading — produces a new state object identity, which re-renders **every** subscriber.
- Podcast detail and library list pages render up to ~200 affordance buttons (`PlayEpisodeButton` + `AddToQueueButton`) below the fold. Each one currently subscribes to the full state.
- Result: dragging the volume slider, scrubbing buffered ranges, or even the buffering toggle during episode load triggers ~200 re-renders. Each render is cheap individually, but the aggregate has shown up as jank in long lists during user testing.

The buttons only need three slivers of the underlying state:

- **`PlayEpisodeButton`** needs: now-playing episode id (to compare with its own episode prop) and `isPlaying` (to render the "Now playing" affordance). It does **not** care about volume, playback speed, buffering, sleep timer, queue contents, chapters, duration, visibility, or error state.
- **`AddToQueueButton`** needs: now-playing episode id (to disable when the episode is currently playing) and "is this episode in the queue" (a boolean derived from `queue`). It does not care about anything else.

The convenience of `useAudioPlayerState()` is leaking through the component boundary as a perf cost on hot list views.

## Options Considered

### Option A: Split the state context into frequency-of-change slices (chosen)

Add three small contexts alongside the existing fat `AudioPlayerStateContext`:

1. `NowPlayingEpisodeIdContext` — value: `string | null`.
2. `IsPlayingContext` — value: `boolean`.
3. `QueueEpisodeIdsContext` — value: `ReadonlySet<string>`.

The three values are derived inside `AudioPlayerProvider` from the same single source of truth (the reducer's `state`). Only the queue Set requires `useMemo` — primitives bail out automatically. The Set memo additionally compares against the previously-emitted Set by content (a `useRef` cache) so reducer actions that produce a new queue array with identical membership (`REORDER_QUEUE`, focus-refetch INIT_QUEUE, metadata refreshes) preserve the Set reference and let consumers bail out via `Object.is`.

Expose three narrow hooks:

- `useNowPlayingEpisodeId(): string | null`
- `useIsEpisodePlaying(episodeId: string): boolean` (composes the now-playing-id and is-playing slices into a per-episode predicate, so call sites can't accidentally read the global play/pause state without comparing the episode id)
- `useIsEpisodeInQueue(episodeId: string): boolean`

Migrate `PlayEpisodeButton` and `AddToQueueButton` only. The existing `useAudioPlayerState()` and the fat `AudioPlayerStateContext` remain in place for the ~14 other consumers; their migration is out of scope.

- **Pros:** Uses React's native context bailout — when a memoized provider value's identity is stable, subscribers don't re-render. Builds on the existing precedent (`AudioPlayerProgressContext` is already split for the same reason). Zero new dependencies. No state-model change. Single source of truth — slice values are derived, not duplicated. Fully backward compatible: the fat context stays for unmigrated consumers.
- **Cons:** Adds two more provider wrappers to a 1,490-line file (the third — Progress — already exists, so the pattern is familiar). The shared Storybook decorator (`src/test/story-fixtures/audio-player.tsx`) needs to mount the new providers. Indirect tests that mock the context module need their `vi.mock` factories extended with the new hooks.

### Option B: `useSyncExternalStore` with selector functions

Replace the `useReducer`/Context combo with a custom external store. Components subscribe via `useSyncExternalStore(subscribe, () => selector(snapshot))`, getting per-selector memoization (a button only re-renders when its selector's output changes).

- **Pros:** Truly per-selector reactivity — even a queue mutation only re-renders the buttons whose `isInQueue` answer flipped. Natural fit for cross-slice derived reads.
- **Cons:** Switches the underlying state model from `useReducer` to a hybrid store, which is a much larger refactor (the provider is 1,490 lines and threads `state` through dozens of effects, refs, and callbacks). All existing tests in `src/contexts/__tests__/audio-player-context.test.tsx` would need updating. Issue #351 explicitly lists this as a fallback. The marginal benefit over Option A — eliminating the once-per-queue-mutation re-render of all `AddToQueueButton` instances — does not justify the cost: each render is a `Set#has` lookup plus an icon swap; React reconciliation skips DOM updates for buttons whose answer didn't change.

### Option C: Memoize the buttons with `React.memo` and rely on prop-equality

Wrap each button in `React.memo` and pass everything they read as props from a single parent component that subscribes to the fat state.

- **Pros:** No context changes.
- **Cons:** Pushes the orchestration burden onto every parent (episode card, notification list, library list, etc.) — all of which would have to subscribe to `useAudioPlayerState()` and pass the right props down. Worse blast radius than the buttons subscribing directly. Doesn't address the underlying issue (whoever subscribes to the fat context still re-renders ~14× per second under load).

### Option D: Status quo

Accept the jank.

- **Pros:** Zero change.
- **Cons:** Confirmed perf issue on hot list views; will get worse as more affordance buttons appear (e.g. saved-for-later buttons subscribing to library state).

## Decision

**Option A** — additive thin contexts with narrow selector hooks, migrating only `PlayEpisodeButton` and `AddToQueueButton`.

## Rationale

- **Native React primitive.** Context bailout via referential equality is exactly the mechanism we need. No external state library, no custom store, no `useSyncExternalStore` boilerplate.
- **Single source of truth preserved.** The slice contexts hold values derived from the existing reducer's state. We are not creating parallel state — we are projecting one state onto multiple subscription surfaces.
- **Builds on the existing precedent.** `AudioPlayerProgressContext` was carved off the original "single context" design for the same reason: hot subscribers shouldn't pay for cold updates. ADR-004 explicitly endorsed this pattern.
- **Bounded blast radius.** Two components migrate. The shared Storybook decorator updates in one place. Indirect test mocks extend. The fat `AudioPlayerStateContext` stays for unmigrated consumers — no cascading rewrites.
- **Verifiable via render-count tests.** `React.Profiler` measures the migrated component's actual commit-phase renders directly, regardless of how it subscribes to contexts. A regression that re-adds `useAudioPlayerState()` causes `setVolume`/`setPlaybackSpeed`/buffering ticks to increment renders and fail the isolation assertions. A mirror-subscription `useRef` wrapper would not catch this class of regression because its counter only ticks on slice changes the wrapper itself subscribes to.
- **Honest about constraint.** When `isPlaying` toggles, all `PlayEpisodeButton` instances still re-render once (they subscribe to that slice, by design — only the active button's icon actually changes, but React still calls the function). The 199 buttons that render no DOM diff are reconciled in microseconds. The wins this ADR claims are eliminating re-renders on **uncorrelated** state changes (volume, scrub, buffer, sleep timer, chapters), not eliminating every re-render.

## Consequences

- The audio-player context file grows by three `createContext` calls with sentinel-value commentary, a `useMemo` paired with a `useRef` content-equality cache for the queue Set, three exported hooks with full JSDoc, and three new provider-wrapper layers in the JSX.
- Three new hook entry points in the public surface of `@/contexts/audio-player-context`: `useNowPlayingEpisodeId`, `useIsEpisodePlaying`, `useIsEpisodeInQueue`. They throw outside `AudioPlayerProvider`, mirroring the existing convention. The underlying slice contexts (`NowPlayingEpisodeIdContext`, `IsPlayingContext`, `QueueEpisodeIdsContext`) are also exported but marked `@internal` — they exist to support Storybook decorators and test fixtures that compose the provider stack manually. Application code must use the hooks: exposing the raw `IsPlayingContext` without an episode id encouraged a footgun where call sites forgot to scope the check to their episode.
- Hooks intentionally hold **primitive** slice values only. A future contributor tempted to expand `IsPlayingContext` into `{ isPlaying, isBuffering }` would forfeit the bailout. JSDoc on each hook will document this constraint.
- The shared Storybook decorator (`src/test/story-fixtures/audio-player.tsx`) extends to mount the new contexts. Stories that compose the decorator are unaffected.
- Indirect unit tests that mock `@/contexts/audio-player-context` and render the migrated buttons (transitively, via `EpisodeCard` etc.) gain three additional keys in their `vi.mock` factories.
- ADR-004 remains in effect; this ADR extends rather than supersedes it. Future state-management questions for the audio player should consider both.
- `useSyncExternalStore` remains a documented escape hatch (Option B) if a future need surfaces for cross-slice memoized derivations that this approach can't model cheaply.

## Out of Scope

- Migrating other consumers of `useAudioPlayerState()` to narrow hooks (player-bar, seek-bar, chapter-list, etc.). Their re-render budget is acceptable today; the cost/benefit ratio is the opposite of the buttons'.
- Switching the audio-player state model to Zustand, Jotai, or a custom store. Re-evaluated and rejected in ADR-004; nothing in this issue changes that calculus.
- Splitting the 1,490-line `audio-player-context.tsx` into smaller files. Tracked separately if it becomes a maintainability problem.
