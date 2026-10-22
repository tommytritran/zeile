import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test.beforeEach(async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await expect(page.locator('.function-card')).toHaveCount(2);
  // Legacy canvas interactions exercise an explicitly expanded neighborhood.
  await page.locator('.queue-item').filter({ hasText: 'submitOrder' }).click();
  await page.getByRole('button', { name: 'Show dependencies (2)', exact: true }).click();
  await page.getByRole('button', { name: 'Close implementation' }).click();
  await expect(page.locator('.function-card')).toHaveCount(3);
});

test('focused queue starts with changed code and reveals source neighbors on demand', async ({ page }) => {
  await page.getByRole('button', { name: 'Reset exploration', exact: true }).click();
  await expect(page.locator('.function-card')).toHaveCount(2);
  await expect(page.locator('.queue-item')).toHaveCount(2);
  await expect(page.locator('.queue-count')).toContainText('2 shown / 2 changed nodes');
  await page.locator('.queue-item').filter({ hasText: 'submitOrder' }).click();
  await expect(page.locator('.inspector h2')).toHaveText('submitOrder');
  await page.getByRole('button', { name: 'Show dependencies (2)', exact: true }).click();
  await expect(page.locator('.function-card')).toHaveCount(3);
  await expect(page.locator('.exploration-status')).toContainText('1 dependencies revealed · 1 already shown');
  await page.getByRole('button', { name: 'Show dependencies (2)', exact: true }).click();
  await expect(page.locator('.function-card')).toHaveCount(3);
  await expect(page.locator('.exploration-status')).toContainText('0 dependencies revealed · 2 already shown');
  await page.getByRole('button', { name: 'Reset exploration', exact: true }).click();
  await expect(page.locator('.function-card')).toHaveCount(2);
  await page.locator('.queue-item').filter({ hasText: 'charge' }).click();
  await page.getByRole('button', { name: 'Show callers (1)', exact: true }).click();
  await expect(page.locator('.exploration-status')).toContainText('0 callers revealed · 1 already shown');
});

test('review queue resizes and expanded implementation follows its width', async ({ page }) => {
  const panel = page.locator('.queue-panel');
  const handle = page.getByRole('button', { name: 'Resize review queue', exact: true });
  const original = (await panel.boundingBox())!.width;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 104, box.y + 80, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(original + 100);
  await handle.focus();
  await handle.press('ArrowLeft');
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(original + 80);
  await page.locator('.queue-item').filter({ hasText: 'submitOrder' }).click();
  await page.getByRole('button', { name: 'Expand inspector', exact: true }).click();
  const rail = (await panel.boundingBox())!;
  expect((await page.locator('.inspector').boundingBox())!.x).toBe(rail.x + rail.width);
  await handle.press('Home');
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(original);
  await page.getByRole('button', { name: 'Reduce inspector', exact: true }).click();
  await handle.press('Shift+ArrowRight');
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(original + 80);
  await handle.dblclick({ position: { x: 4, y: 80 } });
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(original);
});

test('implementation panel resizes by drag and keyboard and retains width across functions', async ({ page }) => {
  await page.locator('.queue-item').filter({ hasText: 'submitOrder' }).click();
  const panel = page.locator('.inspector');
  const handle = page.getByRole('button', { name: 'Resize implementation panel', exact: true });
  const original = (await panel.boundingBox())!.width;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x - 116, box.y + 80, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(original + 90);
  const dragged = (await panel.boundingBox())!.width;
  await page.locator('.queue-item').filter({ hasText: 'charge' }).click();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(dragged);
  await handle.focus();
  await handle.press('ArrowRight');
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(dragged - 20);
  await page.getByRole('button', { name: 'Expand inspector', exact: true }).click();
  await expect(handle).toHaveCount(0);
  await page.getByRole('button', { name: 'Reduce inspector', exact: true }).click();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(dragged - 20);
  await handle.press('Home');
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(original);
});

