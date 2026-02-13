# ADR-004: Use React Context for Global Audio Player State

**Status:** Proposed
**Date:** 2026-02-13
**Issue:** [#93](https://github.com/Chalet-Labs/contentgenie/issues/93)

## Context

Issue #93 adds a persistent in-app audio player that stays visible across all `(app)` routes while audio is playing. The player needs global state shared between the episode page (triggers playback), the player bar (displays controls), and sub-components (seek bar, playback speed, volume). The state includes:

- Current episode metadata (id, title, podcast name, artwork URL, audio URL)
- Playback state (isPlaying, isBuffering, hasError)
- Timing (currentTime, duration, buffered) — updated ~4x/sec during playback
- User preferences (playbackSpeed, volume) — persisted in localStorage

The `<audio>` HTML element must live in a React ref that survives navigation between pages. The state management solution must colocate the audio ref with the state and provide stable action dispatchers to avoid unnecessary re-renders.

## Options Considered

### Option A: React Context with triple split (chosen)

Three nested contexts in a single provider component:

1. **AudioPlayerAPIContext** — stable action dispatchers (`playEpisode`, `togglePlay`, `seek`, `skipForward`, `skipBack`, `setPlaybackSpeed`, `setVolume`, `closePlayer`). Value is `useMemo(() => actions, [])` — the actions close over `audioRef.current` lazily, so their identity never changes. Consumers that only call actions never re-render.
2. **AudioPlayerStateContext** — playback state (`currentEpisode`, `isPlaying`, `isVisible`, `playbackSpeed`, `volume`, `duration`, `isBuffering`, `hasError`, `errorMessage`). Managed via `useReducer`. Re-renders only on user-initiated actions (play, pause, episode switch, speed change).
3. **AudioPlayerProgressContext** — high-frequency timing (`currentTime`, `buffered`). Updated via `useState` on every `timeupdate` event (~4x/sec). Only consumed by the seek bar component.

- **Pros:** Zero new dependencies. Natural colocation of `<audio>` ref with state. Triple split eliminates unnecessary re-renders — the episode page listen button reads State + API but not Progress; the seek bar reads Progress + API but not the full State. Matches the existing `ThemeProvider` pattern (`src/components/theme-provider.tsx`). Well-understood pattern in the React ecosystem.
- **Cons:** Three contexts in one file adds complexity vs. a single-context solution. The triple split requires consumers to know which hook to call (`useAudioPlayer`, `useAudioPlayerProgress`, `useAudioPlayerAPI`). If audio state grows significantly (queue, playlist, history), the reducer could become unwieldy.

### Option B: Zustand

A lightweight external store with built-in selectors for fine-grained re-render control.

- **Pros:** Built-in selector pattern (`useStore(state => state.currentTime)`) avoids the triple-context split entirely. Simpler API for consumers — one hook with selectors. Smaller boilerplate than Context + useReducer. Middleware for localStorage persistence (`persist`).
- **Cons:** Adds a new dependency to a project with zero state management libraries. The `<audio>` ref must be managed separately (Zustand stores are plain objects, not React components). The ref would live in a module-level variable or a parallel Context, splitting the concern that Option A keeps unified. Overkill for ~5 consumer components.

### Option C: Jotai

Atomic state management with derived atoms for computed values.

- **Pros:** Fine-grained reactivity — each piece of state is an atom, consumers only subscribe to atoms they read. No provider needed (provider-less mode). Excellent TypeScript support.
- **Cons:** New dependency. Unfamiliar API for contributors who know React Context but not Jotai. The `<audio>` ref management is awkward — atoms hold serializable state, not DOM refs. Same ref-splitting issue as Zustand. Atomic model is a better fit for complex interconnected state (form builders, editors), not a linear audio player.

### Option D: Single React Context (no split)

One context with all state and actions in a single value.

- **Pros:** Simplest implementation. One hook for everything.
- **Cons:** Every `timeupdate` (~4x/sec) re-renders all consumers — the episode page listen button, the player bar title, the close button, the speed selector, and the volume slider all re-render 4 times per second during playback. This is the exact performance problem the PM flagged during review.

## Decision

**Option A** — React Context with triple split (API / State / Progress).

## Rationale

- **Zero new dependencies.** The project has no state management library today. Adding Zustand or Jotai for a single feature sets a precedent that future features should also use external state libraries, fragmenting state management across the codebase. React Context is built-in and sufficient.
- **Ref colocation.** The `<audio>` element lives as a `useRef` inside the `AudioPlayerProvider` component. The provider renders a hidden `<audio>` element in the DOM, attaches event listeners, and dispatches state updates. All audio lifecycle management is in one place. External stores (Zustand, Jotai) cannot own a DOM ref — they would need a parallel mechanism.
- **Performance is addressed.** The triple split ensures that high-frequency `timeupdate` events only re-render the seek bar (via `AudioPlayerProgressContext`). Stable state and stable actions are in separate contexts, so components pick exactly the reactivity they need.
- **Bounded complexity.** The audio player has ~8 state fields and ~8 actions. This fits comfortably in a single `useReducer`. The issue explicitly scopes out playlist/queue functionality, so the state is unlikely to grow significantly in this iteration.
- **Matches existing patterns.** `ThemeProvider` in `src/components/theme-provider.tsx` wraps `next-themes`'s provider and is consumed via `useTheme()`. The audio player follows the same provider-in-layout, hook-for-consumers pattern.

## Consequences

- The `src/contexts/` directory is created (first context in the project outside of third-party providers).
- Contributors must choose the right hook: `useAudioPlayer()` for state, `useAudioPlayerAPI()` for actions, `useAudioPlayerProgress()` for timing. This is documented in the module's JSDoc comments.
- If a second global state need arises (e.g., notification center, download manager), the team should evaluate whether React Context is still sufficient or if a shared state library (Zustand) is warranted. This ADR does not set a permanent policy — it documents the decision for this feature.
- Helper modules `src/lib/media-session.ts` and `src/lib/player-preferences.ts` are extracted from the provider to keep the context file focused on state management.
