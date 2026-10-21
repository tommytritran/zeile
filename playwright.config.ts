import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', use: { baseURL: 'http://127.0.0.1:5189', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm run dev:webview', url: 'http://127.0.0.1:5189', reuseExistingServer: !process.env.CI },
});
