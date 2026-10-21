import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { git } from '../src/git';
import { analyzeRepository } from '../src/analyze';

it('reads immutable snapshots without changing the dirty working tree', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'zeile-fixture-'));
  try {
    await git(repo, ['init']);
    await writeFile(join(repo, 'app.ts'), 'export function value() { return 1; }');
    await git(repo, ['add', '--', 'app.ts']);
    const commit = () => git(repo, ['-c', 'user.name=Zeile Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture']);
    await commit();
    await writeFile(join(repo, 'app.ts'), 'export function value() { return 2; }');
    await git(repo, ['add', '--', 'app.ts']); await commit();
    await writeFile(join(repo, 'app.ts'), 'export function value() { return 999; }');
    const beforeStatus = await git(repo, ['status', '--porcelain']);
    const graph = await analyzeRepository(repo, 'HEAD~1', 'HEAD');
    expect(graph.nodes.find(n => n.name === 'value')?.before?.code).toContain('return 1');
    expect(graph.nodes.find(n => n.name === 'value')?.after?.code).toContain('return 2');
    expect(await git(repo, ['status', '--porcelain'])).toBe(beforeStatus);
  } finally { await rm(repo, { recursive: true, force: true }); }
}, 30000);
