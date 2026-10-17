import { defineConfig, devices } from '@playwright/test';

// In sandboxes with a preinstalled Chromium set PW_CHROMIUM_PATH (e.g. /opt/pw-browsers/chromium).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
// E2E_ONLINE=1 also runs e2e/online.spec.ts against a local Supabase stack (`npx supabase start`).
const online = !!process.env.E2E_ONLINE || !!process.env.STORE_SHOTS;
// STORE_SHOTS=1 renders the App Store screenshots (e2e/store.spec.ts) instead of the online tests.
const store = !!process.env.STORE_SHOTS;

export default defineConfig({
  testDir: 'e2e',
  // English UI locale by default, so move notation is predictable (German letters are tested explicitly).
  use: { baseURL: 'http://localhost:4173', locale: 'en-US', launchOptions: { executablePath } },
  webServer: [
    { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true, timeout: 120_000 },
    ...(online
      ? [{ command: 'npx tsc -b --noEmit && npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4174', port: 4174, reuseExistingServer: true, timeout: 120_000 }]
      : []),
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: ['online.spec.ts', 'store.spec.ts'] },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: ['online.spec.ts', 'store.spec.ts'] },
    ...(store
      ? [{ name: 'store', testMatch: 'store.spec.ts', use: { baseURL: 'http://localhost:4174', launchOptions: { executablePath } } }]
      : []),
    ...(online && !store
      ? [{ name: 'online', testMatch: 'online.spec.ts', use: {
          ...devices['Desktop Chrome'], baseURL: 'http://localhost:4174',
          // Fake camera and microphone for the video tests; no permission prompts.
          launchOptions: { executablePath, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
          permissions: ['camera', 'microphone'],
        } }]
      : []),
  ],
});
