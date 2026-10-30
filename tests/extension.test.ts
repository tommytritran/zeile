import { beforeEach, expect, it, vi } from 'vitest';
import type { ReviewGraph, ToWebview } from '../src/model';

const mocks = vi.hoisted(() => ({
  git: vi.fn(), initial: vi.fn(), latest: vi.fn(), branches: vi.fn(), resolve: vi.fn(),
  saved: new Map<string, unknown>(), update: vi.fn(),
  command: undefined as (() => Promise<void>) | undefined,
  receive: undefined as ((message: unknown) => Promise<void>) | undefined,
  dispose: undefined as (() => void) | undefined,
  messages: [] as ToWebview[],
  workers: [] as { data: unknown; emit: (graph: ReviewGraph) => void }[]
}));
vi.mock('../src/git', () => ({ git: mocks.git }));
vi.mock('../src/revisions', () => ({
  initialComparison: mocks.initial, latestComparison: mocks.latest, listBranches: mocks.branches,
  resolveComparison: mocks.resolve, defaultBeforeBranch: (branches: unknown[]) => branches[0]
}));
vi.mock('node:worker_threads', () => ({
  Worker: class {
    private message?: (result: { graph: ReviewGraph }) => void;
    constructor(_path: string, options: { workerData: unknown }) {
      mocks.workers.push({ data: options.workerData, emit: graph => this.message?.({ graph }) });
    }
    on(event: string, handler: (result: { graph: ReviewGraph }) => void) { if (event === 'message') this.message = handler; }
    terminate() { return Promise.resolve(0); }
  }
}));
vi.mock('vscode', () => ({
  commands: { registerCommand: (name: string, callback: () => Promise<void>) => { if (name === 'zeile.openReviewMap') mocks.command = callback; } },
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn() }),
    createWebviewPanel: () => ({
      webview: { postMessage: (message: ToWebview) => mocks.messages.push(message), asWebviewUri: () => 'asset', onDidReceiveMessage: (callback: typeof mocks.receive) => { mocks.receive = callback; } },
      onDidDispose: (callback: () => void) => { mocks.dispose = callback; }
    }),
    showErrorMessage: vi.fn(), showWarningMessage: vi.fn()
  },
  workspace: { workspaceFolders: [{ uri: { scheme: 'file', fsPath: '/fixture' } }], registerTextDocumentContentProvider: vi.fn() },
  Uri: { joinPath: () => ({ fsPath: '/worker' }) }, ViewColumn: { Active: 1 }
}));
import { activate } from '../src/extension';

const pr = { base: 'ancestor', head: 'head', target: 'target', mergeBase: 'ancestor', baseLabel: 'main (merge-base)', headLabel: 'HEAD', mode: 'snapshots', kind: 'pr' };
const exact = { ...pr, base: 'target', baseLabel: 'main', mergeBase: undefined, kind: 'exact' };
const graph: ReviewGraph = { repository: 'fixture', base: 'ancestor', head: 'head', baseLabel: '', headLabel: '', nodes: [], edges: [], files: [], warnings: [], unresolvedCalls: 0 };
const lastSelection = () => mocks.messages.filter(message => message.type === 'branches').at(-1)?.selection;
const start = async () => {
  activate({
    subscriptions: [], extension: { packageJSON: { version: 'test' } }, extensionUri: {},
    globalState: { get: (key: string) => mocks.saved.get(key), update: mocks.update }, workspaceState: { get: () => undefined }
  } as unknown as Parameters<typeof activate>[0]);
  await mocks.command?.();
  await mocks.receive?.({ type: 'ready' });
};
beforeEach(() => {
  mocks.dispose?.();
  vi.resetAllMocks();
  mocks.messages.length = 0; mocks.workers.length = 0;
  mocks.saved.clear();
  mocks.update.mockImplementation(async (key: string, value: unknown) => { if (value === undefined) mocks.saved.delete(key); else mocks.saved.set(key, value); });
  mocks.git.mockResolvedValue('/fixture');
  mocks.branches.mockResolvedValue([{ ref: 'refs/heads/main', label: 'main', group: 'Local branches' }, { ref: 'refs/heads/feature', label: 'feature', group: 'Local branches' }]);
  mocks.initial.mockResolvedValue(pr);
});

