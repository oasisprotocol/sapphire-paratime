import { defineConfig, devices } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  timeout: 2 * 60 * 1000,
  testDir: "./test/e2e/",
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html"], ["list", { printSteps: true }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: process.env.FRONTEND_URL || "http://localhost:5173/",
    trace: "on-first-retry",
    headless: false,
    screenshot: {
      mode: "only-on-failure",
      fullPage: true,
    },
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'main',
      testDir: './test/e2e/',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
