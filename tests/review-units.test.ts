import { expect, it } from 'vitest';
import { compareSources } from '../src/analyze';
import type { ReviewGraph } from '../src/model';
import { investigationGraph, neighbors, ownedNodes, reviewUnits } from '../src/review-units';
function analyzed(): ReviewGraph {
  const code = 'function outer() { return [1].map(value => value + 1); }';
  const before = new Map([['a.ts', code], ['b.ts', 'export function b() { return 1; }']]);
  const after = new Map(before); after.set('a.ts', code.replace('+ 1', '+ 2'));
  return { repository: 'r', base: 'a', head: 'b', baseLabel: 'main', headLabel: 'feature', ...compareSources(before, after, [{ path: 'a.ts', status: 'M', represented: false }]) };
}
it('groups callback edits under one lexical owner without discarding indexed symbols', () => {
  const graph = analyzed();
  const units = reviewUnits(graph, 'a.ts');
  expect(units.map(node => node.name)).toEqual(['outer']);
  expect(ownedNodes(graph, units[0].id)).toHaveLength(2);
  expect(graph.nodes.some(node => node.file === 'b.ts')).toBe(true);
});
it('file-only rename and module changes do not duplicate function review tasks', () => {
  const graph = analyzed();
  graph.nodes.forEach(node => { node.status = 'context'; });
  graph.files[0] = { path: 'a.ts', oldPath: 'old.ts', status: 'R100', represented: true };
  expect(reviewUnits(graph, 'a.ts')).toHaveLength(0);
});
it('exploration is revision-specific, bounded and cannot bypass exclusions', () => {
  const graph = analyzed();
  const [a, b] = graph.nodes;
  graph.edges = [{ id: 'ab', source: a.id, target: b.id, revision: 'before', kind: 'resolved', label: '' }];
  expect(neighbors(graph, a.id, 'dependencies', 'after', [])).toHaveLength(0);
  expect(neighbors(graph, a.id, 'dependencies', 'before', ['a.ts'])[0].excluded).toBe(true);
  expect(investigationGraph(graph, [a.id], 'before', []).edges).toHaveLength(0);
  expect(investigationGraph(graph, [a.id, b.id], 'before', ['a.ts']).nodes).toHaveLength(0);
});