it('publishes target-labelled branch controls and PR metadata on completed graphs', async () => {
  try {
    await start();
    expect(lastSelection()).toMatchObject({ before: 'refs/heads/main', after: 'HEAD', comparisonKind: 'pr' });
    expect(lastSelection()?.options.find(option => option.ref === 'refs/heads/main')?.label).toBe('main');
    expect(mocks.workers[0].data).toEqual({ repository: '/fixture', base: 'ancestor', head: 'head' });
    mocks.workers[0].emit(graph);
    const result = mocks.messages.find(message => message.type === 'graph');
    expect(result?.graph.comparison).toEqual({ kind: 'pr', target: 'target', mergeBase: 'ancestor' });
    expect(result?.graph.baseLabel).toBe('main (merge-base)');
  } finally { mocks.dispose?.(); }
});

it('validates comparison kinds and commits selection only after successful resolution', async () => {
  try {
    await start();
    await mocks.receive?.({ type: 'changeComparisonKind', kind: 'invalid' });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.workers).toHaveLength(1);
    mocks.resolve.mockRejectedValueOnce(new Error('ambiguous merge base'));
    await mocks.receive?.({ type: 'changeComparisonKind', kind: 'exact' });
    expect(lastSelection()?.comparisonKind).toBe('pr');
    expect(mocks.workers).toHaveLength(1);
    mocks.resolve.mockResolvedValueOnce(exact);
    await mocks.receive?.({ type: 'changeComparisonKind', kind: 'exact' });
    expect(mocks.resolve).toHaveBeenLastCalledWith('/fixture', expect.objectContaining({ ref: 'refs/heads/main' }), expect.objectContaining({ ref: 'HEAD' }), true, 'exact');
    expect(lastSelection()?.comparisonKind).toBe('exact');
    mocks.workers.at(-1)?.emit({ ...graph, base: 'target' });
    const result = mocks.messages.filter(message => message.type === 'graph').at(-1);
    expect(result?.graph.comparison).toEqual({ kind: 'exact', target: 'target' });
    mocks.resolve.mockResolvedValueOnce({ ...exact, head: 'new-head' });
    await mocks.receive?.({ type: 'refresh' });
    expect(mocks.resolve).toHaveBeenLastCalledWith('/fixture', expect.objectContaining({ ref: 'refs/heads/main' }), expect.objectContaining({ ref: 'HEAD' }), true, 'exact');
    expect(mocks.workers.at(-1)?.data).toEqual({ repository: '/fixture', base: 'target', head: 'new-head' });
  } finally { mocks.dispose?.(); }
});

it('preserves branch choices on failed manual selection and uses the active kind for new branches', async () => {
  try {
    await start();
    mocks.resolve.mockRejectedValueOnce(new Error('same commit'));
    await mocks.receive?.({ type: 'changeBranch', side: 'after', ref: 'refs/heads/feature' });
    expect(lastSelection()?.after).toBe('HEAD');
    expect(mocks.workers).toHaveLength(1);
    mocks.resolve.mockResolvedValueOnce({ ...pr, head: 'feature' });
    await mocks.receive?.({ type: 'changeBranch', side: 'after', ref: 'refs/heads/feature' });
    expect(mocks.resolve).toHaveBeenLastCalledWith('/fixture', expect.objectContaining({ ref: 'refs/heads/main' }), expect.objectContaining({ ref: 'refs/heads/feature' }), false, 'pr');
    expect(lastSelection()?.after).toBe('refs/heads/feature');
    mocks.resolve.mockRejectedValueOnce(new Error('missing branch'));
    await mocks.receive?.({ type: 'refresh' });
    expect(lastSelection()?.after).toBe('refs/heads/feature');
    expect(mocks.workers).toHaveLength(2);
  } finally { mocks.dispose?.(); }
});

