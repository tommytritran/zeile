import { beforeEach, expect, it, vi } from 'vitest';
import { checkpointBaseline, checkpointScope, validCheckpoint } from '../src/checkpoint';
import { checkpointAfterRef, checkpointChanges } from '../src/checkpoint-git';
import type { ReviewGraph } from '../src/model';

const mocks = vi.hoisted(() => ({ git: vi.fn(), changedFiles: vi.fn() }));
vi.mock('../src/git', () => mocks);
const graph: ReviewGraph = { repository: 'repo', base: 'a'.repeat(40), head: 'b'.repeat(40), baseLabel: 'main', headLabel: 'feature', nodes: [], edges: [], files: [], warnings: [], unresolvedCalls: 0 };
beforeEach(() => vi.resetAllMocks());

it('persists only versioned commit metadata and a timestamp', () => {
  const checkpoint = checkpointBaseline(graph);
  expect(validCheckpoint(checkpoint)).toBe(true);
  expect(Object.keys(checkpoint).sort()).toEqual(['base', 'head', 'savedAt', 'version']);
  for (const value of [null, {}, { ...checkpoint, version: 2 }, { ...checkpoint, head: '--option' }, { ...checkpoint, savedAt: 'bad date' }]) expect(validCheckpoint(value)).toBe(false);
});

it('scopes identity by repository, branches and comparison kind, not the moving head', () => {
  const scope = checkpointScope('/repo', 'main', 'feature', 'pr');
  expect(scope).not.toBe(checkpointScope('/other', 'main', 'feature', 'pr'));
  expect(scope).not.toBe(checkpointScope('/repo', 'main', 'other', 'pr'));
  expect(scope).not.toBe(checkpointScope('/repo', 'main', 'feature', 'exact'));
});

it('resolves HEAD to a branch identity and isolates detached heads', async () => {
  mocks.git.mockResolvedValueOnce('refs/heads/feature\n');
  expect(await checkpointAfterRef('/repo', 'HEAD', graph.head)).toBe('refs/heads/feature');
  mocks.git.mockRejectedValueOnce(new Error('detached'));
  expect(await checkpointAfterRef('/repo', 'HEAD', graph.head)).toBe(graph.head);
  expect(await checkpointAfterRef('/repo', 'refs/heads/other', graph.head)).toBe('refs/heads/other');
});

it('returns no delta for identical heads and refuses a changed base', async () => {
  const checkpoint = checkpointBaseline(graph);
  expect(await checkpointChanges('/repo', checkpoint, graph)).toEqual({ checkpoint, files: [] });
  expect((await checkpointChanges('/repo', checkpoint, { ...graph, base: 'c'.repeat(40) })).unavailable).toContain('baseline changed');
  expect(mocks.git).not.toHaveBeenCalled();
});

it('retains renames, deletions and files outside the current PR inventory', async () => {
  const checkpoint = checkpointBaseline(graph);
  const files = [{ path: 'new.ts', oldPath: 'old.ts', status: 'R100', represented: false }, { path: 'reverted.ts', status: 'D', represented: false }];
  mocks.git.mockResolvedValue(''); mocks.changedFiles.mockResolvedValue(files);
  const current = { ...graph, head: 'c'.repeat(40) };
  expect(await checkpointChanges('/repo', checkpoint, current)).toEqual({ checkpoint, files });
  expect(mocks.git).toHaveBeenCalledWith('/repo', ['merge-base', '--is-ancestor', graph.head, current.head]);
  expect(mocks.changedFiles).toHaveBeenCalledWith('/repo', graph.head, current.head);
});

it('never substitutes a PR diff when history is rewritten, missing or unreadable', async () => {
  mocks.git.mockRejectedValue(new Error('missing or nonancestor'));
  const result = await checkpointChanges('/repo', checkpointBaseline(graph), { ...graph, head: 'c'.repeat(40) });
  expect(result.unavailable).toContain('history was rewritten');
  expect(result.files).toEqual([]);
  expect(mocks.changedFiles).not.toHaveBeenCalled();
});
