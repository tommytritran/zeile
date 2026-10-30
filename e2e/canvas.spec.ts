import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compareSources } from '../src/analyze';
import type { ReviewGraph } from '../src/model';

function fixture(): ReviewGraph {
  const before = new Map<string, string>([
    ['api/controllers/orders.ts', 'import { processOrder } from "../services/orders";\nexport function submitOrder(value: number) {\n  return processOrder(value);\n}'],
    ['api/services/orders.ts', 'import { saveOrder } from "../connectors/orders";\nexport function processOrder(value: number) {\n  return saveOrder(value);\n}'],
    ['api/connectors/orders.ts', 'export function saveOrder(value: number) { return value; }'],
    ['web/components/Checkout.tsx', 'export function Checkout() { return [1, 2].map(value => value + 1); }'],
    ['api/controllers/orders.test.ts', 'export function testOrder() { return 1; }'],
    ['generated/client.ts', 'export function generatedCall() { return 1; }']
  ]);
  for (let i = 0; i < 15; i++) before.set(`api/utils/helper${i}.ts`, `export function helper${i}() { return ${i}; }`);
  const after = new Map(before);
  after.set('api/controllers/orders.ts', before.get('api/controllers/orders.ts')!.replace('processOrder(value)', 'processOrder(value + 1)'));
  after.set('web/components/Checkout.tsx', before.get('web/components/Checkout.tsx')!.replace('value + 1', 'value + 2'));
  after.set('api/controllers/orders.test.ts', 'export function testOrder() { return 2; }');
  after.set('generated/client.ts', 'export function generatedCall() { return 2; }');
  for (let i = 0; i < 15; i++) after.set(`api/utils/helper${i}.ts`, `export function helper${i}() { return ${i + 1}; }`);
  const files = [...after].filter(([path, code]) => code !== before.get(path)).map(([path]) => ({ path, status: 'M', represented: false }));
  files.push({ path: 'README.md', status: 'M', represented: false });
  const data = compareSources(before, after, files);
  const fileSources = Object.fromEntries(files.map(file => [file.path, { before: { path: file.path, line: 1, signature: 'Full file', code: before.get(file.path) ?? '# Orders\nOld documentation' }, after: { path: file.path, line: 1, signature: 'Full file', code: after.get(file.path) ?? '# Orders\nNew documentation' } }]));
  return { repository: 'realistic-fixture', base: 'before123', head: 'after456', baseLabel: 'main (merge-base)', headLabel: 'feature', comparison: { kind: 'pr', target: 'target789', mergeBase: 'before123' }, ...data, fileSources };
}
async function loadFixture(page: Page, graph = fixture()) { await page.evaluate(value => window.postMessage({ type: 'graph', graph: value }, '*'), graph); await expect(page.locator('.overview-card')).toHaveCount(graph.files.length); }
async function openController(page: Page) {
  await page.locator('.file-item').filter({ hasText: 'api/controllers/orders.ts' }).click();
  await page.getByRole('button', { name: /submitOrder/ }).first().click();
  await expect(page.locator('.reading-heading h2')).toHaveText('submitOrder');
}
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.clear()); await page.goto('/'); await expect(page.locator('.overview-card')).toHaveCount(3); });

test('landing is a complete compact file overview, not a global function diagram', async ({ page }) => {
  await loadFixture(page);
  await expect(page.locator('.overview-card')).toHaveCount(20);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.getByLabel('File category')).toHaveValue('all');
  await page.getByLabel('Search changed files').fill('orders');
  await expect(page.locator('.overview-card')).toHaveCount(2);
  await page.getByLabel('Search changed files').fill('');
  await page.getByLabel('File category').selectOption('tests');
  await expect(page.locator('.overview-card')).toHaveCount(1);
  await page.getByLabel('File category').selectOption('all');
  await page.locator('.file-item').filter({ hasText: 'README.md' }).click();
  await expect(page.locator('.source-reader')).toContainText('New documentation');
});

