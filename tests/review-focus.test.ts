import { expect, it } from 'vitest';
import type { ReviewGraph, ReviewNode } from '../src/model';
import { fileCategory, focusedGraph, isReviewChange, relatedNodes } from '../src/review-focus';

const node = (id: string, file: string, status: ReviewNode['status'] = 'modified'): ReviewNode => ({ id, name: id, file, status, kind: 'function' });
const graph: ReviewGraph = { repository: 'repo', base: 'a', head: 'b', baseLabel: 'main', headLabel: 'feature', warnings: [], unresolvedCalls: 0,
  files: [{ path: 'app.ts', status: 'M', represented: true }, { path: 'renamed.ts', oldPath: 'old.ts', status: 'R100', represented: true }],
  nodes: [node('app', 'app.ts'), node('caller', 'caller.ts', 'context'), node('helper', 'helper.ts', 'context'), node('test', 'app.test.ts'), node('generated', 'generated/api.ts'), node('rename', 'renamed.ts', 'context')],
  edges: [{ id: 'call', source: 'caller', target: 'app', revision: 'before', kind: 'resolved', label: 'source reference' }, { id: 'help', source: 'app', target: 'helper', revision: 'after', kind: 'declaration', label: 'method declaration' }, { id: 'test', source: 'test', target: 'app', revision: 'both', kind: 'resolved', label: 'source reference' }] };
it('classifies test and generated path conventions without arbitrary substring matching', () => {
  for (const path of ['a.test.ts', 'src/a.SPEC.tsx', 'api/__tests__/a.ts', 'test/a.js', 'api/tests/a.ts']) expect(fileCategory(path)).toBe('tests');
  for (const path of ['generated/client.ts', 'a.generated.ts', 'src/__generated__/a.ts', 'a.d.ts']) expect(fileCategory(path)).toBe('generated');
  expect(fileCategory('src/contest.ts')).toBe('production');
});
it('starts with changed production nodes and preserves pure renames', () => {
  const result = focusedGraph(graph, [], false, false, []);
  expect(result.nodes.map(node => node.id)).toEqual(['app', 'rename']);
  expect(result.edges).toEqual([]);
  expect(result.files).toBe(graph.files);
  expect(isReviewChange(graph.nodes[5], graph)).toBe(true);
});
it('reveals direct neighbors without crossing exclusions or mutating the source graph', () => {
  expect(relatedNodes(graph, 'app', 'callers').map(node => node.id)).toEqual(['caller', 'test']);
  expect(relatedNodes(graph, 'app', 'dependencies').map(node => node.id)).toEqual(['helper']);
  const result = focusedGraph(graph, ['helper.ts'], false, false, ['caller', 'helper', 'test']);
  expect(result.nodes.map(node => node.id)).toEqual(['app', 'caller', 'test', 'rename']);
  expect(result.edges.map(edge => edge.id)).toEqual(['call', 'test']);
  expect(graph.nodes).toHaveLength(6);
});
it('shows test/generated changed nodes only through their filters or explicit reveal', () => {
  expect(focusedGraph(graph, [], true, false, []).nodes.map(node => node.id)).toEqual(['app', 'test', 'rename']);
  expect(focusedGraph(graph, [], false, true, []).nodes.map(node => node.id)).toEqual(['app', 'generated', 'rename']);
  expect(focusedGraph(graph, [], false, false, ['generated']).nodes.map(node => node.id)).toContain('generated');
});
