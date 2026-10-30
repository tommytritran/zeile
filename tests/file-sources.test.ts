import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
vi.mock('node:util', () => ({ promisify: () => mocks.exec }));
import { readFileSources } from '../src/git';

it('bounds changed-file sources to 16 MB combined across before and after', async () => {
  const code = 'x'.repeat(512000);
  const files = Array.from({ length: 17 }, (_, i) => ({ path: `${i}.md`, status: 'M', represented: false }));
  const listing = files.map(file => `100644 blob hash 512000\t${file.path}\0`).join('');
  mocks.exec.mockImplementation(async (_command, args) => ({ stdout: args.includes('ls-tree') ? listing : code }));
  const snapshot = { sources: new Map<string, string>(), warnings: [] };
  const result = await readFileSources('/fixture', 'base-sha', 'head-sha', files, snapshot, snapshot);
  const versions = Object.values(result).flatMap(value => [value.before, value.after].filter(version => version !== undefined));
  expect(versions).toHaveLength(32);
  expect(versions.reduce((sum, version) => sum + Buffer.byteLength(version.code), 0)).toBeLessThanOrEqual(16 * 1024 * 1024);
  expect(result['16.md'].before?.code).toBe(code);
  expect(result['16.md'].after).toBeUndefined();
  expect(result['16.md'].unavailable).toContain('combined 16 MB');
  expect(result['16.md'].unavailable).toContain('after:');
  expect(mocks.exec.mock.calls.filter(call => call[1].includes('cat-file'))).toHaveLength(32);
  expect(mocks.exec.mock.calls.every(call => call[2].env.GIT_MASTER === '1')).toBe(true);
});
