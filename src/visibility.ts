import type { ReviewGraph } from './model';

export function validExclusions(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every(item =>
    typeof item === 'string' && item.length > 0 && item.length <= 200 && item === item.trim() && !/[\r\n]/.test(item));
}

/** Literal, case-insensitive path fragments, not regular expressions or globs. */
export function isExcluded(path: string, exclusions: string[]): boolean {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return exclusions.some(fragment => normalized.includes(fragment.replaceAll('\\', '/').toLowerCase()));
}

export function visibleGraph(graph: ReviewGraph, exclusions: string[]): ReviewGraph {
  const nodes = graph.nodes.filter(node => !isExcluded(node.file, exclusions));
  const ids = new Set(nodes.map(node => node.id));
  return { ...graph, nodes, edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}
