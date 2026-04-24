import { defineConfig, devices } from "@playwright/test";

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
  globalSetup: "tests/visual/global-setup.ts",
  testDir: "tests/visual",
  snapshotDir: "tests/visual/__screenshots__",
  // Run all stories in parallel across workers when multiple workers are
  // available. On CI with workers: 1 this has no effect, but it speeds up
  // local runs where workers defaults to unlimited.
  fullyParallel: true,
  // Retry once on CI to reduce flakiness from first-paint timing variance.
  retries: process.env.CI ? 1 : 0,
  // Two workers on CI to halve VRT time; Playwright's per-test isolation
  // keeps memory bounded. Unlimited locally for fast iteration.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 20_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.STORYBOOK_URL ?? "http://localhost:6006",
    // Timeout for individual Playwright actions (click, fill, waitForSelector).
    // Navigation timeouts (page.goto) use `navigationTimeout` (default 30 s).
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium-vrt",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
