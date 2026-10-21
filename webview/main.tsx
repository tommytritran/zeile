import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, useNodesState, useEdgesState, useReactFlow, type Node, type NodeProps, type Edge, type Connection } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { MergeView } from '@codemirror/merge';
import { emptyCanvas, validCanvas, type CanvasState, type ReviewGraph, type ReviewNode, type ToHost, type ToWebview } from '../src/model';
import '@xyflow/react/dist/style.css';
import './style.css';
import './dialog.css';

declare global { interface Window { acquireVsCodeApi?: () => { postMessage(message: ToHost): void } } }
const host = window.acquireVsCodeApi?.();
function post(message: ToHost) { host?.postMessage(message); }
const demo: ReviewGraph = {
  repository: 'checkout-service · DEMO', base: 'a41e879', head: 'c92b361', baseLabel: 'main', headLabel: 'feature/retries', unresolvedCalls: 2,
  warnings: ['Demo data · Open the extension in a Git workspace to inspect real revisions.', 'Source references are not proof of runtime dispatch.'],
  files: [{ path: 'src/checkout.ts', status: 'M', represented: true }, { path: 'src/payments.ts', status: 'M', represented: true }, { path: 'README.md', status: 'M', represented: false }],
  nodes: [
    { id: 'checkout', file: 'src/checkout.ts', name: 'submitOrder', kind: 'function', status: 'modified', before: { path: 'src/checkout.ts', line: 4, signature: '(order: Order) → Promise<Receipt>', code: 'export async function submitOrder(order: Order) {\n  const payment = await charge(order.total);\n  return saveReceipt(order, payment);\n}' }, after: { path: 'src/checkout.ts', line: 4, signature: '(order: Order) → Promise<Receipt>', code: 'export async function submitOrder(order: Order) {\n  const key = createIdempotencyKey(order.id);\n  const payment = await charge(order.total, key);\n  return saveReceipt(order, payment);\n}' } },
    { id: 'charge', file: 'src/payments.ts', name: 'charge', kind: 'function', status: 'modified', before: { path: 'src/payments.ts', line: 1, signature: '(amount: number) → Promise<Payment>', code: 'export async function charge(amount: number) {\n  return provider.charge({ amount });\n}' }, after: { path: 'src/payments.ts', line: 1, signature: '(amount: number, key: string) → Promise<Payment>', code: 'export async function charge(amount: number, key: string) {\n  return retry(() => provider.charge({ amount, key }), 3);\n}' } },
    { id: 'save', file: 'src/checkout.ts', name: 'saveReceipt', kind: 'function', status: 'context', before: { path: 'src/checkout.ts', line: 10, signature: '(order: Order, payment: Payment) → Receipt', code: 'function saveReceipt(order: Order, payment: Payment) {\n  return { orderId: order.id, paymentId: payment.id };\n}' }, after: { path: 'src/checkout.ts', line: 12, signature: '(order: Order, payment: Payment) → Receipt', code: 'function saveReceipt(order: Order, payment: Payment) {\n  return { orderId: order.id, paymentId: payment.id };\n}' } }
  ],
  edges: [{ id: 'call1', source: 'checkout', target: 'charge', revision: 'both', kind: 'resolved', label: 'source reference' }, { id: 'call2', source: 'checkout', target: 'save', revision: 'both', kind: 'resolved', label: 'source reference' }]
};
type MapNode = Node<{ label: string; signature?: string; status?: string; count?: number; collapsed?: boolean; toggle?: () => void; pinned?: boolean; pin?: () => void }, 'function' | 'file'>;
const fileId = (path: string) => `file:${path}`;
function FunctionNode({ data, selected }: NodeProps<MapNode>) {
  return <div className={`function-card ${data.status} ${selected ? 'active' : ''}`}><Handle type="target" position={Position.Left}/><div className="node-heading"><span className={`status-dot ${data.status}`}/><strong>{data.label}</strong><small>{data.status}</small></div><div className="signature">{data.signature}</div><Handle type="source" position={Position.Right}/></div>;
}
function FileNode({ data }: NodeProps<MapNode>) {
  return <div className="file-heading"><Handle type="target" position={Position.Left}/><span>▤</span><strong title={data.label}>{data.label}</strong><span className="file-count">{data.count}</span><button type="button" className={`nodrag icon-button ${data.pinned ? 'selected' : ''}`} title={data.pinned ? 'Unpin layout position' : 'Pin layout position'} onClick={data.pin}>⌖</button><button type="button" className="nodrag icon-button" title={data.collapsed ? 'Expand file' : 'Collapse file'} onClick={data.toggle}>{data.collapsed ? '+' : '−'}</button><Handle type="source" position={Position.Right}/></div>;
}
const nodeTypes = { function: FunctionNode, file: FileNode };
const editorTheme = EditorView.theme({ '&': { backgroundColor: '#141a20', color: '#d5dfe4', height: '100%', fontSize: '12px' }, '.cm-content': { fontFamily: 'var(--vscode-editor-font-family, ui-monospace, monospace)', padding: '16px 0' }, '.cm-gutters': { backgroundColor: '#11171d', color: '#647783', border: 'none' }, '.cm-scroller': { overflow: 'auto' } }, { dark: true });
const extensions = () => [javascript({ typescript: true, jsx: true }), lineNumbers(), EditorState.readOnly.of(true), EditorView.editable.of(false), editorTheme];
function Code({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!ref.current) return; const view = new EditorView({ doc: code, extensions: extensions(), parent: ref.current }); return () => view.destroy(); }, [code]);
  return <div className="code-editor" ref={ref}/>;
}
function Diff({ before, after }: { before: string; after: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!ref.current) return; const view = new MergeView({ a: { doc: before, extensions: extensions() }, b: { doc: after, extensions: extensions() }, parent: ref.current, highlightChanges: true, gutter: true }); return () => view.destroy(); }, [before, after]);
  return <div className="merge-editor" ref={ref}/>;
}
function Inspector({ node, note, onNote, close }: { node: ReviewNode; note: string; onNote: (value: string) => void; close: () => void }) {
  const [mode, setMode] = useState('after');
  return <aside className="inspector"><div className="inspector-title"><div><span className="eyebrow">IMPLEMENTATION</span><h2>{node.name}</h2><span className="muted">{node.file}</span></div><button type="button" className="icon-button" onClick={close} aria-label="Close implementation">×</button></div>
    <div className="tabs">{['before', 'after', 'compare', 'diff'].map(value => <button type="button" key={value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}>{value}</button>)}</div>
    <div className="source-meta"><span>{node.status} · {mode === 'before' ? node.before?.signature : node.after?.signature}</span><button type="button" disabled={!host || !node[mode === 'before' ? 'before' : 'after']} onClick={() => post({ type: 'openSource', id: node.id, revision: mode === 'before' ? 'before' : 'after' })}>↗ Editor</button></div>
    <div className="source-content">{mode === 'diff' ? <Diff before={node.before?.code ?? ''} after={node.after?.code ?? ''}/> : mode === 'compare' ? <div className="compare"><div><h4>BEFORE {node.before ? `· L${node.before.line}` : '· not present'}</h4><Code code={node.before?.code ?? '// Not present in base revision'}/></div><div><h4>AFTER {node.after ? `· L${node.after.line}` : '· not present'}</h4><Code code={node.after?.code ?? '// Not present in head revision'}/></div></div> : <Code code={node[mode === 'before' ? 'before' : 'after']?.code ?? '// Not present in this revision'}/>}</div>
    <div className="review-note"><label htmlFor="note">REVIEW NOTE <span>Local annotation · not verification</span></label><textarea id="note" placeholder="What should you check about this change?" value={note} onChange={e => onNote(e.target.value)}/></div></aside>;
}

