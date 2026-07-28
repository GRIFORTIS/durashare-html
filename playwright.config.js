import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CI detection must be stable and specific.
// - GitHub Actions: GITHUB_ACTIONS === 'true'
// - Avoid treating arbitrary local shells (e.g., Cursor/terminals) with CI=1 as CI.
const isCI = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';

function tryPinPlaywrightBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return;

  const home = process.env.HOME;
  const platform = process.platform;
  if (!home) return;

  const candidates = [];
  if (platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Caches', 'ms-playwright'));
  } else if (platform === 'linux') {
    candidates.push(path.join(home, '.cache', 'ms-playwright'));
  } else if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    candidates.push(path.join(localAppData, 'ms-playwright'));
  }

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = p;
        return;
      }
    } catch {
      // ignore
    }
  }
}

// Local macOS: use installed Google Chrome (no `playwright install` required).
const useSystemChrome = !isCI && process.platform === 'darwin';
if (useSystemChrome) {
  delete process.env.PLAYWRIGHT_BROWSERS_PATH;
} else {
  tryPinPlaywrightBrowsersPath();
}

export default defineConfig({
  testDir: './tests',
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: isCI,
  
  // No retries - fail fast
  retries: 0,
  
  // Opt out of parallel tests on CI
  workers: isCI ? 1 : undefined,
  
  // Local runs: console output (fast feedback, no ambiguity).
  // CI runs: HTML report (artifact upload).
  reporter: isCI
    ? [['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['line']],

  // Avoid writing heavy artifacts into Dropbox-synced folders during local runs
  outputDir: isCI
    ? 'test-results'
    : path.join(os.tmpdir(), 'durashare-html-playwright', 'test-results'),
  
  use: {
    // Run browser in headless mode (hidden)
    headless: true,
    
    // Base URL to use in actions like `await page.goto('/')`
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video on failure (CI only — local runs use system Chrome)
    video: isCI ? 'retain-on-failure' : 'off',

    // Critical: Allow file:// protocol access
    launchOptions: {
      args: ['--allow-file-access-from-files', '--disable-web-security']
    }
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        ...(useSystemChrome ? { channel: 'chrome' } : {})
      }
    }
  ],

  // Timeout settings
  timeout: 15000, // 15 seconds per test
  expect: {
    timeout: 5000, // 5 seconds for expect assertions
  },
});

