# ADR-013: Custom PWA Install Prompt with Engagement Threshold

**Status:** Proposed
**Date:** 2026-03-02
**Issue:** [#92](https://github.com/Chalet-Labs/contentgenie/issues/92)

## Context

ContentGenie is already a fully installable PWA (manifest with `display: "standalone"`, icons, service worker registered in production). However, the browser's native install prompt is easy to miss and appears at unpredictable times. A custom install banner — shown after the user demonstrates engagement — improves conversion while avoiding annoyance.

The `beforeinstallprompt` event (Chrome, Edge, Samsung Internet, Opera) allows deferring and programmatically triggering the native install flow. Safari on iOS does not fire this event and requires manual "Add to Home Screen" instructions. Desktop browsers should be excluded since the app targets mobile professionals (commuters/travelers).

### Key constraints

1. **`beforeinstallprompt` is Chromium-only.** Safari and Firefox do not fire it. On iOS, the only install path is the manual "Add to Home Screen" flow, so the settings page needs iOS-specific instructions.
2. **Standalone detection.** Once installed, the banner must never appear. CSS media query `(display-mode: standalone)` and `navigator.standalone` (Safari) detect this.
3. **Engagement gating.** Showing install prompts immediately is counterproductive. A threshold of visiting 2 distinct pages (including the initial page load) OR 30 seconds on-site ensures the user has demonstrated interest. Because the initial load counts as the first page, engagement is reached after a single navigation.
4. **Dismissal cooldown.** If the user closes the banner, it should not reappear for 7 days. localStorage is sufficient for this — no IndexedDB needed.
5. **Mobile-only.** The banner targets mobile viewport widths only (the CSS `md:` breakpoint hides it on tablet/desktop).

## Options Considered

### Option A: Custom hook + dismissible banner component (chosen)

A `usePwaInstall` hook encapsulates all `beforeinstallprompt` logic, standalone detection, engagement tracking, and dismissal cooldown. A separate `InstallBanner` component consumes the hook and renders a fixed-bottom animated banner. The settings page gets an "Install App" card using the same hook, with iOS-specific instructions.

- **Pros:** Clean separation of concerns. Hook is testable independently. Banner is a pure UI component driven by hook state. Follows the project's existing pattern (e.g., `useOnlineStatus` hook + `OfflineBanner` component). No new dependencies.
- **Cons:** Engagement tracking (page navigations) requires listening to Next.js router events, adding coupling to the App Router.

### Option B: Third-party PWA install library (e.g., `pwa-install` web component)

Use a ready-made web component that handles the full install flow.

- **Pros:** Less custom code. Battle-tested across browsers.
- **Cons:** Adds a dependency. Styling doesn't match shadcn/ui design system. Limited control over engagement thresholds and dismissal behavior. Web components don't compose well with React state management.

### Option C: Service worker-driven install prompt

Coordinate the install prompt from the service worker, posting messages to the client.

- **Pros:** Centralized logic.
- **Cons:** `beforeinstallprompt` fires on the window, not in the SW. Over-engineering — the event is purely a client-side concern.

## Decision

Option A. A custom hook (`usePwaInstall`) paired with a banner component (`InstallBanner`) follows established project patterns, requires no new dependencies, and gives full control over UX timing.

### Engagement tracking approach

Rather than listening to Next.js router events (which would require `usePathname` polling or patching `history.pushState`), the hook will use `usePathname` from `next/navigation` and count distinct pathname values via a `useRef` set. This is simple, reliable, and already available from the existing test setup mock. The 30-second timer uses a standard `setTimeout`.

### Standalone detection

The hook checks `window.matchMedia('(display-mode: standalone)').matches` and `(navigator as any).standalone` (Safari iOS). If either is true, the hook short-circuits — `canInstall` stays false.

### Dismissal persistence

`localStorage.setItem('pwa-install-dismissed', Date.now().toString())`. On mount, if the stored timestamp is within 7 days, the banner stays hidden.

## Consequences

- **New files:**
  - `src/hooks/use-pwa-install.ts` — hook with `canInstall`, `promptInstall()`, `isInstalled` state
  - `src/hooks/__tests__/use-pwa-install.test.ts` — unit tests
  - `src/components/pwa/install-banner.tsx` — fixed-bottom mobile banner
  - `src/components/pwa/__tests__/install-banner.test.tsx` — component tests
  - `src/components/pwa/install-banner.stories.tsx` — Storybook story
  - `src/components/settings/install-app-card.tsx` — settings page card with iOS instructions
  - `src/components/settings/__tests__/install-app-card.test.tsx` — settings card tests
  - `docs/adr/013-pwa-install-prompt.md` — this ADR

- **Modified files:**
  - `src/components/layout/app-shell.tsx` — render `<InstallBanner />` inside `AppShellInner`
  - `src/app/(app)/settings/page.tsx` — add `<InstallAppCard />` between Notifications and AI Provider cards

- **No new dependencies.** Uses browser APIs only.
- **No service worker changes.** The SW is not involved in the install flow.
- **No database changes.** All state is client-side (localStorage + in-memory).
- **Browser support:** `beforeinstallprompt` on Chromium browsers. iOS gets manual instructions in settings. Firefox mobile gets neither (Firefox doesn't support PWA install on Android).