it('keeps startup merge-base failures recoverable through exact mode without falling back to latest on refresh', async () => {
  try {
    mocks.initial.mockRejectedValueOnce(new Error('No merge base: unrelated histories'));
    await start();
    expect(mocks.messages.map(message => message.type)).toEqual(['exclusions', 'branches', 'error']);
    expect(mocks.messages.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('exact comparison') });
    expect(lastSelection()).toMatchObject({ before: 'refs/heads/main', after: 'HEAD', comparisonKind: 'pr' });
    expect(mocks.workers).toHaveLength(0);
    mocks.resolve.mockRejectedValueOnce(new Error('No merge base'));
    await mocks.receive?.({ type: 'refresh' });
    expect(mocks.latest).not.toHaveBeenCalled();
    expect(mocks.resolve).toHaveBeenLastCalledWith('/fixture', expect.objectContaining({ ref: 'refs/heads/main' }), expect.objectContaining({ ref: 'HEAD' }), true, 'pr');
    mocks.resolve.mockResolvedValueOnce(exact);
    await mocks.receive?.({ type: 'changeComparisonKind', kind: 'exact' });
    expect(lastSelection()?.comparisonKind).toBe('exact');
    expect(mocks.workers).toHaveLength(1);
    expect(mocks.workers[0].data).toEqual({ repository: '/fixture', base: 'target', head: 'head' });
    mocks.workers[0].emit({ ...graph, base: 'target' });
    expect(mocks.messages.at(-1)).toMatchObject({ type: 'graph', graph: { comparison: { kind: 'exact', target: 'target' } } });
  } finally { mocks.dispose?.(); }
});

const pendingMessages = [
  { type: 'changeBranch', side: 'after', ref: 'refs/heads/feature' },
  { type: 'changeComparisonKind', kind: 'exact' },
  { type: 'refresh' }
];
it.each(pendingMessages)('cancels pending $type resolution without committing state or restarting analysis', async message => {
  try {
    await start();
    let finish: (value: typeof exact) => void = () => { throw new Error('Resolution not started'); };
    mocks.resolve.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = mocks.receive?.(message);
    // Refresh awaits the branch list before resolving commits.
    await Promise.resolve();
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    await mocks.receive?.({ type: 'cancelAnalysis' });
    const count = mocks.messages.length;
    finish({ ...exact, head: 'feature' });
    await pending;
    mocks.workers[0].emit(graph);
    expect(mocks.messages).toHaveLength(count);
    expect(mocks.workers).toHaveLength(1);
    expect(lastSelection()).toMatchObject({ before: 'refs/heads/main', after: 'HEAD', comparisonKind: 'pr' });
    mocks.resolve.mockResolvedValueOnce(pr);
    await mocks.receive?.({ type: 'refresh' });
    expect(mocks.resolve).toHaveBeenLastCalledWith('/fixture', expect.objectContaining({ ref: 'refs/heads/main' }), expect.objectContaining({ ref: 'HEAD' }), true, 'pr');
    expect(mocks.workers).toHaveLength(2);
  } finally { mocks.dispose?.(); }
});

it.each(['cancel', 'dispose'])('ignores pending resolution errors after %s', async action => {
  try {
    await start();
    let fail: (reason: Error) => void = () => { throw new Error('Resolution not started'); };
    mocks.resolve.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const pending = mocks.receive?.({ type: 'changeComparisonKind', kind: 'exact' });
    if (action === 'cancel') await mocks.receive?.({ type: 'cancelAnalysis' });
    else mocks.dispose?.();
    const count = mocks.messages.length;
    fail(new Error('late Git failure'));
    await pending;
    expect(mocks.messages).toHaveLength(count);
    expect(mocks.workers).toHaveLength(1);
  } finally { mocks.dispose?.(); }
});

it('cancels refresh while branch discovery is pending before commit resolution starts', async () => {
  try {
    await start();
    let finish: (value: []) => void = () => { throw new Error('Branch discovery not started'); };
    mocks.branches.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = mocks.receive?.({ type: 'refresh' });
    await mocks.receive?.({ type: 'cancelAnalysis' });
    const count = mocks.messages.length;
    finish([]);
    await pending;
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.messages).toHaveLength(count);
    expect(mocks.workers).toHaveLength(1);
    expect(lastSelection()?.options).toHaveLength(3);
  } finally { mocks.dispose?.(); }
});

it('does not commit a successful resolution after disposal', async () => {
  await start();
  let finish: (value: typeof exact) => void = () => { throw new Error('Resolution not started'); };
  mocks.resolve.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = mocks.receive?.({ type: 'changeComparisonKind', kind: 'exact' });
  mocks.dispose?.();
  finish(exact);
  await pending;
  expect(mocks.workers).toHaveLength(1);
  expect(lastSelection()?.comparisonKind).toBe('pr');
});

