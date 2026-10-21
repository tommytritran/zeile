import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ quick: vi.fn(), input: vi.fn(), warning: vi.fn(), latest: vi.fn(), list: vi.fn(), resolve: vi.fn(), commit: vi.fn() }));
vi.mock('vscode', () => ({ window: { showQuickPick: mocks.quick, showInputBox: mocks.input, showWarningMessage: mocks.warning }, QuickPickItemKind: { Separator: -1 } }));
vi.mock('../src/revisions', () => ({ latestComparison: mocks.latest, listRevisions: mocks.list, resolveComparison: mocks.resolve }));
vi.mock('../src/git', () => ({ resolveCommit: mocks.commit }));
import { pickComparison } from '../src/revision-picker';
const comparison = { base: 'abc1234', head: 'def5678', baseLabel: 'main', headLabel: 'feature' };
beforeEach(() => {
  vi.resetAllMocks(); mocks.latest.mockResolvedValue(comparison);
  mocks.list.mockResolvedValue([{ ref: 'refs/heads/main', label: 'main', group: 'Branches', description: 'Local branch', detail: 'Committed snapshot' }]);
  mocks.resolve.mockResolvedValue(comparison);
});
describe('guided comparison picker', () => {
  it('opens latest commit without requiring Git syntax', async () => {
    mocks.quick.mockResolvedValueOnce({ mode: 'latest' });
    expect(await pickComparison('/repo')).toEqual(comparison);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('picks Before and After and confirms their direction', async () => {
    mocks.quick.mockResolvedValueOnce({ mode: 'choose' }).mockResolvedValueOnce({ ref: 'refs/heads/main', label: 'main' }).mockResolvedValueOnce({ ref: 'HEAD', label: 'Current checked-out commit' }).mockResolvedValueOnce({ action: 'open' });
    expect(await pickComparison('/repo')).toEqual(comparison);
    expect(mocks.resolve).toHaveBeenCalledWith('/repo', { ref: 'refs/heads/main', label: 'main' }, { ref: 'HEAD', label: 'Current checked-out commit' });
    expect(mocks.quick.mock.calls[1][1].title).toContain('Before');
    expect(mocks.quick.mock.calls[2][1].title).toContain('After');
    expect(mocks.quick.mock.calls[3][1].title).toContain('Confirm');
  });
  it.each([0, 1, 2, 3])('cancellation at step %i leaves the comparison unchanged', async step => {
    const responses = [{ mode: 'choose' }, { ref: 'main', label: 'main' }, { ref: 'HEAD', label: 'latest' }, { action: 'open' }];
    for (let i = 0; i <= step; i++) mocks.quick.mockResolvedValueOnce(i === step ? undefined : responses[i]);
    expect(await pickComparison('/repo')).toBeUndefined();
  });
  it('rejects identical versions and lets the user choose again', async () => {
    mocks.resolve.mockRejectedValueOnce(new Error('These choices point to the same commit.'));
    mocks.quick.mockResolvedValueOnce({ mode: 'choose' }).mockResolvedValueOnce({ ref: 'main', label: 'main' }).mockResolvedValueOnce({ ref: 'main', label: 'main' }).mockResolvedValueOnce(undefined);
    expect(await pickComparison('/repo')).toBeUndefined();
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('same commit'));
  });
  it('validates advanced input and allows canceling it', async () => {
    mocks.quick.mockResolvedValueOnce({ mode: 'choose' }).mockResolvedValueOnce({ action: 'manual' });
    mocks.input.mockResolvedValueOnce(undefined);
    expect(await pickComparison('/repo')).toBeUndefined();
    const validate = mocks.input.mock.calls[0][0].validateInput;
    mocks.commit.mockRejectedValueOnce(new Error('unknown'));
    expect(await validate('missing')).toContain('No commit found');
    mocks.commit.mockResolvedValueOnce('abc');
    expect(await validate('main')).toBeUndefined();
  });
  it('does not offer latest commit for a root commit', async () => {
    mocks.latest.mockResolvedValueOnce(undefined); mocks.quick.mockResolvedValueOnce(undefined);
    await pickComparison('/repo');
    expect(mocks.quick.mock.calls[0][0]).toHaveLength(1);
  });
});
