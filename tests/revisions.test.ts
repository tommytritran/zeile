import { beforeEach, expect, it, vi } from 'vitest';
import type { BranchOption } from '../src/model';
const mocks = vi.hoisted(() => ({ git: vi.fn(), resolve: vi.fn() }));
vi.mock('../src/git', () => ({ git: mocks.git, resolveCommit: mocks.resolve }));
import { defaultBeforeBranch, initialComparison } from '../src/revisions';
const branch = (ref: string): BranchOption => ({ ref, label: ref.replace('refs/heads/', '').replace('refs/remotes/', ''), group: ref.startsWith('refs/heads/') ? 'Local branches' : 'Remote branches' });
beforeEach(() => vi.resetAllMocks());
it('prefers local main, local master, then origin main/master independently of listing order', () => {
  const refs = ['refs/heads/main', 'refs/heads/master', 'refs/remotes/origin/main', 'refs/remotes/origin/master'];
  for (let i = 0; i < refs.length; i++) expect(defaultBeforeBranch(refs.slice(i).reverse().map(branch))?.ref).toBe(refs[i]);
  expect(defaultBeforeBranch([branch('refs/heads/feature/main')])).toBeUndefined();
});
it('compares the default branch exact snapshot against HEAD, including identical tips', async () => {
  mocks.resolve.mockResolvedValue('same-sha');
  expect(await initialComparison('/repo', [branch('refs/heads/master')])).toEqual({ base: 'same-sha', head: 'same-sha', baseLabel: 'master', headLabel: 'Current commit (HEAD)', mode: 'snapshots' });
  expect(mocks.resolve.mock.calls).toEqual([['/repo', 'refs/heads/master'], ['/repo', 'HEAD']]);
  expect(mocks.git).not.toHaveBeenCalled();
});
it('falls back to the previous commit only when no conventional branch exists', async () => {
  mocks.git.mockResolvedValue('head-sha parent-sha');
  expect(await initialComparison('/repo', [])).toMatchObject({ base: 'parent-sha', head: 'head-sha', mode: 'latest' });
  mocks.git.mockResolvedValue('root-sha');
  expect(await initialComparison('/repo', [])).toBeUndefined();
});
