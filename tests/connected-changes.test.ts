import { expect, it } from 'vitest';
import { changeGroups, connectedReferences } from '../src/connected-changes';
import type { ReviewGraph, ReviewNode } from '../src/model';
const node = (id: string, parentId?: string): ReviewNode => ({ id, parentId, file: `${id}.ts`, name: id, kind: 'function', status: 'modified', before: { path: `${id}.ts`, code: '', line: 1, signature: '' }, after: { path: `${id}.ts`, code: '', line: 1, signature: '' } });
function fixture(): ReviewGraph {
  return { repository: 'r', base: 'a', head: 'b', baseLabel: 'a', headLabel: 'b', warnings: [], unresolvedCalls: 0, files: [], nodes: [node('owner'), node('callback', 'owner'), node('consumer'), node('old'), node('new'), { ...node('test'), file: 'owner.test.ts' }], edges: [
    { id: 'nested', source: 'callback', target: 'consumer', revision: 'both', kind: 'resolved', label: '' },
    { id: 'before', source: 'owner', target: 'old', revision: 'before', kind: 'declaration', label: '' },
    { id: 'after', source: 'owner', target: 'new', revision: 'after', kind: 'resolved', label: '' },
    { id: 'test', source: 'test', target: 'owner', revision: 'both', kind: 'resolved', label: '' }
  ] };
}
it('includes nested references without adding a fake callback invocation edge', () => {
  const graph = fixture();
  const result = connectedReferences(graph, 'owner', 'after');
  expect(result.dependencies.map(entry => entry.node.id)).toEqual(['consumer', 'new']);
  expect(result.dependencies[0].nested).toBe(true);
  expect(result.dependencies[0].edges[0].source).toBe('callback');
  expect(result.callers[0].test).toBe(true);
  expect(graph.edges).toHaveLength(4);
});
it('never joins before-only and after-only paths and excludes missing revision sources', () => {
  const graph = fixture();
  expect(connectedReferences(graph, 'owner', 'before').dependencies.map(entry => entry.node.id)).toEqual(['consumer', 'old']);
  graph.nodes.find(value => value.id === 'new')!.after = undefined;
  expect(connectedReferences(graph, 'owner', 'after').dependencies.map(entry => entry.node.id)).toEqual(['consumer']);
});
it('groups directed changes across one unchanged bridge, never across mixed snapshots or shared utilities', () => {
  const graph = fixture();
  graph.nodes = [node('a'), { ...node('bridge'), status: 'context' }, node('b'), node('c'), { ...node('test'), file: 'b.test.ts' }];
  graph.files = graph.nodes.filter(value => value.status !== 'context').map(value => ({ path: value.file, status: 'M', represented: true }));
  graph.edges = [
    { id: 'a-bridge', source: 'a', target: 'bridge', revision: 'both', kind: 'resolved', label: '' },
    { id: 'bridge-b', source: 'bridge', target: 'b', revision: 'after', kind: 'resolved', label: '' },
    { id: 'c-bridge', source: 'c', target: 'bridge', revision: 'before', kind: 'resolved', label: '' },
    { id: 'test-a', source: 'test', target: 'a', revision: 'both', kind: 'resolved', label: '' }
  ];
  expect(changeGroups(graph, 'after').map(group => group.files.sort())).toEqual([['a.ts', 'b.ts']]);
  expect(changeGroups(graph, 'before')).toEqual([]);
});
it('handles directed cycles without losing files or looping', () => {
  const graph = fixture();
  graph.files = graph.nodes.map(value => ({ path: value.file, status: 'M', represented: true }));
  graph.edges.push({ id: 'cycle', source: 'consumer', target: 'owner', revision: 'both', kind: 'resolved', label: '' });
  expect(changeGroups(graph, 'after')[0].files).toContain('owner.ts');
  expect(changeGroups(graph, 'after')[0].files).not.toContain('owner.test.ts');
});
it('keeps high-fan-in/fan-out bridge grouping evidence linear rather than enumerating every pair', () => {
  const graph = fixture();
  const sources = Array.from({ length: 100 }, (_, i) => node(`source${i}`));
  const targets = Array.from({ length: 100 }, (_, i) => node(`target${i}`));
  graph.nodes = [...sources, { ...node('bridge'), status: 'context' }, ...targets];
  graph.files = [...sources, ...targets].map(value => ({ path: value.file, status: 'M', represented: true }));
  graph.edges = [...sources.map(value => ({ id: value.id, source: value.id, target: 'bridge', revision: 'both' as const, kind: 'resolved' as const, label: '' })), ...targets.map(value => ({ id: value.id, source: 'bridge', target: value.id, revision: 'both' as const, kind: 'resolved' as const, label: '' }))];
  const groups = changeGroups(graph, 'after');
  expect(groups).toHaveLength(1);
  expect(groups[0].files).toHaveLength(200);
  expect(groups[0].links).toBeLessThanOrEqual(200);
});