test('review brief exposes provenance, whole-comparison metadata and coverage gaps', async ({ page }) => {
  const graph = fixture();
  graph.metadata = { churn: graph.files.map((file, i) => ({ path: file.path, added: i === 0 ? null : 3, deleted: i === 0 ? null : 1 })), commits: { total: 25, recent: [{ sha: 'commit123', author: 'Alex', date: '2026-10-27T12:00:00Z', subject: 'Adjust order handling' }] }, unavailable: [] };
  graph.fileSources!['README.md'] = { unavailable: 'after: exceeds file limit' };
  await loadFixture(page, graph);
  const brief = page.getByRole('region', { name: 'Review brief' });
  await page.getByText('Comparison metadata & source coverage', { exact: true }).click();
  await expect(brief).toContainText('target789');
  await expect(brief).toContainText('before123');
  await expect(brief).toContainText('after456');
  await expect(brief).toContainText('not verified');
  await expect(brief).toContainText('+57 / −19');
  await expect(brief).toContainText('1 binary files');
  await expect(brief).toContainText('19 complete file sources · 1 incomplete');
  await page.getByLabel('Search changed files').fill('README');
  await expect(page.locator('.overview-card')).toHaveCount(1);
  await expect(brief).toContainText('+57 / −19');
  await brief.locator('.brief-commits summary').click();
  await expect(brief).toContainText('showing 1 of 25');
  await expect(brief).toContainText('Adjust order handling');
  await brief.getByText('Files needing another diff viewer (1)', { exact: true }).click();
  await brief.getByRole('button', { name: 'README.md', exact: true }).click();
  await expect(page.locator('.source-unavailable')).toContainText('exceeds file limit');
});

