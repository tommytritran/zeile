import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { git } from '../src/git';
import { analyzeRepository } from '../src/analyze';
import { latestComparison, listRevisions, listBranches, resolveComparison, refreshComparison } from '../src/revisions';

it('reads immutable snapshots without changing the dirty working tree', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'zeile-fixture-'));
  try {
    await git(repo, ['init']);
    await writeFile(join(repo, 'app.ts'), 'export function value() { return 1; }');
    await git(repo, ['add', '--', 'app.ts']);
    const commit = () => git(repo, ['-c', 'user.name=Zeile Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture']);
    await commit();
    expect(await latestComparison(repo)).toBeUndefined();
    await git(repo, ['branch', 'review-base']);
    await writeFile(join(repo, 'app.ts'), 'export function value() { return 2; }');
    await git(repo, ['add', '--', 'app.ts']); await commit();
    const revisions = await listRevisions(repo);
    const branches = await listBranches(repo);
    expect(branches.find(branch => branch.label === 'review-base')).toEqual({ ref: 'refs/heads/review-base', label: 'review-base', group: 'Local branches' });
    expect(branches.every(branch => branch.ref.startsWith('refs/heads/') || branch.ref.startsWith('refs/remotes/'))).toBe(true);
    expect(revisions.find(r => r.label === 'review-base')?.ref).toBe('refs/heads/review-base');
    expect(revisions.filter(r => r.group === 'Recent commits on current history')).toHaveLength(2);
    const latest = await latestComparison(repo);
    expect(latest?.headLabel).toBe('Latest commit');
    const selected = await resolveComparison(repo, { ref: 'review-base', label: 'review-base' }, { ref: 'HEAD', label: 'Current commit' });
    expect(selected.base).toBe(latest?.base);
    expect(selected.head).toBe(latest?.head);
    expect(await refreshComparison(repo, undefined)).toEqual(latest);
    const misleadingLabel = { ...selected, headLabel: 'Latest commit' };
    expect(await refreshComparison(repo, misleadingLabel)).toEqual(misleadingLabel);
    expect(await refreshComparison(repo, latest)).toEqual(latest);
    await expect(resolveComparison(repo, { ref: 'HEAD', label: 'HEAD' }, { ref: 'HEAD', label: 'HEAD' })).rejects.toThrow('same commit');
    await writeFile(join(repo, 'app.ts'), 'export function value() { return 999; }');
    const beforeStatus = await git(repo, ['status', '--porcelain']);
    const graph = await analyzeRepository(repo, 'HEAD~1', 'HEAD');
    expect(graph.nodes.find(n => n.name === 'value')?.before?.code).toContain('return 1');
    expect(graph.nodes.find(n => n.name === 'value')?.after?.code).toContain('return 2');
    expect(await git(repo, ['status', '--porcelain'])).toBe(beforeStatus);
  } finally { await rm(repo, { recursive: true, force: true }); }
}, 30000);