function ScopeDialog({ graph, close }: { graph?: ReviewGraph; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="scope-dialog" onCancel={close} onClose={close} aria-label="Analysis scope"><section className="scope-panel"><button type="button" className="icon-button close" aria-label="Close analysis scope" onClick={close}>×</button><span className="eyebrow">EVIDENCE, NOT ASSUMPTIONS</span><h2>What this map can tell you</h2><p>Edges describe source relationships. They do not guarantee runtime execution or complete impact coverage.</p><h3>Analysis notes</h3>{graph?.warnings.map(w => <p className="warning" key={w}>{w}</p>)}<p>{graph?.unresolvedCalls} call expressions unresolved in the head snapshot (repository-wide).</p><h3>Changed files outside the map</h3>{graph?.files.filter(f => !f.represented).map(f => <p key={f.path}><code>{f.path}</code> · {f.status}</p>)}<p className="muted">Opening every node is not verification. Manual connections and notes express reviewer understanding.</p></section></dialog>;
}

function Workspace() {
  const [graph, setGraph] = useState<ReviewGraph>();
  const [canvas, setCanvas] = useState<CanvasState>(emptyCanvas);
  const canvasRef = useRef(canvas); canvasRef.current = canvas;
  const graphRef = useRef(graph); graphRef.current = graph;
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState('Opening review workspace…');
  const [error, setError] = useState('');
  const [showScope, setShowScope] = useState(false);
  const flow = useReactFlow<MapNode>();
  const generation = useRef(0);
  const toggle = useCallback((path: string) => setCanvas(s => ({ ...s, collapsed: s.collapsed.includes(path) ? s.collapsed.filter(p => p !== path) : [...s.collapsed, path] })), []);
  const pin = useCallback((id: string) => setCanvas(s => ({ ...s, pinned: s.pinned.includes(id) ? s.pinned.filter(p => p !== id) : [...s.pinned, id] })), []);
  const makeNodes = useCallback((g: ReviewGraph, state: CanvasState): MapNode[] => {
    const files = [...new Set(g.nodes.map(n => n.file))];
    return files.flatMap((path, i) => {
      const children = g.nodes.filter(n => n.file === path);
      const collapsed = state.collapsed.includes(path);
      return [
        { id: fileId(path), type: 'file' as const, position: state.positions[fileId(path)] ?? { x: (i % 3) * 440, y: Math.floor(i / 3) * 400 }, style: { width: 370, height: collapsed ? 54 : 74 + children.length * 92 }, data: { label: path, count: children.length, collapsed, toggle: () => toggle(path), pinned: state.pinned.includes(fileId(path)), pin: () => pin(fileId(path)) }, dragHandle: '.file-heading' },
        ...children.map((n, index): MapNode => ({ id: n.id, type: 'function', parentId: fileId(path), extent: 'parent', hidden: collapsed, position: state.positions[n.id] ?? { x: 16, y: 58 + index * 92 }, style: { width: 338, height: 76 }, data: { label: n.name, signature: (n.after ?? n.before)?.signature, status: n.status } }))
      ].map(n => ({ ...n, deletable: false }));
    });
  }, [toggle, pin]);
  const layout = useCallback(async (g: ReviewGraph, state: CanvasState) => {
    const run = ++generation.current;
    const initial = makeNodes(g, state);
    try {
      const parents = initial.filter(n => !n.parentId);
      const elk = new ELK();
      const result = await elk.layout({ id: 'root', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '70', 'elk.layered.spacing.nodeNodeBetweenLayers': '100' }, children: parents.map(n => ({ id: n.id, width: Number(n.style?.width), height: Number(n.style?.height) })), edges: g.edges.filter(e => g.nodes.find(n => n.id === e.source)?.file !== g.nodes.find(n => n.id === e.target)?.file).map(e => ({ id: e.id, sources: [fileId(g.nodes.find(n => n.id === e.source)!.file)], targets: [fileId(g.nodes.find(n => n.id === e.target)!.file)] })) });
      if (run !== generation.current) return;
      setCanvas(current => {
        const positions = { ...current.positions };
        for (const n of result.children ?? []) if (!current.pinned.includes(n.id)) positions[n.id] = { x: n.x ?? 0, y: n.y ?? 0 };
        return { ...current, positions };
      });
    } catch (e) { if (run === generation.current) { setError(`Automatic layout failed: ${e instanceof Error ? e.message : 'unknown error'}`); setNodes(initial); } }
  }, [makeNodes, setNodes]);
  useEffect(() => {
    const receive = (event: MessageEvent<ToWebview>) => {
      const message = event.data;
      if (message.type === 'loading') { setBusy(message.message); setError(''); }
      if (message.type === 'error') { setError(message.message); setBusy(''); }
      if (message.type === 'graph') {
        generation.current++; setGraph(message.graph); setSelected(undefined); setBusy(''); setError('');
        const state = message.state ?? emptyCanvas(); setCanvas(state);
        if (Object.keys(state.positions).length) setNodes(makeNodes(message.graph, state));
        else void layout(message.graph, state);
      }
    };
    window.addEventListener('message', receive);
    if (host) post({ type: 'ready' });
    else {
      let saved: CanvasState | undefined;
      try { const value = localStorage.getItem('zeile-demo'); if (value) { const parsed: unknown = JSON.parse(value); if (validCanvas(parsed)) saved = parsed; } } catch { saved = undefined; }
      receive({ data: { type: 'graph', graph: demo, state: saved } } as MessageEvent<ToWebview>);
    }
    return () => { window.removeEventListener('message', receive); generation.current++; };
  }, [layout, makeNodes, setNodes]);
  useEffect(() => {
    if (!graph) return;
    setNodes(previous => {
      const fresh = makeNodes(graph, canvas);
      return fresh.map(n => ({ ...n, deletable: false, selected: n.id === selected, position: canvas.positions[n.id] ?? previous.find(p => p.id === n.id)?.position ?? n.position }));
    });
    const groupFor = (id: string) => { const n = graph.nodes.find(n => n.id === id); return n && canvas.collapsed.includes(n.file) ? fileId(n.file) : id; };
    const sourceEdges: Edge[] = graph.edges.map(e => ({ id: e.id, source: groupFor(e.source), target: groupFor(e.target), label: e.revision === 'both' ? undefined : e.revision, data: { manual: false }, deletable: false, style: { stroke: e.revision === 'before' ? '#d88080' : e.revision === 'after' ? '#5fc9b5' : '#617887', strokeDasharray: e.kind === 'declaration' ? '5 4' : undefined }, markerEnd: { type: 'arrowclosed' as const, color: '#78909c' } })).filter(e => e.source !== e.target);
    const manual: Edge[] = canvas.manualEdges.map(e => ({ ...e, source: groupFor(e.source), target: groupFor(e.target), label: e.label || 'manual', data: { manual: true }, style: { stroke: '#e3b86a', strokeDasharray: '4 5' } }));
    setEdges([...sourceEdges, ...manual]);
    const timer = setTimeout(() => { if (host) post({ type: 'saveLayout', state: canvas }); else localStorage.setItem('zeile-demo', JSON.stringify(canvas)); }, 400);
    return () => clearTimeout(timer);
  }, [canvas, graph, makeNodes, selected, setEdges, setNodes]);
  const onConnect = (connection: Connection) => setCanvas(s => ({ ...s, manualEdges: [...s.manualEdges, { id: `manual:${crypto.randomUUID()}`, source: connection.source, target: connection.target, label: 'manual' }] }));
  const current = graph?.nodes.find(n => n.id === selected);
  const focusFile = (path: string) => { void flow.fitView({ nodes: [{ id: fileId(path) }], duration: 350, padding: .3, maxZoom: 1.2 }); };
  return <main className="workspace"><header className="toolbar"><div className="brand"><span className="brand-mark">z</span><div><strong>zeile</strong><span>REVIEW MAP {host ? '' : '· DEMO'}</span></div></div><div className="comparison"><span>{graph?.repository ?? 'Local workspace'}</span><button type="button" disabled={!host || !!busy} onClick={() => post({ type: 'selectComparison' })}>{graph ? `${graph.baseLabel} → ${graph.headLabel}` : 'Select revisions'} <span>⌄</span></button></div><div className="toolbar-actions"><button type="button" disabled={!graph || !!busy} onClick={() => graph && void layout(graph, canvasRef.current)}>Auto-layout</button><button type="button" disabled={!graph} onClick={() => void flow.fitView({ duration: 300, padding: .15 })}>Fit map</button><button type="button" disabled={!host || !!busy} onClick={() => post({ type: 'refresh' })}>↻ Refresh</button><button type="button" className={showScope ? 'selected' : ''} onClick={() => setShowScope(!showScope)}>Scope & limits</button></div></header>
    <div className="work-area"><nav className="file-rail"><div className="rail-title">CHANGE INDEX <span>{graph?.files.length ?? 0}</span></div>{graph?.files.map(f => <button type="button" key={f.path} className="file-item" title={f.path} onClick={() => f.represented ? focusFile(f.path) : setShowScope(true)}><span className={`file-status ${f.status[0]}`}>{f.status[0]}</span><span>{f.path.split('/').pop()}<small>{f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : 'root'}{!f.represented ? ' · not mapped' : ''}</small></span></button>)}<div className="rail-bottom"><span className="eyebrow">LOCAL BY DESIGN</span><p>No AI. No code uploads.<br/>Git snapshots, not working files.</p></div></nav>
    <section className="canvas-area"><div className="canvas-summary"><span className="eyebrow">{graph?.base.slice(0, 7)} → {graph?.head.slice(0, 7)}</span><h1>Understand the change.</h1><p>{graph?.nodes.filter(n => n.status !== 'context').length ?? 0} changed nodes · {graph?.nodes.filter(n => n.status === 'context').length ?? 0} context nodes · {graph?.edges.length ?? 0} source links</p></div>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_, n) => { if (n.type === 'function') setSelected(n.id); }} onNodeDragStop={(_, n, moved) => { generation.current++; setCanvas(s => ({ ...s, positions: { ...s.positions, ...Object.fromEntries((moved.length ? moved : [n]).map(node => [node.id, node.position])) } })); }} onConnect={onConnect} onEdgesDelete={deleted => setCanvas(s => ({ ...s, manualEdges: s.manualEdges.filter(e => !deleted.some(d => d.id === e.id)) }))} fitView minZoom={.12} maxZoom={1.8} deleteKeyCode={['Backspace', 'Delete']} colorMode="dark"><Background gap={24} size={1} color="#2a3640"/><Controls/><MiniMap pannable zoomable nodeColor={n => n.type === 'file' ? '#293944' : '#708b94'}/></ReactFlow>
      {!busy && graph && !graph.nodes.length && <div className="overlay-card"><h2>No mapped function changes</h2><p>The revisions may be identical or only contain non-code changes. Check the change index and scope.</p><button type="button" disabled={!host} onClick={() => post({ type: 'selectComparison' })}>Choose comparison</button></div>}
      {busy && <div className="overlay-card"><span className="eyebrow">READING SNAPSHOTS</span><h2>{busy}</h2><p>Your working tree will not be modified.</p></div>}
      {error && <div className="error-banner" role="alert"><strong>Could not complete operation</strong><p>{error}</p><button type="button" disabled={!host} onClick={() => post({ type: 'selectComparison' })}>Choose revisions</button><button type="button" onClick={() => setError('')}>Dismiss</button></div>}
      <footer className="canvas-legend"><span><i className="status-dot modified"/>Modified</span><span><i className="status-dot added"/>Added</span><span><i className="status-dot removed"/>Removed</span><span><i className="status-dot context"/>Context</span><span className="manual-legend">┄ Manual connection</span><span>Drag handles to connect · Delete to remove manual links</span></footer>
    </section>{current && <Inspector key={current.id} node={current} note={canvas.notes[current.id] ?? ''} onNote={value => setCanvas(s => ({ ...s, notes: { ...s.notes, [current.id]: value } }))} close={() => setSelected(undefined)}/>}</div>
    {showScope && <ScopeDialog graph={graph} close={() => setShowScope(false)}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Workspace/></ReactFlowProvider>);
