import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ git: vi.fn() }));
vi.mock('../src/git', () => ({ git: mocks.git }));
import { parseNumstat, reviewMetadata } from '../src/review-metadata';

it('parses text, binary, rename and paths containing tabs or newlines', () => {
  expect(parseNumstat(['4\t2\tsrc/a.ts', '-\t-\timage.png', '0\t0\t', 'old.ts', 'new.ts', '1\t2\todd\tname\n.ts', ''].join('\0'))).toEqual([
    { path: 'src/a.ts', added: 4, deleted: 2 }, { path: 'image.png', added: null, deleted: null },
    { path: 'new.ts', added: 0, deleted: 0 }, { path: 'odd\tname\n.ts', added: 1, deleted: 2 }
  ]);
  expect(parseNumstat('')).toEqual([]);
  expect(() => parseNumstat('1\t2\t\0old\0')).toThrow('rename');
  expect(() => parseNumstat('bad\t2\tfile\0')).toThrow('count');
});

it('collects independent line and bounded commit metadata', async () => {
  mocks.git.mockImplementation(async (_repo: string, args: string[]) => {
    if (args[0] === 'diff') return '3\t1\tfile.ts\0';
    if (args[0] === 'rev-list') return '21\n';
    return ['abc', 'Alex', '2026-10-27T12:00:00Z', 'Change file', '\ndef', 'Sam', '2026-10-26T12:00:00Z', 'Earlier change', '\n'].join('\0');
  });
  const metadata = await reviewMetadata('/repo', 'base', 'head');
  expect(metadata.churn).toEqual([{ path: 'file.ts', added: 3, deleted: 1 }]);
  expect(metadata.commits).toEqual({ total: 21, recent: [
    { sha: 'abc', author: 'Alex', date: '2026-10-27T12:00:00Z', subject: 'Change file' },
    { sha: 'def', author: 'Sam', date: '2026-10-26T12:00:00Z', subject: 'Earlier change' }
  ] });
  expect(metadata.unavailable).toEqual([]);
});

it('reports failures instead of inventing zero changes or failing analysis', async () => {
  mocks.git.mockRejectedValue(new Error('Git unavailable'));
  const metadata = await reviewMetadata('/repo', 'base', 'head');
  expect(metadata.commits).toBeUndefined();
  expect(metadata.churn).toBeUndefined();
  expect(metadata.unavailable).toHaveLength(2);
});
