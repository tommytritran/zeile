import { beforeEach, expect, it, vi } from 'vitest';
import type { BranchOption } from '../src/model';
const mocks = vi.hoisted(() => ({ git: vi.fn(), resolve: vi.fn() }));
vi.mock('../src/git', () => ({ git: mocks.git, resolveCommit: mocks.resolve }));
import { defaultBeforeBranch, initialComparison, resolveComparison } from '../src/revisions';
const branch = (ref: string): BranchOption => ({ ref, label: ref.replace('refs/heads/', '').replace('refs/remotes/', ''), group: ref.startsWith('refs/heads/') ? 'Local branches' : 'Remote branches' });
beforeEach(() => vi.resetAllMocks());
it('prefers remote-tracking targets before local branches independently of listing order', () => {
  const refs = ['refs/remotes/origin/main', 'refs/remotes/origin/master', 'refs/heads/main', 'refs/heads/master'];
  for (let i = 0; i < refs.length; i++) expect(defaultBeforeBranch(refs.slice(i).reverse().map(branch))?.ref).toBe(refs[i]);
  expect(defaultBeforeBranch([branch('refs/heads/feature/main')])).toBeUndefined();
});
it('compares the default branch merge base against HEAD, including identical tips', async () => {
  mocks.resolve.mockResolvedValue('same-sha');
  mocks.git.mockResolvedValue('same-sha\n');
  expect(await initialComparison('/repo', [branch('refs/heads/master')])).toEqual({ base: 'same-sha', target: 'same-sha', mergeBase: 'same-sha', kind: 'pr', head: 'same-sha', baseLabel: 'master (merge-base)', headLabel: 'Current commit (HEAD)', mode: 'snapshots' });
  expect(mocks.resolve.mock.calls).toEqual([['/repo', 'refs/heads/master'], ['/repo', 'HEAD']]);
  expect(mocks.git).toHaveBeenCalledWith('/repo', ['merge-base', '--all', 'same-sha', 'same-sha']);
});
it('keeps the target tip separate from the effective PR base and permits explicit exact comparison', async () => {
  mocks.resolve.mockImplementation((_repo, ref) => Promise.resolve(ref === 'main' ? 'target' : 'head'));
  mocks.git.mockResolvedValue('ancestor\n');
  const before = { ref: 'main', label: 'main' }, after = { ref: 'HEAD', label: 'HEAD' };
  expect(await resolveComparison('/repo', before, after)).toMatchObject({ base: 'ancestor', target: 'target', mergeBase: 'ancestor', kind: 'pr' });
  mocks.git.mockClear();
  const exact = await resolveComparison('/repo', before, after, false, 'exact');
  expect(exact).toMatchObject({ base: 'target', target: 'target', kind: 'exact', baseLabel: 'main' });
  expect(exact.mergeBase).toBeUndefined();
  expect(mocks.git).not.toHaveBeenCalled();
});
it('rejects missing and ambiguous merge bases without an exact fallback', async () => {
  mocks.resolve.mockImplementation((_repo, ref) => Promise.resolve(ref));
  const before = { ref: 'main', label: 'main' }, after = { ref: 'HEAD', label: 'HEAD' };
  mocks.git.mockRejectedValueOnce(new Error('unrelated history'));
  await expect(resolveComparison('/repo', before, after)).rejects.toThrow('No merge base');
  for (const output of ['', 'first\nsecond\n']) {
    mocks.git.mockResolvedValueOnce(output);
    await expect(resolveComparison('/repo', before, after)).rejects.toThrow('unique merge base');
  }
});
it('retains unrelated Git failure reasons in actionable merge-base errors', async () => {
  mocks.resolve.mockImplementation((_repo, ref) => Promise.resolve(ref));
  mocks.git.mockRejectedValueOnce(new Error('fatal: permission denied reading commit objects'));
  await expect(resolveComparison('/repo', { ref: 'main', label: 'main' }, { ref: 'HEAD', label: 'HEAD' })).rejects.toThrow('permission denied reading commit objects');
});
it('rejects manually selected identical target tips in either kind by default', async () => {
  mocks.resolve.mockResolvedValue('same');
  const choice = { ref: 'HEAD', label: 'HEAD' };
  await expect(resolveComparison('/repo', choice, choice)).rejects.toThrow('same commit');
  await expect(resolveComparison('/repo', choice, choice, false, 'exact')).rejects.toThrow('same commit');
  expect(mocks.git).not.toHaveBeenCalled();
});
it('falls back to the previous commit only when no conventional branch exists', async () => {
  mocks.git.mockResolvedValue('head-sha parent-sha');
  expect(await initialComparison('/repo', [])).toMatchObject({ base: 'parent-sha', head: 'head-sha', mode: 'latest' });
  mocks.git.mockResolvedValue('root-sha');
  expect(await initialComparison('/repo', [])).toBeUndefined();
});