test('review brief treats missing metadata as unavailable and fits narrow screens', async ({ page }) => {
  await page.getByText('Comparison metadata & source coverage', { exact: true }).click();
  const brief = page.getByRole('region', { name: 'Review brief' });
  await expect(brief).toContainText('Git line metadata not provided');
  await expect(brief).toContainText('Git commit metadata not provided');
  await page.setViewportSize({ width: 700, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('nested callback edit is one owning review unit and full-file context is optional', async ({ page }) => {
  await loadFixture(page);
  await page.locator('.file-item').filter({ hasText: 'Checkout.tsx' }).click();
  await expect(page.locator('.review-unit')).toHaveCount(1);
  await expect(page.locator('.review-unit')).toContainText('Checkout');
  await page.locator('.review-unit').click();
  await expect(page.locator('.nested-symbols summary')).toContainText('Nested symbols (1)');
  await expect(page.locator('.source-reader')).toContainText('value + 2');
});

test('connected reading follows real references as diffs without leaving the reader', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Related change groups' })).toContainText('2 connected files');
  await page.getByRole('button', { name: 'Read connected diffs' }).click();
  const connections = page.getByRole('region', { name: 'Connected change reading' });
  await expect(connections).toBeVisible();
  const heading = await page.locator('.reading-heading h2').innerText();
  const next = connections.locator('.connected-node').first();
  const nextName = await next.locator('strong').innerText();
  await page.getByRole('button', { name: 'after', exact: true }).click();
  await next.click();
  await expect(page.locator('.reading-heading h2')).toHaveText(nextName);
  await expect(page.getByRole('button', { name: 'compare', exact: true })).toHaveClass(/selected/);
  await expect(page.locator('.source-reader')).toBeVisible();
  expect((await page.locator('.source-reader').boundingBox())!.width).toBeGreaterThan(900);
  await page.getByRole('button', { name: 'Back in reading history' }).click();
  await expect(page.locator('.reading-heading h2')).toHaveText(heading);
  await expect(page.getByRole('button', { name: 'after', exact: true })).toHaveClass(/selected/);
  await page.getByRole('button', { name: 'Hide connections' }).click();
  await expect(connections).toHaveCount(0);
});

test('nested operations remain searchable from full file context', async ({ page }) => {
  await loadFixture(page);
  await page.locator('.file-item').filter({ hasText: 'Checkout.tsx' }).click();
  await page.locator('.file-symbol-browser summary').click();
  await page.getByLabel('Find function in file').fill('callback');
  await page.locator('.file-symbol-browser button').first().click();
  await expect(page.locator('.reading-heading h2')).toContainText('callback');
  await expect(page.getByRole('region', { name: 'Connected change reading' })).toBeVisible();
});

test('before grouping scope follows the diff and excluded connections remain readable', async ({ page }) => {
  await page.getByLabel('Change group revision').selectOption('before');
  await page.getByRole('button', { name: 'Read connected diffs' }).click();
  await expect(page.getByLabel('Connected reference revision')).toHaveValue('before');
  await page.getByRole('button', { name: 'Exclusions', exact: true }).click();
  await page.getByLabel('Excluded file names / paths').fill('src/');
  await page.getByRole('button', { name: 'Apply exclusions' }).click();
  const next = page.locator('.connected-node').first();
  await expect(next).toBeEnabled();
  const name = await next.locator('strong').innerText();
  await next.click();
  await expect(page.locator('.reading-heading h2')).toHaveText(name);
  await page.getByLabel('Connected reference revision').selectOption('after');
  await page.getByRole('button', { name: 'Back in reading history' }).click();
  await expect(page.getByLabel('Connected reference revision')).toHaveValue('before');
});
test('removed function investigation starts in Before even when reader reference scope was After', async ({ page }) => {
  const graph = fixture();
  const removed = graph.nodes.find(node => node.name === 'submitOrder')!;
  removed.after = undefined; removed.status = 'removed';
  await loadFixture(page, graph);
  await openController(page);
  await expect(page.getByLabel('Connected reference revision')).toHaveValue('after');
  await page.getByRole('button', { name: 'Explore this function', exact: true }).click();
  await expect(page.getByLabel('Relationship revision')).toHaveValue('before');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
});

test('follows unchanged intermediary to connector without rendering unrelated changes', async ({ page }) => {
  await loadFixture(page);
  await openController(page);
  await page.getByRole('button', { name: 'Explore this function', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  const process = page.locator('.neighbor').filter({ hasText: 'processOrder' });
  await expect(process).toContainText('api/services/orders.ts');
  await process.getByRole('button', { name: 'Reveal', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  const save = page.locator('.neighbor').filter({ hasText: 'saveOrder' });
  await save.getByRole('button', { name: 'Reveal', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__node')).not.toContainText(['helper0']);
  const boxes = await page.locator('.react-flow__node').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]; expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
  }
  await page.getByRole('button', { name: 'Clear highlight', exact: true }).click();
  await page.getByRole('button', { name: 'Return to code', exact: true }).click();
  await expect(page.locator('.reading-heading h2')).toHaveText('submitOrder');
  await expect(page.getByRole('button', { name: 'compare', exact: true })).toHaveClass(/selected/);
});

test('reader stays wide, restores scroll through history, and keeps comparison preferences', async ({ page }) => {
  const graph = fixture();
  const controller = graph.nodes.find(node => node.name === 'submitOrder')!;
  const long = Array.from({ length: 150 }, (_, i) => `  const value${i} = ${i};`).join('\n');
  controller.before!.code = `function submitOrder() {\n${long}\n return 1;\n}`;
  controller.after!.code = controller.before!.code.replace('return 1', 'return 2');
  await loadFixture(page, graph); await openController(page);
  const width = (await page.locator('.source-reader').boundingBox())!.width;
  expect(width).toBeGreaterThan(900);
  await page.getByLabel('Highlight changes', { exact: true }).uncheck();
  await page.locator('.cm-mergeView').evaluate(element => { element.scrollTop = 600; element.dispatchEvent(new Event('scroll')); });
  const top = await page.locator('.cm-mergeView').evaluate(element => element.scrollTop);
  expect(top).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Explore this function', exact: true }).click();
  await page.getByRole('button', { name: 'Return to code', exact: true }).click();
  await expect.poll(() => page.locator('.cm-mergeView').evaluate(element => element.scrollTop)).toBe(top);
  await page.getByRole('button', { name: 'Explore relationships', exact: true }).first().click();
  await page.locator('.neighbor').filter({ hasText: 'processOrder' }).getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.locator('.reading-heading h2')).toHaveText('processOrder');
  await page.getByRole('button', { name: 'Back in reading history' }).click();
  await expect(page.locator('.reading-heading h2')).toHaveText('submitOrder');
  await expect(page.getByLabel('Highlight changes', { exact: true })).not.toBeChecked();
  await expect.poll(() => page.locator('.cm-mergeView').evaluate(element => element.scrollTop)).toBe(top);
});

test('call sites select the correct caller revision and missing source is never silently a deletion', async ({ page }) => {
  await loadFixture(page); await openController(page);
  await page.getByRole('button', { name: 'Explore this function', exact: true }).click();
  await page.locator('.neighbor').filter({ hasText: 'processOrder' }).getByRole('button', { name: /Call site/ }).click();
  await expect(page.getByRole('button', { name: 'after', exact: true })).toHaveClass(/selected/);
  await expect(page.locator('.cm-content')).toContainText('processOrder(value + 1)');
  await page.getByRole('button', { name: 'Back in reading history' }).click();
  await expect(page.getByRole('button', { name: 'compare', exact: true })).toHaveClass(/selected/);
  const graph = fixture();
  graph.fileSources!['README.md'] = { before: { path: 'README.md', line: 1, code: '# Old', signature: 'Full file' }, unavailable: 'after: exceeds file limit' };
  await loadFixture(page, { ...graph, head: 'another-head' });
  await page.locator('.file-item').filter({ hasText: 'README.md' }).click();
  await expect(page.getByRole('alert')).toContainText('Incomplete file comparison');
});

test('partial indexed function coverage is marked unavailable rather than deleted code', async ({ page }) => {
  const graph = fixture();
  const partial = graph.nodes.find(node => node.name === 'processOrder')!;
  partial.before = undefined; partial.status = 'context';
  await loadFixture(page, graph); await openController(page);
  await page.getByRole('button', { name: 'Explore this function', exact: true }).click();
  await page.locator('.neighbor').filter({ hasText: 'processOrder' }).getByRole('button', { name: 'Read', exact: true }).click();
  await page.getByRole('button', { name: 'compare', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('function revision is unavailable');
  await expect(page.locator('.revision-headings')).toContainText('Source unavailable in indexed snapshot');
  await expect(page.locator('.cm-changedText')).toHaveCount(0);
});

test('syntax colors, clean highlighting toggle, absent revisions and notes remain usable', async ({ page }) => {
  await page.locator('.file-item').filter({ hasText: 'checkout.ts' }).click();
  await page.locator('.review-unit').click();
  await expect(page.locator('.cm-merge-b .cm-content span').filter({ hasText: /^return$/ })).toHaveCSS('color', 'rgb(196, 167, 231)');
  await page.locator('.cm-editor.cm-merge-a').evaluate(element => element.setAttribute('data-editor-identity', 'kept'));
  await page.getByLabel('Highlight changes', { exact: true }).uncheck();
  await expect(page.locator('.cm-changedText')).toHaveCount(0);
  await expect(page.locator('.cm-changedLine').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.cm-editor.cm-merge-a')).toHaveAttribute('data-editor-identity', 'kept');
  await page.getByRole('button', { name: 'Review note', exact: true }).click();
  await page.getByLabel('Local review note · not verification').fill('Check retries');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('zeile-demo'))).toContain('Check retries');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Read change', exact: true }).click();
  await expect(page.getByLabel('Local review note · not verification')).toHaveValue('Check retries');
  await expect(page.locator('.cm-content').first()).toHaveAttribute('contenteditable', 'false');
});

test('exclusions never remove files from review or close readable source', async ({ page }) => {
  await loadFixture(page); await openController(page);
  await page.getByRole('button', { name: 'Exclusions', exact: true }).click();
  await page.getByLabel('Excluded file names / paths').fill('controllers');
  await page.getByRole('button', { name: 'Apply exclusions' }).click();
  await expect(page.locator('.reading-heading h2')).toHaveText('submitOrder');
  await expect(page.getByRole('button', { name: 'Explore this function', exact: true })).toBeDisabled();
  await expect(page.locator('.file-item')).toHaveCount(20);
  await expect(page.locator('.file-item').filter({ hasText: 'api/controllers/orders.ts' })).toContainText('excluded from map');
  await page.getByLabel('Search changed files').fill('README');
  await expect(page.locator('.reading-heading h2')).toHaveText('submitOrder');
});

test('mobile file navigation and left resize work without a permanently cramped reader', async ({ page }) => {
  const queue = page.locator('.queue-panel');
  const handle = page.getByRole('button', { name: 'Resize review queue', exact: true });
  const original = (await queue.boundingBox())!.width;
  await handle.focus(); await handle.press('ArrowRight');
  await expect.poll(async () => (await queue.boundingBox())!.width).toBe(original + 20);
  await handle.press('Home');
  await page.setViewportSize({ width: 700, height: 850 });
  await page.getByRole('button', { name: 'Changed files', exact: true }).click();
  await page.locator('.file-item').filter({ hasText: 'README.md' }).click();
  await expect(page.locator('.source-reader')).toBeVisible();
  expect((await page.locator('.source-reader').boundingBox())!.width).toBeGreaterThan(650);
});

test('production CSP bridge supports branch search, comparison kind and loading recovery', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('http://zeile.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') await route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'none'; script-src 'nonce-test'; style-src http://zeile.test 'unsafe-inline'; worker-src blob:; img-src data:;" }, body: '<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script nonce="test" type="module" src="/app.js"></script></body></html>' });
    else if (path === '/app.js' || path === '/app.css') await route.fulfill({ contentType: path.endsWith('.js') ? 'application/javascript' : 'text/css', body: await readFile(resolve('dist/webview', path.slice(1))) });
    else await route.abort();
  });
  await page.addInitScript(() => Object.assign(window, { acquireVsCodeApi: () => ({ postMessage: (message: { type: string; side?: string; ref?: string; kind?: string }) => {
    if (message.type === 'changeBranch') document.documentElement.dataset.branchChange = `${message.side}:${message.ref}`;
    if (message.type === 'changeComparisonKind') document.documentElement.dataset.kindChange = message.kind;
    if (message.type === 'ready' || message.type === 'getBranches') setTimeout(() => window.postMessage({ type: 'branches', selection: { before: 'main', after: 'feature', comparisonKind: 'pr', options: [
      { ref: 'main', label: 'main', group: 'Local branches' }, { ref: 'feature', label: 'feature', group: 'Local branches' },
      ...Array.from({ length: 30 }, (_, i) => ({ ref: `branch-${i}`, label: `feature/branch-${i}`, group: 'Local branches' }))
    ] } }, '*'), 0);
  } }) }));
  await page.goto('http://zeile.test/');
  const before = page.getByRole('combobox', { name: 'Before branch' });
  await expect(before).toHaveValue('main'); await before.fill('branch-29'); await before.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-branch-change', 'before:branch-29');
  await page.getByLabel('Comparison kind').selectOption('exact');
  await expect(page.locator('html')).toHaveAttribute('data-kind-change', 'exact');
  await page.evaluate(() => window.postMessage({ type: 'loading', message: 'Comparing branches' }, '*'));
  await expect(page.locator('.mapping-indicator')).toContainText('Building review index');
  await expect(before).toBeEnabled();
  await page.evaluate(() => window.postMessage({ type: 'error', message: 'Missing merge base; choose Exact snapshots.' }, '*'));
  await expect(page.getByRole('alert')).toContainText('Missing merge base');
  await expect(page.locator('.mapping-indicator')).toHaveCount(0);
  expect(errors).toEqual([]);
});
