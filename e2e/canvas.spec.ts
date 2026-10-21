import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await expect(page.locator('.function-card')).toHaveCount(3); });

test('inspects clean before/after, compare and diff, and restores notes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.locator('.function-card').filter({ hasText: 'submitOrder' }).click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('.source-content')).toContainText('createIdempotencyKey');
  await page.getByRole('button', { name: 'before', exact: true }).click();
  await expect(page.locator('.source-content')).not.toContainText('createIdempotencyKey');
  await page.getByRole('button', { name: 'compare', exact: true }).click();
  await expect(page.locator('.compare .cm-editor')).toHaveCount(2);
  await page.getByRole('button', { name: 'diff', exact: true }).click();
  await expect(page.locator('.cm-mergeView')).toBeVisible();
  await page.getByLabel('REVIEW NOTE', { exact: false }).fill('Check duplicate payment behavior.');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('zeile-demo'))).toContain('duplicate payment');
  await page.reload();
  await page.locator('.function-card').filter({ hasText: 'submitOrder' }).click();
  await expect(page.locator('#note')).toHaveValue('Check duplicate payment behavior.');
  expect(errors).toEqual([]);
});

test('moves file containers with attached edges and persists positions', async ({ page }) => {
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  const group = page.locator('[data-id="file:src/checkout.ts"]');
  const heading = group.locator('.file-heading');
  const before = await group.getAttribute('style');
  const pathBefore = await page.locator('.react-flow__edge path.react-flow__edge-path').first().getAttribute('d');
  const box = await heading.boundingBox(); if (!box) throw new Error('Missing group');
  await page.mouse.move(box.x + 70, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 170, box.y + 110, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => group.getAttribute('style')).not.toBe(before);
  await expect.poll(() => page.locator('.react-flow__edge path.react-flow__edge-path').first().getAttribute('d')).not.toBe(pathBefore);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('zeile-demo'))).toContain('file:src/checkout.ts');
});

test('collapses file groups without losing source links, opens scope', async ({ page }) => {
  await page.locator('[data-id="file:src/checkout.ts"]').getByTitle('Collapse file').click();
  await expect(page.locator('.function-card')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.locator('[data-id="file:src/checkout.ts"]').getByTitle('Expand file').click();
  await expect(page.locator('.function-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Scope & limits' }).click();
  await expect(page.getByRole('dialog')).toContainText('README.md');
});

test('creates and removes manual connections, pins layout, and closes scope with Escape', async ({ page }) => {
  const source = page.locator('[data-id="charge"] .react-flow__handle-right');
  const target = page.locator('[data-id="save"] .react-flow__handle-left');
  await source.dragTo(target);
  await expect(page.locator('.react-flow__edge').filter({ hasText: 'manual' })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('zeile-demo') ?? '{}').manualEdges?.length)).toBe(1);
  await page.locator('.react-flow__edge').filter({ hasText: 'manual' }).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.react-flow__edge').filter({ hasText: 'manual' })).toHaveCount(0);
  const pin = page.locator('[data-id="file:src/checkout.ts"]').getByTitle('Pin layout position');
  await pin.click();
  await expect(page.getByTitle('Unpin layout position')).toBeVisible();
  await page.getByRole('button', { name: 'Scope & limits' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('production bundle runs with webview CSP and host messages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://zeile.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') {
      await route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'none'; script-src 'nonce-test'; style-src http://zeile.test 'unsafe-inline'; worker-src blob:; img-src data:;" }, body: '<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script nonce="test" type="module" src="/app.js"></script></body></html>' });
    } else if (path === '/app.js' || path === '/app.css') {
      await route.fulfill({ contentType: path.endsWith('.js') ? 'application/javascript' : 'text/css', body: await readFile(resolve('dist/webview', path.slice(1))) });
    } else await route.abort();
  });
  await page.addInitScript(() => {
    Object.assign(window, { acquireVsCodeApi: () => ({ postMessage: (message: { type: string; side?: string; ref?: string }) => {
      if (message.type === 'changeBranch') {
        document.documentElement.dataset.branchChange = `${message.side}:${message.ref}`;
        return;
      }
      if (message.type === 'ready' || message.type === 'getBranches') setTimeout(() => window.postMessage({ type: 'branches', selection: {
        before: 'refs/heads/main', after: 'refs/heads/feature', options: [
          { ref: 'refs/heads/main', label: 'main', group: 'Local branches' },
          { ref: 'refs/heads/feature', label: 'feature', group: 'Local branches' },
          { ref: 'refs/remotes/origin/develop', label: 'origin/develop', group: 'Remote branches' }
        ]
      } }, '*'), 0);
      if (message.type === 'ready') setTimeout(() => window.postMessage({ type: 'graph', graph: {
        repository: 'fixture', base: 'abc', head: 'def', baseLabel: 'main', headLabel: 'feature', warnings: [], files: [{ path: 'app.ts', status: 'M', represented: true }], unresolvedCalls: 0, edges: [], nodes: [{ id: 'value', file: 'app.ts', name: 'value', kind: 'function', status: 'modified', before: { path: 'app.ts', line: 1, code: 'function value() { return 1; }', signature: '() → number' }, after: { path: 'app.ts', line: 1, code: 'function value() { return 2; }', signature: '() → number' } }]
      } }, '*'), 0);
    } }) });
  });
  await page.goto('http://zeile.test/');
  await expect(page.locator('.function-card')).toHaveCount(1);
  const before = page.getByRole('combobox', { name: 'Before branch' });
  const after = page.getByRole('combobox', { name: 'After branch' });
  await expect(before).toHaveValue('refs/heads/main');
  await expect(after).toHaveValue('refs/heads/feature');
  await before.selectOption('refs/remotes/origin/develop');
  await expect(page.locator('html')).toHaveAttribute('data-branch-change', 'before:refs/remotes/origin/develop');
  await expect(after).toHaveValue('refs/heads/feature');
  await after.selectOption('refs/heads/main');
  await expect(page.locator('html')).toHaveAttribute('data-branch-change', 'after:refs/heads/main');
  await expect(page.getByRole('button', { name: 'Change comparison…' })).toHaveCount(0);
  await page.locator('.function-card').click();
  await expect(page.locator('.source-content')).toContainText('return 2');
  await page.evaluate(() => window.postMessage({ type: 'loading', message: 'Comparing selected branches…' }, '*'));
  await expect(page.getByRole('status')).toContainText('Building the review map');
  await expect(page.getByRole('status')).toContainText('Comparing selected branches');
  await expect(page.locator('.mapping-spinner')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('1s elapsed');
  await expect(page.locator('.function-card')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Before branch' })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'After branch' })).toBeEnabled();
  await before.selectOption('refs/heads/feature');
  await expect(page.locator('html')).toHaveAttribute('data-branch-change', 'before:refs/heads/feature');
  await page.evaluate(() => window.postMessage({ type: 'error', message: 'Could not load selected branch.' }, '*'));
  await expect(page.getByRole('alert')).toContainText('Could not load selected branch');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('.function-card')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Before branch' })).toBeEnabled();
  await page.evaluate(() => window.postMessage({ type: 'branches', selection: { options: [], before: '', after: '' } }, '*'));
  await expect(before).toBeEnabled();
  await expect(before).toHaveValue('refs/heads/main');
  await expect(page.getByRole('button', { name: 'Retry branch list' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('browser demo explains why branch controls cannot be opened', async ({ page }) => {
  await expect(page.getByText('Browser demo — branch selection requires the VS Code extension.', { exact: false })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Before branch' })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'After branch' })).toBeDisabled();
});
