import { useMemo, useState } from 'react';
import type { ReviewGraph, ReviewNode } from '../src/model';

export function FileSymbols({ graph, path, read }: { graph: ReviewGraph; path: string; read: (node: ReviewNode) => void }) {
  const [query, setQuery] = useState('');
  const symbols = useMemo(() => graph.nodes.filter(node => node.file === path && node.kind === 'function'), [graph, path]);
  const matches = symbols.filter(node => node.name.toLowerCase().includes(query.toLowerCase()));
  return <details className="file-symbol-browser"><summary>Find any indexed function ({symbols.length}) · includes nested operations and unchanged context</summary><label>Find function<input aria-label="Find function in file" value={query} onChange={event => setQuery(event.target.value)} placeholder="Operation or function name…"/></label><div>{matches.slice(0, 40).map(node => <button type="button" title={node.name} key={node.id} onClick={() => read(node)}>{node.name}<small>{node.status === 'context' ? 'Unchanged context' : node.status} · L{node.after?.line ?? node.before?.line}</small></button>)}</div>{matches.length > 40 && <p>{matches.length - 40} more matches; narrow the search.</p>}</details>;
}
