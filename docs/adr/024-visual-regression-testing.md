# ADR 024: Visual Regression Testing with Playwright

## Status

Accepted

## Context

ContentGenie has 33 Storybook story files containing 154 individual story exports, covering the full component surface area. PR review in issue #202 identified that 4 stories use dynamic `Date.now()` or `new Date()` calls at module level, producing non-deterministic renders that make any snapshot comparison meaningless. This surfaced the broader question of whether to adopt visual regression testing (VRT) for the project.

The stories affected:

1. `src/components/dashboard/trending-topics.stories.tsx` — `twoHoursAgo`/`thirtyMinutesAgo` via `Date.now()` at module level
2. `src/components/audio-player/sleep-timer-menu.stories.tsx` — `endTime: Date.now() + 1530_000` in story decorator
3. `src/components/notifications/notification-list.stories.tsx` — `const now = new Date()` at module level
4. `src/components/notifications/notification-bell.stories.tsx` — `const now = new Date()` at module level

The alternative to adopting VRT is to fix only the 4 non-deterministic stories and stop there.

### Tool options evaluated

| Tool | Cost | Setup effort | CI integration | Storybook 8 compat |
|---|---|---|---|---|
| **Chromatic** | Free tier (5000 snapshots/mo), then $149+/mo | Low — 1 package + CI step | Official GH Action, blocks PRs with UI review | First-class |
| **Loki** | Free | Medium — Docker/local Chrome in CI | Manual baseline commit + diff artifact upload | Community-maintained |
| **Playwright `toHaveScreenshot()`** | Free | Low-medium — config + one test file | `playwright already installed`; no external service | No Storybook awareness; build + serve first |
| **Storycap + reg-suit** | Free | High — two tools, cloud storage needed | Complex; publishes HTML reports | Works but less active |

## Decision

**Adopt VRT using Playwright `toHaveScreenshot()`** rather than deferring or using Chromatic.

### Why not "fix only" (defer VRT)?

Fixing the 4 stories eliminates the immediate problem but leaves 154 story exports' worth of visual surface unguarded. A Tailwind class change, a shadcn/ui upgrade, or a theme token change could silently break dozens of components with no automated signal. The 154 exports across 33 files represent a meaningful and growing visual surface — the non-determinism issue itself demonstrates active story maintenance.

### Why not Chromatic?

Chromatic's free tier provides 5000 snapshots/month. At 154 story exports × ~150 full CI runs/month (PRs + pushes), that is ~23,100 snapshots/month — over 4x the free tier limit. Paid plans start at $149/month, which is not justified at current team size and velocity. Chromatic is not rejected permanently — revisit when CI run volume or team size makes the managed UI review workflow valuable enough to pay for.

### Why Playwright?

- `@playwright/test` is already in `devDependencies`.
- `toHaveScreenshot()` is built into Playwright — no additional packages needed.
- Storybook already builds in CI; VRT is an extension of the existing `build-storybook` step.
- Baselines committed to the repo as binary files — no external service dependency.
- Incremental setup cost over the story fixes is one config file, one test file, and CI additions.

### Non-determinism fix pattern

Replace all dynamic date calls in story files with fixed ISO timestamps:

```ts
// Before (non-deterministic)
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

// After (fixed, deterministic)
const twoHoursAgo = new Date("2026-01-15T08:00:00Z");
```

The fixed date `2026-01-15T10:00:00Z` is used as the reference "now" across all story files for consistency. Relative timestamps derive from it arithmetically.

**Important:** Fixed story data alone is insufficient for full VRT determinism. Several components call `Date.now()` internally at render time (e.g., `formatRelativeTime()` in `NotificationList`/`TrendingTopics`, countdown logic in `SleepTimerMenu`). The VRT test file (`stories.vrt.spec.ts`) uses `page.addInitScript` to mock `Date.now()` to the same reference timestamp before each story navigation, ensuring all time-dependent rendering is deterministic without requiring component-level changes.

### Playwright VRT configuration

