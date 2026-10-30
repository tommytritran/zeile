import type { ReviewEdge, ReviewGraph, ReviewNode } from './model';
import { ownedNodes, type InvestigationRevision } from './review-units';
import { fileCategory } from './review-focus';

export interface ConnectedReference { node: ReviewNode; edges: ReviewEdge[]; nested: boolean; test: boolean }
export interface ChangeGroup { files: string[]; entry: ReviewNode; links: number }
/** File groups use directed references, with at most one unchanged bridge, never shared callees alone. */
export function changeGroups(graph: ReviewGraph, revision: InvestigationRevision): ChangeGroup[] {
  const changedPaths = new Set(graph.files.filter(file => fileCategory(file.path) === 'production').map(file => file.path));
  const nodes = new Map(graph.nodes.filter(node => node.kind === 'function' && node[revision] && fileCategory(node.file) === 'production').map(node => [node.id, node]));
  const changed = new Map([...nodes].filter(([, node]) => changedPaths.has(node.file) && node.status !== 'context'));
  const parents = new Map<string, string>([...changed.values()].map(node => [node.file, node.file]));
  const find = (path: string): string => { let root = path; while (parents.get(root) && parents.get(root) !== root) root = parents.get(root)!; let cursor = path; while (parents.get(cursor) && parents.get(cursor) !== root) { const next = parents.get(cursor)!; parents.set(cursor, root); cursor = next; } return root; };
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) if ((edge.revision === revision || edge.revision === 'both') && nodes.has(edge.source) && nodes.has(edge.target)) {
    const targets = outgoing.get(edge.source) ?? []; targets.push(edge.target); outgoing.set(edge.source, targets);
  }
  const links = new Map<string, [string, string]>();
  const connect = (a: ReviewNode, b: ReviewNode) => { if (a.file === b.file) return; parents.set(find(b.file), find(a.file)); const pair: [string, string] = [a.file, b.file]; links.set(JSON.stringify(pair), pair); };
  const bridges = new Map<string, ReviewNode[]>();
  for (const source of changed.values()) for (const target of outgoing.get(source.id) ?? []) {
    const direct = changed.get(target);
    if (direct) connect(source, direct);
    else { const sources = bridges.get(target) ?? []; sources.push(source); bridges.set(target, sources); }
  }
  for (const [bridge, sources] of bridges) {
    const targets = (outgoing.get(bridge) ?? []).flatMap(id => { const target = changed.get(id); return target ? [target] : []; });
    const first = targets[0];
    if (!first) continue;
    for (const source of sources) connect(source, first);
    const source = sources[0];
    for (const target of targets) connect(source, target);
  }
  const groups = new Map<string, ChangeGroup>();
  for (const node of changed.values()) {
    const key = find(node.file);
    const group = groups.get(key) ?? { files: [], entry: node, links: 0 };
    if (!group.files.includes(node.file)) group.files.push(node.file);
    if ((outgoing.get(node.id)?.length ?? 0) > (outgoing.get(group.entry.id)?.length ?? 0)) group.entry = node;
    groups.set(key, group);
  }
  for (const [source] of links.values()) { const group = groups.get(find(source)); if (group) group.links++; }
  return [...groups.values()].filter(group => group.files.length > 1).sort((a, b) => b.files.length - a.files.length || a.entry.file.localeCompare(b.entry.file));
}
/** Aggregate references in the selected implementation, without fabricating callback invocation. */
export function connectedReferences(graph: ReviewGraph, selected: string, revision: InvestigationRevision): { callers: ConnectedReference[]; dependencies: ConnectedReference[] } {
  const owned = new Set(ownedNodes(graph, selected).map(node => node.id));
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const callers = new Map<string, ConnectedReference>(), dependencies = new Map<string, ConnectedReference>();
  for (const edge of graph.edges) {
    if (edge.revision !== 'both' && edge.revision !== revision) continue;
    const incoming = owned.has(edge.target) && !owned.has(edge.source);
    const outgoing = owned.has(edge.source) && !owned.has(edge.target);
    if (!incoming && !outgoing) continue;
    const id = incoming ? edge.source : edge.target;
    const node = byId.get(id);
    if (!node || !node[revision]) continue;
    const map = incoming ? callers : dependencies;
    const entry = map.get(id) ?? { node, edges: [], nested: false, test: fileCategory(node.file) === 'tests' };
    entry.edges.push(edge);
    entry.nested ||= (incoming ? edge.target : edge.source) !== selected;
    map.set(id, entry);
  }
  const sort = (entries: Map<string, ConnectedReference>) => [...entries.values()].sort((a, b) => Number(a.test) - Number(b.test) || Number(a.node.status === 'context') - Number(b.node.status === 'context') || a.node.file.localeCompare(b.node.file) || a.node.name.localeCompare(b.node.name));
  return { callers: sort(callers), dependencies: sort(dependencies) };
}
