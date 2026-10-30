import type { ReviewGraph, ReviewNode } from './model';
import { isExcluded } from './visibility';

/** A lexical function owner is one review unit; descendants remain inspectable. */
export function reviewUnits(graph: ReviewGraph, path: string): ReviewNode[] {
  const nodes = graph.nodes.filter(node => node.file === path && node.kind === 'function');
  const byId = new Map(nodes.map(node => [node.id, node]));
  const changed = nodes.filter(node => node.status !== 'context');
  const owners = new Set<string>();
  for (const node of changed) {
    let owner = node;
    const visited = new Set([node.id]);
    while (owner.parentId && byId.has(owner.parentId) && !visited.has(owner.parentId)) {
      visited.add(owner.parentId); owner = byId.get(owner.parentId)!;
    }
    owners.add(owner.id);
  }
  return nodes.filter(node => owners.has(node.id)).sort((a, b) => (a.after?.line ?? a.before?.line ?? 0) - (b.after?.line ?? b.before?.line ?? 0));
}

export function ownedNodes(graph: ReviewGraph, id: string): ReviewNode[] {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph.nodes) if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); changed = true; }
  }
  return graph.nodes.filter(node => ids.has(node.id));
}

export type InvestigationRevision = 'before' | 'after';
export function neighbors(graph: ReviewGraph, id: string, direction: 'callers' | 'dependencies', revision: InvestigationRevision, exclusions: string[]): {
  node: ReviewNode; edges: ReviewGraph['edges']; excluded: boolean;
}[] {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const grouped = new Map<string, ReviewGraph['edges']>();
  for (const edge of graph.edges) {
    if (edge.revision !== 'both' && edge.revision !== revision) continue;
    if ((direction === 'callers' ? edge.target : edge.source) !== id) continue;
    const other = direction === 'callers' ? edge.source : edge.target;
    if (other === id || !byId.has(other)) continue;
    const edges = grouped.get(other) ?? []; edges.push(edge); grouped.set(other, edges);
  }
  return [...grouped].map(([other, edges]) => ({ node: byId.get(other)!, edges, excluded: isExcluded(byId.get(other)!.file, exclusions) }))
    .sort((a, b) => a.node.file.localeCompare(b.node.file) || a.node.name.localeCompare(b.node.name));
}

export function investigationGraph(graph: ReviewGraph, ids: string[], revision: InvestigationRevision, exclusions: string[]): ReviewGraph {
  const requested = new Set(ids);
  const nodes = graph.nodes.filter(node => requested.has(node.id) && !isExcluded(node.file, exclusions));
  const visible = new Set(nodes.map(node => node.id));
  return { ...graph, nodes, edges: graph.edges.filter(edge => (edge.revision === 'both' || edge.revision === revision) && visible.has(edge.source) && visible.has(edge.target)) };
}

export interface ReadingLocation { file: string; node?: string }
export function locationKey(location: ReadingLocation): string { return location.node ?? `file:${location.file}`; }
