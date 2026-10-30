import { expect, test } from '@playwright/test';

test('local checkpoint controls preserve the full PR and label incremental inventory honestly', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { acquireVsCodeApi: () => ({ postMessage: (message: { type: string; base?: string; head?: string; token?: number }) => {
      if (message.type === 'saveCheckpoint' || message.type === 'clearCheckpoint') {
        document.documentElement.dataset.checkpointRequest = JSON.stringify(message);
        window.postMessage({ type: 'checkpoint', base: message.base, head: message.head, token: message.token, view: {
          files: [], ...(message.type === 'saveCheckpoint' ? { checkpoint: { version: 1, base: message.base, head: message.head, savedAt: '2026-01-01T12:00:00.000Z' } } : {})
        } }, '*');
      }
    } }) });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Building review index' })).toBeVisible();
  const graph = { repository: 'fixture', base: 'a'.repeat(40), head: 'b'.repeat(40), baseLabel: 'main', headLabel: 'feature', nodes: [], edges: [], warnings: [], unresolvedCalls: 0,
    files: [{ path: 'app.ts', status: 'M', represented: false }], fileSources: { 'app.ts': { before: { path: 'app.ts', line: 1, code: 'old', signature: '' }, after: { path: 'app.ts', line: 1, code: 'new', signature: '' } } } };
  await page.evaluate(graph => {
    window.postMessage({ type: 'graph', graph, token: 1 }, '*');
    window.postMessage({ type: 'checkpoint', base: graph.base, head: graph.head, token: 1, view: { files: [] } }, '*');
  }, graph);
  const panel = page.getByRole('region', { name: 'Local review checkpoint' });
  await panel.getByRole('button', { name: 'Save checkpoint', exact: true }).click();
  await expect(panel).toContainText('No file differences');
  await expect(panel).toContainText('not a reviewed, approved, or verified status');
  await expect(page.locator('html')).toHaveAttribute('data-checkpoint-request', JSON.stringify({ type: 'saveCheckpoint', base: graph.base, head: graph.head, token: 1 }));
  const next = { ...graph, head: 'c'.repeat(40) };
  await page.evaluate(({ graph, next }) => {
    window.postMessage({ type: 'graph', graph: next, token: 2 }, '*');
    window.postMessage({ type: 'checkpoint', base: next.base, head: next.head, token: 2, view: {
      checkpoint: { version: 1, base: graph.base, head: graph.head, savedAt: '2026-01-01T12:00:00.000Z' },
      files: [{ path: 'app.ts', status: 'M', represented: false }, { path: 'reverted.ts', status: 'D', represented: false }]
    } }, '*');
  }, { graph, next });
  await expect(panel).toContainText('2 files changed since checkpoint');
  await expect(panel).toContainText('reverted.ts');
  await expect(panel).toContainText('Not in the current PR inventory');
  await expect(page.locator('.overview-card')).toHaveCount(1);
  await expect(page.locator('.file-item')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Read full PR comparison' }).click();
  await expect(page.locator('.reading-heading')).toContainText('COMPLETE FILE COMPARISON');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.evaluate(next => window.postMessage({ type: 'checkpoint', base: next.base, head: next.head, token: 2, view: { files: [], unavailable: 'The comparison baseline changed. Replace the checkpoint to start again.' } }, '*'), next);
  await expect(panel).toContainText('baseline changed');
  await expect(page.locator('.overview-card')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Clear checkpoint' }).click();
  await expect(panel).toContainText('Save a checkpoint now');
  // Late messages for a previous graph cannot restore an old checkpoint.
  await page.evaluate(next => window.postMessage({ type: 'checkpoint', base: next.base, head: next.head, token: 1, view: { files: [], unavailable: 'STALE RESPONSE' } }, '*'), next);
  await expect(panel).not.toContainText('STALE RESPONSE');
});