- Config file: `playwright.vrt.config.ts` (separate from the existing `playwright.config.ts` if any)
- Test file: `tests/visual/stories.vrt.spec.ts`
- Screenshot dir: `tests/visual/__screenshots__/`
- Browser: Chromium only (Linux CI renderer — see baseline management below)
- Base URL: `http://localhost:6006` (Storybook dev server or `npx serve storybook-static`)

### Baseline management policy

**Baselines must be generated on Linux/Chromium (matching CI).** macOS renders fonts differently from Linux, producing pixel-level noise that causes false failures on every CI run. Never commit baselines generated on macOS.

Baseline files live in `tests/visual/__screenshots__/` and are committed to the repo. They are tracked as binary in `.gitattributes` to prevent useless text diffs.

### Baseline update workflow

When an intentional UI change is made:

1. Push the component change on a feature branch.
2. CI VRT job fails; diff screenshots are uploaded as GitHub Actions artifacts.
3. Developer inspects the artifact to confirm the visual change is intentional.
4. Developer triggers a manual GitHub Actions workflow dispatch that runs `--update-snapshots` against the built Storybook and commits the updated PNGs back to the branch.
5. PR reviewer approves the PNG diff alongside the code change.

Do not run `--update-snapshots` locally on macOS. Always regenerate baselines via the CI dispatch to ensure Linux/Chromium consistency.

### CI integration

VRT runs as part of the existing `quality` job in `.github/workflows/ci.yml`, after `build-storybook`:

1. Cache `~/.cache/ms-playwright` to avoid the ~30–60s Chromium download on every run.
2. Serve `storybook-static/` with `bunx serve`.
3. Run `bunx playwright test --config playwright.vrt.config.ts`.
4. On failure, upload `test-results/` (Playwright's diff output) as a GitHub Actions artifact.

Estimated CI overhead: ~90–180s on cold run, ~65–125s with Playwright cache. This is an estimate; actual measurement is needed after the first full CI run.

VRT runs on every PR (not main-push-only). If this proves too noisy or slow with data, move to main-push-only at that point. Do not pre-emptively restrict gating without evidence.

### Git LFS

Not adopted initially. Baseline PNGs are committed as regular binary files. At 154 story exports × ~400KB/PNG (worst case), total baseline size is ~60MB; realistically ~20–35MB, which is within acceptable range for a git repo. Add Git LFS if baseline directory exceeds 75MB or growth rate becomes a concern.

## Consequences

### Positive

- Every PR gets automated visual coverage over all 154 story exports (and growing).
- No external service dependency — baselines are in the repo, CI uses Playwright.
- Playwright already installed — no new `devDependencies` to install.
- Storybook build already runs in CI — VRT piggybacks on existing infrastructure.
- Non-deterministic stories are fixed as a prerequisite, improving story quality independently.

### Negative

- Baseline maintenance overhead: every intentional visual change requires regenerating affected PNGs and committing them. This is real, ongoing work.
- CI time increases by ~90–180s per run (cold) or ~65–125s (cached). Acceptable at current velocity; re-evaluate if CI becomes a bottleneck.
- Baselines add ~20–60MB to the repo. Manageable but worth monitoring for LFS migration.
- The Linux-only baseline rule is a footgun: a developer who runs `--update-snapshots` locally on macOS and commits will introduce persistent noise. This must be documented and enforced via PR review.

### Risks

- **Baseline drift:** If baselines are not updated promptly after intentional changes, the VRT job becomes a source of noise and developers start ignoring or bypassing it. Mitigation: the CI artifact upload makes it fast to inspect and update; the manual dispatch workflow removes friction.
- **Flaky tests from animation or async rendering:** Some stories may have loading states or CSS transitions that produce different screenshots on different runs. Mitigation: the test file disables all CSS animations and transitions via `page.addStyleTag()` (setting `animation-duration: 0s !important` and `transition-duration: 0s !important` on all elements), which eliminates animation state variance regardless of duration. For stories with async loading, `waitUntil: "networkidle"` is used on navigation. Mark known-flaky stories as skipped until fixed.
