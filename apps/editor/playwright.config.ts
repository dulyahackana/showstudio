import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against a real stack: API (fresh data dir) + seed + simulated fleet + editor.
 * Locally an already-running stack is reused (`bun run dev`, `bun run seed`, `bun run fleet-sim`).
 */
export default defineConfig({
  testDir: './e2e',
  // *.e2e.ts, not *.spec.ts: `bun test` would otherwise pick these up as unit tests.
  testMatch: '**/*.e2e.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } } }],
  webServer: {
    command: 'bun ../../scripts/e2e-stack.ts',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
  },
})
