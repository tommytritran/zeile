import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, useNodesState, useReactFlow, type Node, type NodeProps, type Viewport } from '@xyflow/react';
import type { ReviewGraph, ReviewNode } from '../src/model';
import { investigationGraph, neighbors, type InvestigationRevision } from '../src/review-units';
import { referencePaths } from '../src/review-focus';

type SymbolNode = Node<{ symbol: ReviewNode; read: () => void }, 'symbol'>;
function SymbolCard({ data }: NodeProps<SymbolNode>) {
  return <div className="investigation-card"><Handle type="target" position={Position.Left}/><small>{data.symbol.file}</small><strong>{data.symbol.name}</strong><span>{data.symbol.status === 'context' ? 'Unchanged context' : data.symbol.status}</span><button type="button" className="nodrag" onClick={data.read}>Read code</button><Handle type="source" position={Position.Right}/></div>;
}
const nodeTypes = { symbol: SymbolCard };
function RelationshipMap({ graph, root, selected, setSelected, read, viewport, rememberViewport }: {
  graph: ReviewGraph; root: string; selected?: string; setSelected: (id: string | undefined) => void; read: (node: ReviewNode) => void;
  viewport?: Viewport; rememberViewport: (viewport: Viewport) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<SymbolNode>([]);
  const flow = useReactFlow<SymbolNode>();
  const paths = useMemo(() => referencePaths(graph, selected), [graph, selected]);
  useEffect(() => {
    setNodes(previous => {
      const known = new Map(previous.map(node => [node.id, node.position]));
      const left = new Set<string>(), right = new Set<string>();
      // Placement describes visible references, not an execution sequence.
      for (const edge of graph.edges) { if (edge.target === root) left.add(edge.source); if (edge.source === root) right.add(edge.target); }
      const occupied = new Map<string, number>();
      for (const node of previous) occupied.set(`${node.position.x}:${node.position.y}`, 1);
      return graph.nodes.map(symbol => {
        const x = symbol.id === root ? 380 : left.has(symbol.id) ? 0 : right.has(symbol.id) ? 760 : 1140;
        let y = 0;
        while (occupied.has(`${x}:${y}`)) y += 170;
        const position = known.get(symbol.id) ?? { x, y };
        occupied.set(`${position.x}:${position.y}`, 1);
        return { id: symbol.id, type: 'symbol' as const, position, selected: symbol.id === selected,
          className: paths ? paths.nodes.has(symbol.id) ? 'path-related' : 'path-muted' : undefined,
          data: { symbol, read: () => read(symbol) }, style: { width: 280, height: 138 } };
      });
    });
  }, [graph, root, selected, paths, read, setNodes]);
  const edges = graph.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.kind === 'declaration' ? 'declaration' : 'source reference',
    className: paths && !paths.edges.has(edge.id) ? 'path-muted' : undefined,
    style: { stroke: paths?.edges.has(edge.id) ? '#e3b86a' : '#78909c', strokeWidth: paths?.edges.has(edge.id) ? 3 : 1.5, strokeDasharray: edge.kind === 'declaration' ? '6 4' : undefined },
    markerEnd: { type: 'arrowclosed' as const, color: '#b5a177' } }));
  return <section className="local-map" aria-label="Focused source relationship map" onKeyDownCapture={event => { if (event.key !== 'Enter' && event.key !== ' ') return; const target = event.target; if (!(target instanceof HTMLElement) || !target.matches('.react-flow__node-symbol')) return; const id = target.dataset.id; if (id) { event.preventDefault(); event.stopPropagation(); setSelected(id); } }}><div className="map-actions"><button type="button" disabled={!selected} onClick={() => { if (selected) void flow.fitView({ nodes: [{ id: selected }], padding: .5, maxZoom: 1, duration: 200 }); }}>Show selected symbol</button><button type="button" onClick={() => void flow.fitView({ padding: .2, maxZoom: 1, duration: 200 })}>Fit investigation</button></div><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
    onNodeClick={(_, node) => setSelected(node.id)} onPaneClick={() => setSelected(undefined)}
    defaultViewport={viewport ?? { x: 20, y: 80, zoom: .8 }} onMoveEnd={(_, value) => rememberViewport(value)} minZoom={.35} maxZoom={1.5} colorMode="dark" nodesConnectable={false} deleteKeyCode={null}>
    <Background gap={24} size={1} color="#293a46"/><Controls showInteractive={false}/></ReactFlow></section>;
}