test('queue filters test/generated code and retains the full inventory and explicit exploration', async ({ page }) => {
  await page.evaluate(() => {
    const version = (path: string) => ({ path, line: 1, code: 'function example() { return 1; }', signature: '()' });
    const paths = ['src/app.ts', 'src/app.test.ts', 'generated/client.ts'];
    window.postMessage({ type: 'graph', graph: { repository: 'focus-fixture', base: 'a', head: 'b', baseLabel: 'main', headLabel: 'feature', warnings: [], unresolvedCalls: 0,
      files: [...paths.map(path => ({ path, status: 'M', represented: true })), { path: 'README.md', status: 'M', represented: false }],
      nodes: paths.map((file, index) => ({ id: `focus-${index}`, name: ['app', 'testCase', 'generatedClient'][index], file, kind: 'function', status: 'modified', before: version(file), after: version(file) })),
      edges: [{ id: 'test-call', source: 'focus-1', target: 'focus-0', revision: 'both', kind: 'resolved', label: 'source reference' }]
    } }, '*');
  });
  await expect(page.locator('.function-card')).toHaveCount(1);
  await expect(page.locator('.queue-count')).toHaveText('1 shown / 3 changed nodes');
  await page.getByRole('checkbox', { name: 'Tests (1)', exact: true }).check();
  await expect(page.locator('.function-card')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Generated (1)', exact: true }).check();
  await expect(page.locator('.function-card')).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Tests (1)', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Generated (1)', exact: true }).uncheck();
  await expect(page.locator('.function-card')).toHaveCount(1);
  await page.locator('.queue-item').filter({ hasText: 'app' }).click();
  await page.getByRole('button', { name: 'Show callers (1)', exact: true }).click();
  await expect(page.locator('.function-card')).toHaveCount(2);
  await expect(page.locator('.queue-count')).toHaveText('1 shown / 3 changed nodes');
  await page.getByRole('button', { name: 'Exclusions', exact: true }).click();
  await page.getByLabel('Excluded file names / paths').fill('.test.');
  await page.getByRole('button', { name: 'Apply exclusions' }).click();
  await expect(page.locator('.function-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show callers (1)', exact: true }).click();
  await expect(page.locator('.function-card')).toHaveCount(1);
  await expect(page.locator('.exploration-status')).toContainText('1 excluded');
  await page.locator('.queue-inventory summary').click();
  await expect(page.locator('.file-item')).toHaveCount(4);
  await page.locator('.file-item').filter({ hasText: 'README.md' }).click();
  await expect(page.getByRole('dialog', { name: 'Analysis scope' })).toContainText('README.md');
});

test('revealing helpers in reverse order preserves existing positions without overlap', async ({ page }) => {
  await page.evaluate(() => {
    const nodes = [
      { id: 'change-a', name: 'changeA', file: 'changes.ts', status: 'modified' },
      { id: 'change-b', name: 'changeB', file: 'changes.ts', status: 'modified' },
      { id: 'helper-a', name: 'helperA', file: 'helpers.ts', status: 'context' },
      { id: 'helper-b', name: 'helperB', file: 'helpers.ts', status: 'context' }
    ].map(node => ({ ...node, kind: 'function', after: { path: node.file, line: 1, code: `function ${node.name}() {}`, signature: '()' } }));
    window.postMessage({ type: 'graph', graph: { repository: 'reverse-fixture', base: 'a', head: 'b', baseLabel: 'main', headLabel: 'feature', warnings: [], unresolvedCalls: 0,
      files: [{ path: 'changes.ts', status: 'M', represented: true }], nodes,
      edges: [{ id: 'a', source: 'change-a', target: 'helper-a', revision: 'both', kind: 'resolved', label: 'source reference' }, { id: 'b', source: 'change-b', target: 'helper-b', revision: 'both', kind: 'resolved', label: 'source reference' }]
    } }, '*');
  });
  await page.locator('.queue-item').filter({ hasText: 'changeB' }).click();
  await page.getByRole('button', { name: 'Show dependencies (1)', exact: true }).click();
  const helperB = page.locator('[data-id="helper-b"]');
  await expect(helperB).toHaveCSS('visibility', 'visible');
  const previous = await helperB.evaluate(element => (element as HTMLElement).style.transform);
  await page.locator('.queue-item').filter({ hasText: 'changeA' }).click();
  await page.getByRole('button', { name: 'Show dependencies (1)', exact: true }).click();
  await expect(page.locator('.function-card')).toHaveCount(4);
  await expect.poll(() => helperB.evaluate(element => (element as HTMLElement).style.transform)).toBe(previous);
  const positions = await page.locator('[data-id="helper-a"], [data-id="helper-b"]').evaluateAll(elements => elements.map(element => (element as HTMLElement).style.transform));
  expect(new Set(positions).size).toBe(2);
});

