import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { git } from '../src/git';
import { analyzeRepository } from '../src/analyze';
import { checkpointChanges, checkpointAfterRef } from '../src/checkpoint-git';
import { checkpointBaseline } from '../src/checkpoint';
import { latestComparison, initialComparison, listRevisions, listBranches, resolveComparison, refreshComparison } from '../src/revisions';

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
    const checkpoint = checkpointBaseline({ ...graph, head: graph.base });
    expect((await checkpointChanges(repo, checkpoint, graph)).files).toEqual([{ path: 'app.ts', status: 'M', represented: false }]);
    expect(await checkpointAfterRef(repo, 'HEAD', graph.head)).toMatch(/^refs\/heads\//);
    expect((await checkpointChanges(repo, { ...checkpoint, head: 'f'.repeat(40) }, graph)).unavailable).toContain('saved commit is missing');
    expect(graph.nodes.find(n => n.name === 'value')?.before?.code).toContain('return 1');
    expect(graph.nodes.find(n => n.name === 'value')?.after?.code).toContain('return 2');
    expect(await git(repo, ['status', '--porcelain'])).toBe(beforeStatus);
  } finally { await rm(repo, { recursive: true, force: true }); }
}, 30000);

it('omits target-only changes in PR mode but includes them in exact mode on divergent histories', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'zeile-divergent-'));
  try {
    await git(repo, ['init', '--initial-branch=main']);
    const commit = () => git(repo, ['-c', 'user.name=Zeile Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture']);
    await writeFile(join(repo, 'app.ts'), 'export function value() { return 1; }');
    await git(repo, ['add', '--', 'app.ts']); await commit();
    const ancestor = (await git(repo, ['rev-parse', 'HEAD'])).trim();
    await git(repo, ['branch', 'feature']);
    await writeFile(join(repo, 'target-only.ts'), 'export function targetOnly() {}');
    await git(repo, ['add', '--', 'target-only.ts']); await commit();
    const target = (await git(repo, ['rev-parse', 'HEAD'])).trim();
    await git(repo, ['checkout', 'feature']);
    await writeFile(join(repo, 'app.ts'), 'export function value() { return 2; }');
    await writeFile(join(repo, 'guide.md'), '# Feature\nCommitted documentation\n');
    await git(repo, ['add', '--', 'app.ts', 'guide.md']); await commit();
    await writeFile(join(repo, 'guide.md'), 'Dirty documentation must not be read');
    const status = await git(repo, ['status', '--porcelain']);
    const pr = await initialComparison(repo, await listBranches(repo));
    expect(pr).toMatchObject({ base: ancestor, target, mergeBase: ancestor, kind: 'pr' });
    const exact = await resolveComparison(repo, { ref: 'main', label: 'main' }, { ref: 'HEAD', label: 'HEAD' }, false, 'exact');
    const prGraph = await analyzeRepository(repo, pr!.base, pr!.head);
    const exactGraph = await analyzeRepository(repo, exact.base, exact.head);
    expect(prGraph.files.map(file => file.path)).toEqual(['app.ts', 'guide.md']);
    expect(prGraph.metadata?.churn).toEqual([{ path: 'app.ts', added: 1, deleted: 1 }, { path: 'guide.md', added: 2, deleted: 0 }]);
    expect(prGraph.metadata?.commits?.total).toBe(1);
    expect(prGraph.metadata?.commits?.recent[0].author).toBe('Zeile Test');
    expect(prGraph.metadata?.unavailable).toEqual([]);
    expect(exactGraph.files.find(file => file.path === 'target-only.ts')?.status).toBe('D');
    expect(prGraph.fileSources?.['guide.md'].after).toMatchObject({ path: 'guide.md', line: 1, code: '# Feature\nCommitted documentation\n' });
    expect(prGraph.fileSources?.['guide.md'].before).toBeUndefined();
    expect(prGraph.files.find(file => file.path === 'guide.md')?.represented).toBe(false);
    expect(await git(repo, ['status', '--porcelain'])).toBe(status);
  } finally { await rm(repo, { recursive: true, force: true }); }
}, 30000);

it('reads bounded safe changed files with immutable rename/delete paths and unavailable reasons', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'zeile-sources-'));
  try {
    await git(repo, ['init']);
    const commit = () => git(repo, ['-c', 'user.name=Zeile Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture']);
    await writeFile(join(repo, 'old.md'), '# Preserved source\n'.repeat(20));
    await writeFile(join(repo, 'deleted.sql'), 'SELECT 1;');
    await git(repo, ['add', '--', '.']); await commit();
    await git(repo, ['mv', 'old.md', 'new.md']);
    await git(repo, ['rm', 'deleted.sql']);
    await writeFile(join(repo, 'large.md'), 'a'.repeat(512001));
    await writeFile(join(repo, 'binary.json'), '\0binary');
    await writeFile(join(repo, '.env.json'), '{"password":"secret"}');
    await writeFile(join(repo, 'token.json'), '{"value":"secret"}');
    await writeFile(join(repo, 'package-lock.json'), '{}');
    await writeFile(join(repo, 'image.svg'), '<svg/>');
    await writeFile(join(repo, 'data.yaml'), 'safe: true');
    await writeFile(join(repo, 'auth.ts'), 'export function authorize() { return true; }');
    await git(repo, ['add', '--', '.']); await commit();
    const graph = await analyzeRepository(repo, 'HEAD~1', 'HEAD');
    expect(graph.fileSources?.['new.md'].before?.path).toBe('old.md');
    expect(graph.fileSources?.['new.md'].after?.path).toBe('new.md');
    expect(graph.fileSources?.['deleted.sql'].before?.code).toBe('SELECT 1;');
    expect(graph.fileSources?.['deleted.sql'].after).toBeUndefined();
    expect(graph.fileSources?.['data.yaml'].after?.code).toBe('safe: true');
    expect(graph.fileSources?.['auth.ts'].after?.code).toContain('function authorize');
    for (const path of ['large.md', 'binary.json', '.env.json', 'token.json', 'package-lock.json', 'image.svg']) {
      expect(graph.fileSources?.[path].unavailable).toBeTruthy();
      expect(graph.fileSources?.[path].after).toBeUndefined();
    }
    expect(graph.fileSources?.['large.md'].unavailable).toContain('500 KB');
    expect(graph.fileSources?.['binary.json'].unavailable).toContain('binary');
  } finally { await rm(repo, { recursive: true, force: true }); }
}, 30000);
