/**
 * Visual Regression Tests for all Storybook stories.
 *
 * This test file reads the story ID list produced by global-setup.ts, then
 * navigates to each story via the Storybook iframe URL and captures a
 * screenshot for comparison against committed baselines in
 * tests/visual/__screenshots__/.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * BASELINE UPDATE WORKFLOW
 * ──────────────────────────────────────────────────────────────────────────
 * Baselines MUST be generated on Linux/Chromium (CI) — macOS font rendering
 * differs from Linux and will cause false failures on every CI run.
 *
 * To update baselines after an intentional UI change:
 *
 *   1. Push your component change on a feature branch.
 *   2. The CI VRT job will fail; diff screenshots are uploaded as GitHub
 *      Actions artifacts — inspect them to confirm the change is intentional.
 *   3. Trigger the "Update VRT Baselines" manual workflow dispatch on the
 *      same branch (GitHub Actions → Workflows → Update VRT Baselines →
 *      Run workflow). This runs `--update-snapshots` on CI Linux and commits
 *      the updated PNGs back to the branch automatically.
 *   4. Confirm the updated PNG diffs in the follow-up commit look correct.
 *
 * Never run `bunx playwright test --update-snapshots` locally on macOS.
 *
 * See docs/adr/024-visual-regression-testing.md for full context.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { test, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

// Fixed timestamp matching the reference "now" used across all story files.
// Mocked via page.addInitScript so Date.now() returns a stable value for
// time-dependent components (formatRelativeTime, SleepTimerMenu countdown, etc.).
const FIXED_NOW = new Date("2026-01-15T10:00:00Z").getTime()

// Story IDs are populated by globalSetup (global-setup.ts), which fetches
// the Storybook index and writes them to .story-ids.json. We read them
// synchronously here to avoid top-level await — Playwright's require()-based
// transform cannot handle ESM with TLA on Node 22+.
const storyIds: string[] = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "tests/visual/.story-ids.json"),
    "utf-8"
  )
)

test.describe("Visual Regression", () => {
  for (const id of storyIds) {
    test(`${id} matches baseline`, async ({ page }) => {
      // Mock Date.now() so time-dependent components (formatRelativeTime,
      // SleepTimerMenu countdown, etc.) render deterministically.
      await page.addInitScript((fixedNow: number) => {
        Date.now = () => fixedNow
      }, FIXED_NOW)

      await page.goto(
        `/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`,
        { waitUntil: "networkidle" }
      )

      // Disable all CSS animations and transitions to prevent flaky
      // screenshots. More reliable than a fixed waitForTimeout because it
      // eliminates animation state variance regardless of duration.
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
        `,
      })

      // Screenshot name is the story ID (e.g. dashboard-trendingtopics--default).
      // Renaming the story title or export name changes the ID and orphans the
      // baseline — delete the old PNG and regenerate via the CI workflow.
      await expect(page).toHaveScreenshot(`${id}.png`, {
        maxDiffPixelRatio: 0.005,
        // Viewport-only: consistent dimensions regardless of content height.
        fullPage: false,
      })
    })
  }
})
