import { defineConfig, devices } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  timeout: process.env.CI ? 5 * 60 * 1000 : 2 * 60 * 1000, // 5 minutes in CI, 2 minutes locally
  testDir: "./test/",
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0, // 2 retries in CI, 0 locally
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined, // Use 1 worker in CI
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html"], ["list", { printSteps: true }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: process.env.FRONTEND_URL || "http://localhost:3000/",
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
      testDir: './test/',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm run start:server',
    url: process.env.FRONTEND_URL || "http://localhost:3000/",
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: process.env.CI ? 120 * 1000 : 60 * 1000, // 2 minutes in CI, 1 minute locally
  },
});
