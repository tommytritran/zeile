import { describe, expect, it } from 'vitest';
import { isExcluded, validExclusions, visibleGraph } from '../src/visibility';
import type { ReviewGraph } from '../src/model';

describe('canvas exclusions', () => {
  it('matches literal case-insensitive fragments in filenames and paths', () => {
    expect(isExcluded('api/__tests__/value.test.ts', ['.test.'])).toBe(true);
    expect(isExcluded('api/__tests__/value.ts', ['__tests__/'])).toBe(true);
    expect(isExcluded('web/Generated/client.ts', ['generated'])).toBe(true);
    expect(isExcluded('web/generated/client.ts', ['generated\\'])).toBe(true);
    expect(isExcluded('src/contest.ts', ['.test.'])).toBe(false);
    expect(isExcluded('src/value.test.ts', ['*.test.ts'])).toBe(false);
    expect(isExcluded('src/value.ts', [])).toBe(false);
  });
  it('validates storage and message boundaries', () => {
    expect(validExclusions([])).toBe(true);
    expect(validExclusions(['.test.', '__tests__/'])).toBe(true);
    for (const value of [null, {}, [1], [''], [' '], [' test'], ['test\nfile'], ['x'.repeat(201)], Array(101).fill('test')]) expect(validExclusions(value)).toBe(false);
  });
  it('filters nodes and incident edges but preserves inventory and source graph', () => {
    const graph: ReviewGraph = { repository: 'repo', base: 'a', head: 'b', baseLabel: 'main', headLabel: 'feature', warnings: ['scope'], unresolvedCalls: 2,
      nodes: [{ id: 'a', file: 'src/app.ts', name: 'app', kind: 'function', status: 'modified' }, { id: 'b', file: 'src/app.test.ts', name: 'test', kind: 'function', status: 'context' }],
      edges: [{ id: 'ab', source: 'a', target: 'b', revision: 'after', kind: 'resolved', label: 'call' }],
      files: [{ path: 'src/app.ts', status: 'M', represented: true }, { path: 'src/app.test.ts', status: 'M', represented: true }] };
    const shown = visibleGraph(graph, ['.test.']);
    expect(shown.nodes.map(node => node.id)).toEqual(['a']);
    expect(shown.edges).toEqual([]);
    expect(shown.files).toBe(graph.files);
    expect(shown.warnings).toBe(graph.warnings);
    expect(shown.unresolvedCalls).toBe(2);
    expect(graph.nodes).toHaveLength(2);
    expect(visibleGraph(graph, []).edges).toHaveLength(1);
  });
});
