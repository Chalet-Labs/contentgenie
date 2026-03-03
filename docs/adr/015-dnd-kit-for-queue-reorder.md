# ADR-015: Use @dnd-kit for Queue Drag-and-Drop Reorder

**Status:** Accepted
**Date:** 2026-03-03
**Issue:** [#94](https://github.com/Chalet-Labs/contentgenie/issues/94)

## Context

The episode queue panel (issue #94) requires drag-and-drop reordering of queued episodes. Users should be able to grab a drag handle on a queue item and move it to a new position in the list. The interaction must work on both desktop (mouse) and mobile (touch), and should be accessible via keyboard.

## Options Considered

### Option A: @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities (chosen)

A modular, hook-based drag-and-drop toolkit for React. `@dnd-kit/core` provides the DnD engine; `@dnd-kit/sortable` adds sortable list primitives; `@dnd-kit/utilities` provides CSS transform helpers. Uses the `SortableContext` + `useSortable` hook pattern. Pinned versions: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2` — all compatible with React 18.

- **Pros:** Purpose-built for React with hooks-based API. Small bundle size (~12KB gzipped for core + sortable). First-class accessibility: keyboard navigation with `sortableKeyboardCoordinates`, screen reader announcements, ARIA attributes are built in. Separate `MouseSensor` and `TouchSensor` allow different activation constraints per input type — `TouchSensor` with `activationConstraint: { delay: 250, tolerance: 5 }` avoids scroll conflicts on mobile. Active maintenance and large community. The sortable preset handles reorder logic via `arrayMove()` utility. No DOM measurement hacks — uses CSS transforms for smooth animations.
- **Cons:** New dependency (three packages: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`). The modular architecture means importing from multiple packages.

### Option B: react-beautiful-dnd

Atlassian's drag-and-drop library, widely used.

- **Pros:** Battle-tested, extensive documentation. Great out-of-box animations.
- **Cons:** Officially deprecated and unmaintained since 2024 (Atlassian moved to `@atlaskit/pragmatic-drag-and-drop`). Does not support React 18 strict mode without workarounds. Larger bundle size. The project would be adopting a deprecated dependency.

### Option C: @atlaskit/pragmatic-drag-and-drop

Atlassian's successor to react-beautiful-dnd. Framework-agnostic with React adapter.

- **Pros:** Active maintenance. Framework-agnostic core is small.
- **Cons:** The React adapter (`@atlaskit/pragmatic-drag-and-drop-react-adapter`) is relatively new with less community adoption. More boilerplate than @dnd-kit for simple sortable lists. Accessibility is manual (no built-in keyboard DnD or screen reader announcements).

### Option D: Manual implementation with HTML Drag and Drop API

Use the browser's native `dragstart`/`dragover`/`drop` events.

- **Pros:** Zero dependencies.
- **Cons:** The HTML DnD API is notoriously inconsistent across browsers (especially mobile Safari). No touch support — the API is mouse-only. Accessibility must be built from scratch (keyboard reorder, ARIA live regions). Significant implementation effort for a feature that a library solves in ~20 lines of component code.

## Decision

**Option A** — `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.

## Rationale

- **Best fit for React + hooks codebase.** The `useSortable` hook pattern aligns with the project's functional component style. No class components, no HOCs.
- **Accessibility out of the box.** The issue doesn't explicitly mention accessibility, but ADR-004's audio player already includes ARIA live regions and screen reader announcements. @dnd-kit continues this standard with built-in keyboard DnD (`KeyboardSensor` + `sortableKeyboardCoordinates`) and screen reader support.
- **Minimal footprint.** Three packages, ~12KB gzipped total. The project already has 16 `@radix-ui/*` packages; three `@dnd-kit/*` packages are proportionate.
- **Not deprecated.** react-beautiful-dnd is unmaintained; @dnd-kit is actively maintained with regular releases.
- **Scoped usage.** @dnd-kit is only used for the queue panel — a single sortable list. If it proves problematic, replacing it is localized to one component file.
- **Mobile-tested sensor strategy.** Using separate `MouseSensor` and `TouchSensor` (not unified `PointerSensor`) allows `TouchSensor` to use `activationConstraint: { delay: 250, tolerance: 5 }` which prevents accidental drags during scroll — critical for the mobile bottom sheet context.

## Consequences

- Three new dependencies: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`. Added via `bun add @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2`.
- The queue panel component uses `DndContext`, `SortableContext`, and `useSortable` from these packages.
- `@dnd-kit/utilities` provides `CSS.Transform.toString()` for applying transform styles from `useSortable`.
- If more DnD features are needed in the future (e.g., drag episodes between collections), @dnd-kit scales to those use cases.
