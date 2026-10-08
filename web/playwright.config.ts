import { defineConfig } from '@playwright/test'

// Runs against a real backend serving the built UI at /app (make dev + `pnpm build`, or the
// compose stack). Credentials: LISTMONK_ADMIN_USER / LISTMONK_ADMIN_PASSWORD.
export default defineConfig({
  testDir: './e2e',
  // Against the Vite dev server the first visit to a route compiles it on demand, which can be slow.
  expect: { timeout: 10_000 },
  use: {
    // A wrong locator should fail on its own, well before the test timeout hides it behind cleanup errors.
    actionTimeout: 10_000,
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:9000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /restarts\.spec\.ts/],
      use: { storageState: 'e2e/.auth/state.json' },
    },
    // Saving settings reloads the server; those specs run alone, after everything else has finished.
    {
      name: 'restarts',
      dependencies: ['chromium'],
      testMatch: /restarts\.spec\.ts/,
      fullyParallel: false,
      use: { storageState: 'e2e/.auth/state.json' },
    },
  ],
})
