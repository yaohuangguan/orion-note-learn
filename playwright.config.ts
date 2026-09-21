import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: 'npm run start',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command:
        'wrangler dev --local --port 8787 --var AUTH_PEPPER:orion-note-learn-playwright-only-pepper-2026',
      url: 'http://localhost:8787/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'vite --host localhost --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
})
