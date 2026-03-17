import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright configuration for visual regression testing (VRT).
 *
 * This config is intentionally separate from any future e2e playwright config
 * to keep VRT concerns isolated. Run with:
 *
 *   npx playwright test --config playwright.vrt.config.ts
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
  // Fail fast — if one story fails we still want to see all failures.
  fullyParallel: true,
  // Retry once on CI to reduce flakiness from first-paint timing variance.
  retries: process.env.CI ? 1 : 0,
  // Single worker on CI to keep memory usage predictable.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    // Storybook static build served by `npx serve storybook-static -p 6006`
    baseURL: "http://localhost:6006",
    // Wait for network to be idle before taking screenshots (catches lazy-loaded fonts).
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium-vrt",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
