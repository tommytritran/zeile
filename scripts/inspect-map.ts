import { analyzeRepository } from '../src/analyze';
const [repository, base = 'master', head = 'HEAD'] = process.argv.slice(2);
if (!repository) throw new Error('Usage: inspect-map <repository> [before] [after]');
const start = performance.now();
const graph = await analyzeRepository(repository, base, head);
const changedFiles = new Set(graph.files.map(f => f.path));
const byFile = new Map<string, Record<string, number>>();
for (const node of graph.nodes) {
  const counts = byFile.get(node.file) ?? {};
  counts[node.status] = (counts[node.status] ?? 0) + 1;
  counts.total = (counts.total ?? 0) + 1;
  if (node.name.includes('callback')) counts.callbacks = (counts.callbacks ?? 0) + 1;
  byFile.set(node.file, counts);
}
console.log(JSON.stringify({ seconds: (performance.now() - start) / 1000, base: graph.base, head: graph.head, filesChanged: graph.files.length, nodes: graph.nodes.length, edges: graph.edges.length,
  status: Object.fromEntries(['added', 'removed', 'modified', 'context'].map(status => [status, graph.nodes.filter(n => n.status === status).length])),
  nodesOutsideChangedFiles: graph.nodes.filter(n => !changedFiles.has(n.file)).length,
  changedNodesOutsideChangedFiles: graph.nodes.filter(n => !changedFiles.has(n.file) && n.status !== 'context').length,
  byFile: [...byFile].sort((a, b) => b[1].total - a[1].total), warnings: graph.warnings
}, null, 2));
