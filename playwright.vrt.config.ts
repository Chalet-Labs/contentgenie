import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright configuration for visual regression testing (VRT).
 *
 * This config is intentionally separate from any future e2e playwright config
 * to keep VRT concerns isolated. Run with:
 *
 *   bunx playwright test --config playwright.vrt.config.ts
 *
 * Baselines live in tests/visual/__screenshots__/ and are committed to the repo.
 * IMPORTANT: Baselines must be generated on Linux/Chromium (CI) to avoid
 * font-rendering noise from macOS. Never commit baselines generated locally on macOS.
 *
 * To update baselines after an intentional UI change, trigger the manual
 * "Update VRT Baselines" GitHub Actions workflow dispatch on the feature branch.
 * See docs/adr/024-visual-regression-testing.md for the full update workflow.
 */
export default defineConfig({
  testDir: "tests/visual",
  snapshotDir: "tests/visual/__screenshots__",
  // Run each story test independently so a single failure doesn't block
  // others and all failures are visible in one run.
  fullyParallel: true,
  // Retry once on CI to reduce flakiness from first-paint timing variance.
  retries: process.env.CI ? 1 : 0,
  // Single worker on CI to keep memory usage predictable.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 20_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:6006",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium-vrt",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
