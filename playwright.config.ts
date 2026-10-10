import { defineConfig, devices } from '@playwright/test';

// In sandboxes with a preinstalled Chromium set PW_CHROMIUM_PATH (e.g. /opt/pw-browsers/chromium).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173', launchOptions: { executablePath } },
  webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
