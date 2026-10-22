import type { ReviewGraph, ReviewNode } from './model';
import { visibleGraph } from './visibility';

export type RelationshipDirection = 'callers' | 'dependencies';
export function isReviewChange(node: ReviewNode, graph: ReviewGraph): boolean {
  return node.status !== 'context' || graph.files.some(file => file.path === node.file && !!file.oldPath && file.oldPath !== file.path);
}
export function isTestFile(path: string): boolean {
  return /(^|\/)(__tests__|tests?|__mocks__)\//i.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path);
}
export function isGeneratedFile(path: string): boolean {
  return /(^|\/)(__generated__|generated)\//i.test(path) || /(^|\/)[^/]+\.(generated|gen)\.[cm]?[jt]sx?$/i.test(path) || /\.d\.[cm]?ts$/i.test(path);
}
export function fileCategory(path: string): 'production' | 'tests' | 'generated' {
  return isGeneratedFile(path) ? 'generated' : isTestFile(path) ? 'tests' : 'production';
}
export function relatedNodes(graph: ReviewGraph, id: string, direction: RelationshipDirection): ReviewNode[] {
  const ids = new Set(graph.edges.filter(edge => direction === 'callers' ? edge.target === id : edge.source === id)
    .map(edge => direction === 'callers' ? edge.source : edge.target));
  ids.delete(id);
  return graph.nodes.filter(node => ids.has(node.id));
}
export function focusedGraph(graph: ReviewGraph, exclusions: string[], includeTests: boolean, includeGenerated: boolean, revealed: string[]): ReviewGraph {
  const eligible = visibleGraph(graph, exclusions);
  const explicit = new Set(revealed);
  const nodes = eligible.nodes.filter(node => explicit.has(node.id) || (isReviewChange(node, graph) &&
    (fileCategory(node.file) === 'production' || (fileCategory(node.file) === 'tests' ? includeTests : includeGenerated))));
  const ids = new Set(nodes.map(node => node.id));
  return { ...eligible, nodes, edges: eligible.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}
