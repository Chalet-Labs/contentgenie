/**
 * Visual Regression Tests for all Storybook stories.
 *
 * This test file discovers every story from Storybook's index API, navigates
 * to each one via the iframe URL, and captures a screenshot for comparison
 * against committed baselines in tests/visual/__screenshots__/.
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
 *   2. The CI VRT job will fail; diff screenshots are uploaded as GitHub Actions
 *      artifacts — inspect them to confirm the change is intentional.
 *   3. Trigger the "Update VRT Baselines" manual workflow dispatch on the same
 *      branch (GitHub Actions → Workflows → Update VRT Baselines → Run workflow).
 *      This runs `--update-snapshots` on CI Linux and commits the updated PNGs
 *      back to the branch automatically.
 *   4. Confirm the updated PNG diffs in the follow-up commit look correct.
 *
 * Never run `npx playwright test --update-snapshots` locally on macOS.
 *
 * See docs/adr/024-visual-regression-testing.md for full context.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { test, expect } from "@playwright/test"

/** Shape of Storybook's /index.json response */
interface StorybookIndex {
  entries: Record<
    string,
    {
      type: "story" | "docs"
      id: string
      title: string
      name: string
    }
  >
}

// Fetch the story index at module scope. Playwright supports top-level await
// in test files, which allows us to enumerate test cases before collection so
// each story gets its own `test()` call — enabling true per-story parallelism
// and isolating failures to individual stories rather than one mega-test.
const response = await fetch("http://localhost:6006/index.json")
if (!response.ok) {
  throw new Error(
    `Failed to fetch Storybook index: ${response.status} ${response.statusText} — is Storybook running on http://localhost:6006?`
  )
}
const index: StorybookIndex = await response.json()
const storyIds = Object.entries(index.entries)
  .filter(([, entry]) => entry.type === "story")
  .map(([id]) => id)

if (storyIds.length === 0) {
  throw new Error("No stories found in Storybook index — check the build.")
}

test.describe("Visual Regression", () => {
  for (const id of storyIds) {
    test(`${id} matches baseline`, async ({ page }) => {
      // Navigate to the isolated story iframe. The `?args=` param is omitted so
      // default args are used (matching the baseline snapshot conditions).
      await page.goto(`/iframe.html?id=${id}&viewMode=story`, {
        waitUntil: "networkidle",
      })

      // Wait for any CSS animations/transitions to settle. Storybook's own
      // skeleton loaders use CSS animation — `networkidle` alone won't stop them.
      await page.waitForTimeout(300)

      // Screenshot name uses the story ID so it is human-readable and stable
      // across renames as long as the Storybook title + export name stay the same.
      await expect(page).toHaveScreenshot(`${id}.png`, {
        // Allow up to 1% pixel difference to account for sub-pixel font rendering
        // variance across CI Linux runners (same OS, but different GPU/font cache).
        maxDiffPixelRatio: 0.01,
        // Viewport-only screenshots ensure consistent dimensions regardless of
        // story content height — full-page mode can produce variable-size images
        // that cause false diffs when content reflowing occurs.
        fullPage: false,
      })
    })
  }
})
