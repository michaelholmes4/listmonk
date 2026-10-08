import { defineConfig } from '@playwright/test'

// Runs against a real backend serving the built UI at /app (make dev + `pnpm build`, or the
// compose stack). Credentials: LISTMONK_ADMIN_USER / LISTMONK_ADMIN_PASSWORD.
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:9000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', dependencies: ['setup'], testIgnore: /auth\.setup\.ts/, use: { storageState: 'e2e/.auth/state.json' } },
  ],
})