it('publishes the selection captured for the graph while a newer comparison is resolving', async () => {
  try {
    await start();
    let finish: (value: typeof exact) => void = () => { throw new Error('Resolution not started'); };
    mocks.resolve.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = mocks.receive?.({ type: 'changeComparisonKind', kind: 'exact' });
    mocks.branches.mockResolvedValueOnce([{ ref: 'refs/heads/main', label: 'new label', group: 'Local branches' }]);
    await mocks.receive?.({ type: 'getBranches' });
    mocks.workers[0].emit(graph);
    const completed = mocks.messages.filter(message => message.type === 'graph').at(-1);
    expect(completed?.selection?.comparisonKind).toBe('pr');
    expect(completed?.selection?.options.find(option => option.ref === 'refs/heads/main')?.label).toBe('main');
    finish(exact);
    await pending;
    expect(lastSelection()?.comparisonKind).toBe('exact');
  } finally { mocks.dispose?.(); }
});

const settleCheckpoint = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
it('saves checkpoint metadata locally, reloads it and clears it without changing the graph', async () => {
  try {
    const current = { ...graph, base: 'a'.repeat(40), head: 'b'.repeat(40) };
    mocks.initial.mockResolvedValue({ ...pr, base: current.base, head: current.head });
    await start(); mocks.workers[0].emit(current); await settleCheckpoint();
    await mocks.receive?.({ type: 'saveCheckpoint', base: current.base, head: current.head, token: 1 });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect([...mocks.saved.values()][0]).toEqual({ version: 1, base: current.base, head: current.head, savedAt: expect.any(String) });
    mocks.dispose?.();
    await start(); mocks.workers.at(-1)?.emit(current); await settleCheckpoint();
    expect(mocks.messages.filter(message => message.type === 'checkpoint').at(-1)?.view.checkpoint?.head).toBe(current.head);
    await mocks.receive?.({ type: 'clearCheckpoint', base: current.base, head: current.head, token: 1 });
    expect(mocks.saved.size).toBe(0);
    expect(mocks.messages.filter(message => message.type === 'checkpoint').at(-1)?.view).toEqual({ checkpoint: undefined, files: [] });
  } finally { mocks.dispose?.(); }
});

it('rejects stale checkpoint writes and reports storage failure without discarding the PR', async () => {
  try {
    await start(); mocks.workers[0].emit(graph); await settleCheckpoint();
    await mocks.receive?.({ type: 'saveCheckpoint', base: graph.base, head: 'stale', token: 1 });
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.update.mockRejectedValueOnce(new Error('disk full'));
    await mocks.receive?.({ type: 'saveCheckpoint', base: graph.base, head: graph.head, token: 1 });
    expect(mocks.messages.at(-1)).toMatchObject({ type: 'checkpoint', error: expect.stringContaining('Could not save') });
    expect(mocks.messages.filter(message => message.type === 'graph')).toHaveLength(1);
    mocks.resolve.mockResolvedValueOnce({ ...pr, head: 'new-head' });
    await mocks.receive?.({ type: 'refresh' });
    await mocks.receive?.({ type: 'saveCheckpoint', base: graph.base, head: graph.head, token: 1 });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  } finally { mocks.dispose?.(); }
});

it('serializes checkpoint writes against clear and comparison changes', async () => {
  try {
    await start(); mocks.workers[0].emit(graph); await settleCheckpoint();
    let finish: () => void = () => { throw new Error('Storage not called'); };
    mocks.update.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = mocks.receive?.({ type: 'saveCheckpoint', base: graph.base, head: graph.head, token: 1 });
    await mocks.receive?.({ type: 'clearCheckpoint', base: graph.base, head: graph.head, token: 1 });
    await mocks.receive?.({ type: 'changeComparisonKind', kind: 'exact' });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.resolve).not.toHaveBeenCalled();
    finish(); await pending;
    await mocks.receive?.({ type: 'clearCheckpoint', base: graph.base, head: graph.head, token: 1 });
    expect(mocks.update).toHaveBeenCalledTimes(2);
    mocks.resolve.mockResolvedValueOnce(pr);
    await mocks.receive?.({ type: 'refresh' });
    mocks.workers.at(-1)?.emit(graph); await settleCheckpoint();
    await mocks.receive?.({ type: 'saveCheckpoint', base: graph.base, head: graph.head, token: 1 });
    expect(mocks.update).toHaveBeenCalledTimes(2);
  } finally { mocks.dispose?.(); }
});