test('inspects clean before/after and comparison, and restores notes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.locator('.function-card').filter({ hasText: 'submitOrder' }).click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('.source-content')).toContainText('createIdempotencyKey');
  await page.getByRole('button', { name: 'before', exact: true }).click();
  await expect(page.locator('.source-content')).not.toContainText('createIdempotencyKey');
  await page.getByRole('button', { name: 'compare', exact: true }).click();
  await expect(page.locator('.diff-review .cm-editor')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'diff', exact: true })).toHaveCount(0);
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

test('syntax highlighting is shared by before, after and compare views', async ({ page }) => {
  await page.locator('.function-card').filter({ hasText: 'submitOrder' }).click();
  for (const mode of ['after', 'before', 'compare']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    const editors = page.locator('.source-content .cm-editor');
    await expect(editors).toHaveCount(mode === 'compare' ? 2 : 1);
    for (const editor of await editors.all()) {
      await expect(editor.locator('.cm-content span').filter({ hasText: /^return$/ })).toHaveCSS('color', 'rgb(196, 167, 231)');
      await expect(editor.locator('.cm-content span').filter({ hasText: /^submitOrder$/ })).toHaveCSS('color', 'rgb(130, 207, 255)');
      await expect(editor.locator('.cm-content span').filter({ hasText: /^Order$/ })).toHaveCSS('color', 'rgb(95, 201, 181)');
      await expect(editor.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
    }
  }
  await expect(page.locator('.cm-changedLine').first()).toBeVisible();
});

test('comparison toggles change markers without replacing editors, source or navigation', async ({ page }) => {
  await page.locator('.function-card').filter({ hasText: 'submitOrder' }).click();
  await page.getByRole('button', { name: 'compare', exact: true }).click();
  const toggle = page.getByRole('checkbox', { name: 'Highlight changes', exact: true });
  await expect(toggle).toBeChecked();
  const before = await page.locator('.cm-merge-a .cm-content').innerText();
  const after = await page.locator('.cm-merge-b .cm-content').innerText();
  await page.locator('.cm-editor.cm-merge-a').evaluate(element => { element.setAttribute('data-same-editor', 'yes'); });
  await page.getByRole('button', { name: 'Next change', exact: true }).click();
  const navigation = await page.locator('.diff-navigation output').innerText();
  await toggle.uncheck();
  await expect(page.locator('.cm-changedText')).toHaveCount(0);
  await expect(page.locator('.cm-changeGutter')).toHaveCount(0);
  await expect(page.locator('.cm-changedLine').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.cm-editor.cm-merge-a')).toHaveAttribute('data-same-editor', 'yes');
  await expect(page.locator('.cm-merge-a .cm-content')).toHaveText(before, { useInnerText: true });
  await expect(page.locator('.cm-merge-b .cm-content')).toHaveText(after, { useInnerText: true });
  await expect(page.locator('.diff-navigation output')).toHaveText(navigation);
  await expect(page.locator('.cm-merge-b .cm-content span').filter({ hasText: /^return$/ })).toHaveCSS('color', 'rgb(196, 167, 231)');
  await toggle.check();
  await expect(page.locator('.cm-changedText').first()).toBeVisible();
  await expect(page.locator('.cm-changeGutter')).toHaveCount(2);
  await expect(page.locator('.cm-editor.cm-merge-a')).toHaveAttribute('data-same-editor', 'yes');
});

test('diff separates revisions and emphasizes exact edits with source locations and navigation', async ({ page }) => {
  await page.locator('.function-card').filter({ hasText: 'submitOrder' }).click();
  await page.getByRole('button', { name: 'compare', exact: true }).click();
  await expect(page.locator('.diff-pane-headings')).toContainText('BEFORE · − old text');
  await expect(page.locator('.diff-pane-headings')).toContainText('AFTER · + new text');
  await expect(page.locator('.diff-pane-headings')).toContainText('src/checkout.ts · L4');
  await expect(page.locator('.cm-merge-a .cm-lineNumbers .cm-gutterElement').filter({ hasText: /^4$/ })).toBeVisible();
  await expect(page.locator('.cm-merge-a .cm-content')).not.toContainText('createIdempotencyKey');
  await expect(page.locator('.cm-merge-b .cm-content')).toContainText('createIdempotencyKey');
  const inline = page.locator('.cm-merge-b .cm-changedText').first();
  await expect(inline).toHaveCSS('text-decoration-line', 'underline');
  await expect(inline).toHaveCSS('background-color', 'rgba(95, 201, 181, 0.25)');
  await page.getByRole('button', { name: 'Next change', exact: true }).click();
  await expect(page.locator('.diff-navigation output')).toContainText('1 /');
  await page.getByRole('button', { name: 'Previous change', exact: true }).click();
  await expect(page.locator('.diff-navigation output')).not.toContainText('—');
  await page.getByRole('checkbox', { name: 'Fold unchanged context' }).check();
  await expect(page.locator('.cm-mergeView')).toBeVisible();
  const narrow = await page.locator('.inspector').boundingBox();
  await page.getByRole('button', { name: 'Expand inspector', exact: true }).click();
  await expect(page.locator('.inspector')).toHaveClass(/expanded/);
  const wide = await page.locator('.inspector').boundingBox();
  expect(wide?.width).toBeGreaterThan(narrow?.width ?? 0);
  await page.getByRole('button', { name: 'Reduce inspector', exact: true }).click();
  await expect(page.locator('.inspector')).not.toHaveClass(/expanded/);
});

test('unchanged context has an explicit no-change state in diff', async ({ page }) => {
  await page.locator('.function-card').filter({ hasText: 'saveReceipt' }).click();
  await page.getByRole('button', { name: 'compare', exact: true }).click();
  await expect(page.getByText('No source changes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next change', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Previous change', exact: true })).toBeDisabled();
  await expect(page.locator('.cm-merge-a .cm-lineNumbers .cm-gutterElement').filter({ hasText: /^10$/ })).toBeVisible();
  await expect(page.locator('.cm-merge-b .cm-lineNumbers .cm-gutterElement').filter({ hasText: /^12$/ })).toBeVisible();
});

test('diff navigates separated edits, folds context and handles absent revisions', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    const before = ['function longReview() {', ...Array.from({ length: 45 }, (_, i) => `  const value${i} = ${i};`), '  return value0;', '}'].join('\n');
    const after = before.replace('value1 = 1;', 'value1 = 100;').replace('value40 = 40;', 'value40 = 400;');
    window.postMessage({ type: 'graph', graph: {
      repository: 'diff-fixture', base: 'a', head: 'b', baseLabel: 'main', headLabel: 'feature', warnings: [], unresolvedCalls: 0, edges: [],
      files: [{ path: 'review.ts', status: 'M', represented: true }], nodes: [
        { id: 'long', name: 'longReview', file: 'review.ts', kind: 'function', status: 'modified', before: { path: 'review.ts', line: 20, code: before, signature: '()' }, after: { path: 'review.ts', line: 30, code: after, signature: '()' } },
        { id: 'deleted', name: 'deletedReview', file: 'review.ts', kind: 'function', status: 'removed', before: { path: 'review.ts', line: 80, code: 'function deletedReview() { return 1; }', signature: '()' } },
        { id: 'added', name: 'addedReview', file: 'review.ts', kind: 'function', status: 'added', after: { path: 'review.ts', line: 90, code: 'function addedReview() { return 2; }', signature: '()' } }
      ]
    } }, '*');
  });
  await page.locator('.function-card').filter({ hasText: 'longReview' }).click();
  await page.getByRole('button', { name: 'compare', exact: true }).click();
  await expect(page.locator('.diff-toolbar')).toContainText('2 change regions');
  await page.getByRole('button', { name: 'Previous change', exact: true }).click();
  await expect(page.locator('.diff-navigation output')).toHaveText('2 / 2');
  await page.getByRole('button', { name: 'Next change', exact: true }).click();
  await expect(page.locator('.diff-navigation output')).toHaveText('1 / 2');
  await page.getByRole('checkbox', { name: 'Fold unchanged context' }).check();
  await expect(page.locator('.cm-collapsedLines').first()).toBeVisible();
  await page.getByRole('button', { name: 'Next change', exact: true }).click();
  await expect(page.locator('.diff-navigation output')).toHaveText('1 / 2');
  await page.locator('.function-card').filter({ hasText: 'deletedReview' }).click();
  await expect(page.locator('.source-content')).toContainText('function deletedReview');
  await expect(page.locator('.tabs .selected')).toHaveText('before');
  await page.getByRole('button', { name: 'compare', exact: true }).click();
  await expect(page.locator('.diff-pane-headings > div').nth(1)).toContainText('Not present in this revision');
  await expect(page.locator('.cm-merge-b .cm-content')).toHaveText('');
  await page.getByRole('button', { name: 'Next change', exact: true }).click();
  await expect(page.locator('.diff-navigation output')).toHaveText('1 / 1');
  await page.locator('.function-card').filter({ hasText: 'addedReview' }).click();
  await expect(page.locator('.source-content')).toContainText('function addedReview');
  await page.getByRole('button', { name: 'compare', exact: true }).click();
  await expect(page.locator('.diff-pane-headings > div').nth(0)).toContainText('Not present in this revision');
  await page.getByRole('button', { name: 'Next change', exact: true }).click();
  await expect(page.locator('.diff-navigation output')).toHaveText('1 / 1');
  expect(errors).toEqual([]);
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
  await expect(before).toHaveValue('main');
  await expect(after).toHaveValue('feature');
  await before.fill('develop');
  await page.getByRole('option', { name: 'origin/develop', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-branch-change', 'before:refs/remotes/origin/develop');
  await expect(after).toHaveValue('feature');
  await after.fill('main');
  await after.press('ArrowDown');
  await after.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-branch-change', 'after:refs/heads/main');
  await expect(page.getByRole('button', { name: 'Change comparison…' })).toHaveCount(0);
  await page.locator('.function-card').click();
  await expect(page.locator('.source-content')).toContainText('return 2');
  await expect(page.locator('.cm-content span').filter({ hasText: /^return$/ })).toHaveCSS('color', 'rgb(196, 167, 231)');
  await expect(page.locator('.cm-content span').filter({ hasText: /^2$/ })).toHaveCSS('color', 'rgb(240, 168, 133)');
  await page.evaluate(() => window.postMessage({ type: 'loading', message: 'Comparing selected branches…' }, '*'));
  await expect(page.getByRole('status')).toContainText('Building the review map');
  await expect(page.getByRole('status')).toContainText('Comparing selected branches');
  await expect(page.locator('.mapping-spinner')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('1s elapsed');
  await expect(page.locator('.function-card')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Before branch' })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'After branch' })).toBeEnabled();
  await before.fill('feature');
  await before.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-branch-change', 'before:refs/heads/feature');
  await page.evaluate(() => window.postMessage({ type: 'error', message: 'Could not load selected branch.' }, '*'));
  await expect(page.getByRole('alert')).toContainText('Could not load selected branch');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('.function-card')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Before branch' })).toBeEnabled();
  await page.evaluate(() => window.postMessage({ type: 'branches', selection: { options: [], before: '', after: '' } }, '*'));
  await expect(before).toBeEnabled();
  await expect(before).toHaveValue('main');
  await expect(page.getByRole('button', { name: 'Retry branch list' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('browser demo explains why branch controls cannot be opened', async ({ page }) => {
  await expect(page.getByText('Browser demo — branch selection requires the VS Code extension.', { exact: false })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Before branch' })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'After branch' })).toBeDisabled();
});

test('exclusions preserve inventory, notes and manual connections across hide and restore', async ({ page }) => {
  await page.locator('[data-id="charge"] .react-flow__handle-right').dragTo(page.locator('[data-id="save"] .react-flow__handle-left'));
  await page.locator('[data-id="file:src/payments.ts"] .react-flow__handle-right').dragTo(page.locator('[data-id="file:src/checkout.ts"] .react-flow__handle-left'));
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await page.locator('.function-card').filter({ hasText: 'charge' }).click();
  await page.locator('#note').fill('Retain payment note');
  await page.getByRole('button', { name: 'Exclusions', exact: true }).click();
  await page.getByLabel('Excluded file names / paths').fill('payments');
  await page.getByRole('button', { name: 'Apply exclusions' }).click();
  await expect(page.locator('.function-card')).toHaveCount(2);
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.locator('.queue-inventory summary').click();
  await expect(page.locator('.file-item.excluded')).toContainText('payments.ts');
  await expect(page.locator('.exclusion-notice')).toContainText('1 files · 1 nodes hidden');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('zeile-demo') ?? '{}').manualEdges?.length)).toBe(2);
  await page.reload();
  await expect(page.locator('.function-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Exclusions (1)', exact: true }).click();
  await expect(page.getByLabel('Excluded file names / paths')).toHaveValue('payments');
  await page.getByRole('button', { name: 'Clear list' }).click();
  await page.getByRole('button', { name: 'Apply exclusions' }).click();
  await page.locator('.queue-item').filter({ hasText: 'submitOrder' }).click();
  await page.getByRole('button', { name: 'Show dependencies (2)', exact: true }).click();
  await expect(page.locator('.function-card')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await page.locator('.function-card').filter({ hasText: 'charge' }).click();
  await expect(page.locator('#note')).toHaveValue('Retain payment note');
  await page.getByRole('button', { name: 'Exclusions', exact: true }).click();
  await page.getByLabel('Excluded file names / paths').fill('src/');
  await page.getByRole('button', { name: 'Apply exclusions' }).click();
  await expect(page.locator('.function-card')).toHaveCount(0);
  await expect(page.getByText('No changes in the current focus')).toBeVisible();
});

test('branch search handles many options, no matches, keyboard and cancellation without committing text', async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { acquireVsCodeApi: () => ({ postMessage: (message: { type: string; side?: string; ref?: string }) => {
    if (message.type === 'changeBranch') document.documentElement.dataset.branchChange = `${message.side}:${message.ref}`;
    if (message.type === 'ready') setTimeout(() => window.postMessage({ type: 'branches', selection: { before: 'main', after: 'branch-1', options: [
      { ref: 'main', label: 'main', group: 'Local branches' },
      ...Array.from({ length: 35 }, (_, index) => ({ ref: `branch-${index}`, label: `feature/branch-${index}`, group: 'Local branches' })),
      { ref: 'remote', label: 'origin/review', group: 'Remote branches' }
    ] } }, '*'), 0);
  } }) }));
  await page.reload();
  const before = page.getByRole('combobox', { name: 'Before branch' });
  await expect(before).toHaveValue('main');
  await before.click();
  await expect(page.getByRole('option')).toHaveCount(37);
  await before.fill('BRANCH-34');
  await expect(page.getByRole('option')).toHaveCount(1);
  await before.press('ArrowDown');
  await expect(before).toHaveAttribute('aria-activedescendant', /option-0$/);
  await before.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-branch-change', 'before:branch-34');
  await expect(before).toHaveValue('main');
  await before.fill('nonexistent');
  await expect(page.getByText('No matching branches')).toBeVisible();
  await before.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-branch-change', 'before:branch-34');
  await before.press('Escape');
  await expect(before).toHaveValue('main');
  await expect(before).toHaveAttribute('aria-expanded', 'false');
  await before.fill('review');
  await expect(page.getByRole('group', { name: 'Remote branches' })).toBeVisible();
  await before.press('Tab');
  await expect(before).toHaveValue('main');
  await expect(page.getByRole('combobox', { name: 'After branch' })).toBeFocused();
});