export function Investigation({ graph, root, revision, exclusions, read, reference, }: {
  graph: ReviewGraph; root: string; revision: InvestigationRevision; exclusions: string[]; read: (node: ReviewNode) => void;
  reference: (node: ReviewNode, line: number) => void;
}) {
  const [ids, setIds] = useState([root]);
  const [selected, setSelected] = useState<string | undefined>(root);
  const [limit, setLimit] = useState(10);
  const [viewport, setViewport] = useState<Viewport>();
  const visible = useMemo(() => investigationGraph(graph, ids, revision, exclusions), [graph, ids, revision, exclusions]);
  const current = graph.nodes.find(node => node.id === selected);
  const reveal = (node: ReviewNode) => { setIds(previous => [...new Set([...previous, node.id])]); setSelected(node.id); setLimit(10); };
  return <div className="investigation">
    <div className="investigation-heading"><div><h2>Explore source relationships</h2><p>{revision === 'after' ? 'After' : 'Before'} snapshot only · {visible.nodes.length} symbols in this investigation</p></div><button type="button" onClick={() => { setIds([root]); setSelected(root); setViewport(undefined); }}>Reset map</button><button type="button" onClick={() => setSelected(undefined)}>Clear highlight</button></div>
    <p className="boundary-note">Select a symbol to browse neighbors; use Read code to open it. This is a bounded static source index, not a runtime stack. Missing dependencies, dynamic dispatch, JSX and network boundaries may be unresolved.</p>
    <div className="investigation-body"><ReactFlowProvider><RelationshipMap graph={visible} root={root} selected={selected} setSelected={setSelected} read={read} viewport={viewport} rememberViewport={setViewport}/></ReactFlowProvider>
      <aside className="neighbor-panel" aria-label="Source neighbors"><h3>{current?.name ?? 'Select a symbol'}</h3>{current && <><button type="button" onClick={() => read(current)}>Read selected code</button>
        {(['callers', 'dependencies'] as const).map(direction => {
          const entries = neighbors(graph, current.id, direction, revision, exclusions);
          return <section key={`${current.id}:${direction}`}><h4>{direction === 'callers' ? 'Incoming callers' : 'Outgoing dependencies'} ({entries.length})</h4>
            {!entries.length && <p className="empty-neighbors">No {direction} resolved in indexed source. This is not proof that none exist.</p>}
            {entries.slice(0, limit).map(({ node, edges, excluded }) => <div className="neighbor" key={node.id}><strong>{node.name}</strong><small>{node.file} · {node.status}</small><span>{edges.some(edge => edge.kind === 'declaration') ? 'Declaration reference; dispatch unknown' : 'Resolved source reference'}</span>
              {excluded ? <em>Excluded from map</em> : <div><button type="button" onClick={() => reveal(node)}>Reveal</button><button type="button" onClick={() => read(node)}>Read</button></div>}
              {edges.flatMap(edge => edge.sites ?? []).filter(site => site.revision === revision).map((site, index) => {
                const caller = graph.nodes.find(candidate => candidate.id === edges[0].source);
                return caller && <button type="button" className="reference-site" key={`${site.path}:${site.line}:${index}`} onClick={() => reference(caller, site.line)}>Call site · {site.path}:L{site.line}</button>;
              })}
            </div>)}{entries.length > limit && <button type="button" onClick={() => setLimit(limit + 10)}>Show 10 more ({entries.length - limit} remaining)</button>}
          </section>;
        })}</>}
      </aside></div>
  </div>;
}
