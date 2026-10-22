import { _electron, expect } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const temp = await mkdtemp(join(tmpdir(), 'zeile-host-'));
const git = (...args) => execFileSync('git', args, { cwd: temp, env: { ...process.env, GIT_MASTER: '1' } });
let app;
try {
  git('init', '--initial-branch=main');
  await writeFile(join(temp, 'app.ts'), 'export function value() { return 1; }');
  git('add', 'app.ts');
  const commit = () => git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture');
  commit();
  await writeFile(join(temp, 'app.ts'), 'export function value() { return 2; }');
  git('add', 'app.ts'); commit(); git('branch', 'review-base', 'HEAD~1');
  app = await _electron.launch({ executablePath: '/Applications/Visual Studio Code.app/Contents/MacOS/Code', args: ['--no-sandbox', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', `--user-data-dir=${join(temp, 'user')}`, `--extensions-dir=${join(temp, 'extensions')}`, `--extensionDevelopmentPath=${resolve('.')}`, temp], timeout: 60000 });
  const page = await app.firstWindow();
  page.on('console', msg => { if (/zeile|error|security/i.test(msg.text())) console.log(msg.type(), msg.text()); });
  await page.waitForTimeout(5000);
  await page.keyboard.press('Meta+Shift+P');
  await page.keyboard.type('Zeile: Open Review Map');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(8000);
  let verified = false;
  for (const frame of page.frames()) {
    const text = await frame.locator('body').innerText().catch(() => '');
    if (/MAPPING YOUR|Before|REVIEW MAP/.test(text)) {
      console.log('FRAME', frame.url(), text.slice(0, 3500));
      const before = frame.getByRole('combobox', { name: 'Before branch' });
      if (await before.count()) {
        if (await before.isDisabled()) throw new Error('Before branch selector is disabled in real VS Code.');
        await expect(before).toHaveValue('main');
        await before.fill('review-base');
        await frame.getByRole('option', { name: 'review-base', exact: true }).click();
        await frame.locator('.function-card').waitFor({ timeout: 30000 });
        await expect(before).toHaveValue('review-base', { timeout: 30000 });
        const after = frame.getByRole('combobox', { name: 'After branch' });
        if (await after.isDisabled()) throw new Error('After branch selector is disabled.');
        verified = true;
        console.log('PASS: real VS Code host loaded branches, mapped Git snapshots, and accepted branch selection.');
      }
    }
  }
  if (!verified) throw new Error('Zeile webview did not initialize in the real VS Code host.');
} finally { if (app) await app.close(); await rm(temp, { recursive: true, force: true }); }
