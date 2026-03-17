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

/** Shape of Storybook's /index.json response (v4, Storybook 8) */
interface StorybookIndex {
  v: number
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

// Fetch the story index at module scope. Playwright test files run as ES
// modules, so top-level await is valid here — this lets us enumerate test
// cases before collection so each story gets its own `test()` call, enabling
// per-story parallelism and isolating failures to individual stories.
let response: Response
try {
  response = await fetch("http://localhost:6006/index.json")
} catch (err) {
  throw new Error(
    `Network error fetching Storybook index at http://localhost:6006/index.json — ` +
      `is the server running? Underlying error: ${err instanceof Error ? err.message : String(err)}`
  )
}
if (!response.ok) {
  throw new Error(
    `Failed to fetch Storybook index: HTTP ${response.status} ${response.statusText} — ` +
      `is Storybook running on http://localhost:6006?`
  )
}

let index: StorybookIndex
try {
  index = await response.json()
} catch (err) {
  throw new Error(
    `Storybook index.json is not valid JSON (HTTP ${response.status}). ` +
      `The server may have returned an error page. ` +
      `Underlying error: ${err instanceof Error ? err.message : String(err)}`
  )
}

if (typeof index?.entries !== "object" || index.entries === null) {
  throw new Error(
    `Storybook index.json has unexpected shape — expected { entries: {...} } ` +
      `but got keys: [${Object.keys(index ?? {}).join(", ")}]`
  )
}

const storyIds = Object.entries(index.entries)
  .filter(([, entry]) => entry.type === "story")
  .map(([id]) => id)

if (storyIds.length === 0) {
  const allEntries = Object.values(index.entries)
  const entryTypes = [...new Set(allEntries.map((e) => e.type))]
  throw new Error(
    `No story entries found in Storybook index (found ${allEntries.length} entries ` +
      `with types: [${entryTypes.join(", ")}]). ` +
      `Expected at least one entry with type "story".`
  )
}

test.describe("Visual Regression", () => {
  for (const id of storyIds) {
    test(`${id} matches baseline`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${id}&viewMode=story`, {
        waitUntil: "networkidle",
      })

      // Wait for CSS animations/transitions to settle — `networkidle` alone
      // won't stop Storybook skeleton loaders that use CSS animation.
      await page.waitForTimeout(300)

      // Screenshot name is the story ID (e.g. dashboard-trendingtopics--default).
      // Renaming the story title or export name changes the ID and orphans the
      // baseline — delete the old PNG and regenerate via the CI workflow.
      await expect(page).toHaveScreenshot(`${id}.png`, {
        maxDiffPixelRatio: 0.01,
        // Viewport-only: consistent dimensions regardless of content height.
        fullPage: false,
      })
    })
  }
})
