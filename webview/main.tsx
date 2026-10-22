import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, useNodesState, useEdgesState, useReactFlow, type Node, type NodeProps, type Edge, type Connection } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { MergeView } from '@codemirror/merge';
import { emptyCanvas, validCanvas, type BranchSelection, type CanvasState, type ReviewGraph, type ReviewNode, type SourceVersion, type ToHost, type ToWebview } from '../src/model';
import { isExcluded, validExclusions, visibleGraph } from '../src/visibility';
import { focusedGraph, isReviewChange, relatedNodes, type RelationshipDirection } from '../src/review-focus';
import { ReviewQueue } from './ReviewQueue';
import { ResizableQueue } from './ResizableQueue';
import { BranchPicker } from './BranchPicker';
import { ExclusionsDialog } from './ExclusionsDialog';
import '@xyflow/react/dist/style.css';
import './style.css';
import './dialog.css';
import './controls.css';
import './diff.css';
import './review.css';

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
const sourceHighlighting = HighlightStyle.define([
  { tag: tags.keyword, color: '#c4a7e7' },
  { tag: [tags.variableName, tags.propertyName], color: '#d5dfe4' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#82cfff' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#5fc9b5' },
  { tag: [tags.string, tags.regexp], color: '#e3b86a' },
  { tag: [tags.number, tags.bool, tags.null], color: '#f0a885' },
  { tag: tags.operator, color: '#b4c5d0' },
  { tag: tags.comment, color: '#91a3ae', fontStyle: 'italic' },
  { tag: tags.tagName, color: '#82cfff' },
  { tag: tags.attributeName, color: '#5fc9b5' }
]);
const extensions = (startLine = 1) => [javascript({ typescript: true, jsx: true }), syntaxHighlighting(sourceHighlighting), lineNumbers({ formatNumber: line => String(line + startLine - 1) }), EditorState.readOnly.of(true), EditorView.editable.of(false), editorTheme];
function Code({ code, line = 1 }: { code: string; line?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!ref.current) return; const view = new EditorView({ doc: code, extensions: extensions(line), parent: ref.current }); return () => view.destroy(); }, [code, line]);
  return <div className="code-editor" ref={ref}/>;
}
function Comparison({ before, after }: { before?: SourceVersion; after?: SourceVersion }) {
  const ref = useRef<HTMLDivElement>(null);
  const merge = useRef<MergeView | null>(null);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(-1);
  const [focusChanges, setFocusChanges] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const highlightRef = useRef(highlight); highlightRef.current = highlight;
  const move = (direction: number) => {
    const view = merge.current;
    if (!view?.chunks.length) return;
    const index = (active + direction + view.chunks.length) % view.chunks.length;
    const chunk = view.chunks[index];
    for (const [editor, from] of [[view.a, chunk.fromA], [view.b, chunk.fromB]] as const) {
      const pos = Math.min(from, editor.state.doc.length);
      editor.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    }
    setActive(index);
  };
  useEffect(() => {
    if (!ref.current) return;
    const view = new MergeView({ a: { doc: before?.code ?? '', extensions: extensions(before?.line) }, b: { doc: after?.code ?? '', extensions: extensions(after?.line) }, parent: ref.current, highlightChanges: highlightRef.current, gutter: highlightRef.current, collapseUnchanged: focusChanges ? { margin: 3, minSize: 6 } : undefined });
    merge.current = view; setTotal(view.chunks.length); setActive(-1);
    return () => { merge.current = null; view.destroy(); };
  }, [before, after, focusChanges]);
  useEffect(() => { merge.current?.reconfigure({ highlightChanges: highlight, gutter: highlight }); }, [highlight]);
  return <div className={`diff-review ${highlight ? '' : 'clean-comparison'}`}>
    <div className="diff-toolbar"><label><input type="checkbox" checked={highlight} onChange={event => setHighlight(event.target.checked)}/> Highlight changes</label><span>{total ? `${total} change ${total === 1 ? 'region' : 'regions'}` : 'No source changes'}</span><label><input type="checkbox" checked={focusChanges} onChange={event => setFocusChanges(event.target.checked)}/> Fold unchanged context</label><div className="diff-navigation"><button type="button" aria-label="Previous change" disabled={!total} onClick={() => move(active < 0 ? total : -1)}>↑</button><output aria-live="polite">{active < 0 ? '—' : active + 1} / {total}</output><button type="button" aria-label="Next change" disabled={!total} onClick={() => move(1)}>↓</button></div><span className="diff-legend">{highlight ? 'Soft shading: changed lines · Underlined highlight: edited text' : 'Clean source · change navigation and alignment retained'}</span></div>
    <div className="diff-pane-headings">{([['BEFORE', before], ['AFTER', after]] as const).map(([label, version]) => <div key={label}><strong>{label} · {label === 'BEFORE' ? '− old text' : '+ new text'}</strong><span>{version ? `${version.path} · L${version.line}` : 'Not present in this revision'}</span></div>)}</div>
    <div className="merge-editor" ref={ref}/>
  </div>;
}
function Inspector({ node, note, onNote, close, relationships, width, onWidth }: { node: ReviewNode; note: string; onNote: (value: string) => void; close: () => void; relationships: React.ReactNode; width?: number; onWidth: (value: number | undefined) => void }) {
  const [mode, setMode] = useState(node.status === 'removed' ? 'before' : 'after');
  const [expanded, setExpanded] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  const resize = (value: number) => {
    const parent = panel.current?.parentElement;
    const available = parent?.clientWidth ?? window.innerWidth;
    const rail = parent?.querySelector('.file-rail')?.getBoundingClientRect().width ?? 0;
    onWidth(Math.round(Math.max(Math.min(300, available), Math.min(value, available - rail - (window.innerWidth > 750 ? 180 : 0)))));
  };
  return <aside ref={panel} style={!expanded && width ? { width, flexShrink: 0 } : undefined} className={`inspector ${expanded ? 'expanded' : ''}`}>
    {!expanded && <button type="button" className="inspector-resizer" aria-label="Resize implementation panel" title="Drag to resize · Arrow keys adjust · Double-click to reset"
      onDoubleClick={() => onWidth(undefined)}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { pointer: event.pointerId, x: event.clientX, width: panel.current?.getBoundingClientRect().width ?? 400 }; }}
      onPointerMove={event => { const start = drag.current; if (start?.pointer === event.pointerId) resize(start.width + start.x - event.clientX); }}
      onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resize((panel.current?.getBoundingClientRect().width ?? 400) + (event.key === 'ArrowLeft' ? 1 : -1) * (event.shiftKey ? 80 : 20)); } if (event.key === 'Home') { event.preventDefault(); onWidth(undefined); } }}/ >}
    <div className="inspector-title"><div><span className="eyebrow">IMPLEMENTATION</span><h2>{node.name}</h2><span className="muted">{node.file}</span></div><div className="inspector-actions"><button type="button" aria-label={expanded ? 'Reduce inspector' : 'Expand inspector'} onClick={() => setExpanded(!expanded)}>{expanded ? '↙ Reduce' : '↗ Expand'}</button><button type="button" className="icon-button" onClick={close} aria-label="Close implementation">×</button></div></div>
    <div className="tabs">{['before', 'after', 'compare'].map(value => <button type="button" key={value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}>{value}</button>)}</div>
    {relationships}
    <div className="source-meta"><span>{node.status} · {mode === 'before' ? node.before?.signature : node.after?.signature}</span><button type="button" disabled={!host || !node[mode === 'before' ? 'before' : 'after']} onClick={() => post({ type: 'openSource', id: node.id, revision: mode === 'before' ? 'before' : 'after' })}>↗ Editor</button></div>
    <div className="source-content">{mode === 'compare' ? <Comparison before={node.before} after={node.after}/> : <Code code={node[mode === 'before' ? 'before' : 'after']?.code ?? '// Not present in this revision'} line={node[mode === 'before' ? 'before' : 'after']?.line}/>}</div>
    <div className="review-note"><label htmlFor="note">REVIEW NOTE <span>Local annotation · not verification</span></label><textarea id="note" placeholder="What should you check about this change?" value={note} onChange={e => onNote(e.target.value)}/></div></aside>;
}

function ScopeDialog({ graph, close }: { graph?: ReviewGraph; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="scope-dialog" onCancel={close} onClose={close} aria-label="Analysis scope"><section className="scope-panel"><button type="button" className="icon-button close" aria-label="Close analysis scope" onClick={close}>×</button><span className="eyebrow">EVIDENCE, NOT ASSUMPTIONS</span><h2>What this map can tell you</h2><p>Edges describe source relationships. They do not guarantee runtime execution or complete impact coverage.</p><h3>Analysis notes</h3>{graph?.warnings.map(w => <p className="warning" key={w}>{w}</p>)}<p>{graph?.unresolvedCalls} call expressions unresolved in the head snapshot (repository-wide).</p><h3>Changed files outside the map</h3>{graph?.files.filter(f => !f.represented).map(f => <p key={f.path}><code>{f.path}</code> · {f.status}</p>)}<p className="muted">Opening every node is not verification. Manual connections and notes express reviewer understanding.</p></section></dialog>;
}

function MappingIndicator({ message }: { message: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <output className="overlay-card mapping-indicator" aria-live="polite">
    <div className="mapping-heading"><span className="mapping-spinner" aria-hidden="true"/><span className="eyebrow">MAPPING YOUR CODE</span></div>
    <h2>Building the review map</h2><p>{message}</p>
    <div className="mapping-progress" aria-hidden="true"><span/></div>
    <p className="mapping-detail">Reading committed source and resolving function relationships. Larger repositories can take longer.</p>
    <div className="mapping-footer"><span aria-live="off">{seconds}s elapsed</span><span>No checkout · no code execution</span></div>
    {host && <div className="mapping-actions"><button type="button" onClick={() => post({ type: 'cancelAnalysis' })}>Cancel mapping</button><button type="button" onClick={() => post({ type: 'showLogs' })}>Show diagnostics</button></div>}
    {seconds >= 15 && <p className="mapping-slow">Still working. You can select a different branch above while this runs.</p>}
  </output>;
}

function Workspace() {
  const [inspectorWidth, setInspectorWidth] = useState<number>();
  const [queueWidth, setQueueWidth] = useState<number>();
  const [graph, setGraph] = useState<ReviewGraph>();
  const [exclusions, setExclusions] = useState<string[]>([]);
  const exclusionsRef = useRef(exclusions); exclusionsRef.current = exclusions;
  const [includeTests, setIncludeTests] = useState(false);
  const [includeGenerated, setIncludeGenerated] = useState(false);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [explorationStatus, setExplorationStatus] = useState('');
  const [queueOpen, setQueueOpen] = useState(false);
  const focusRef = useRef({ includeTests, includeGenerated, revealed }); focusRef.current = { includeTests, includeGenerated, revealed };
  const shownGraph = useMemo(() => graph ? focusedGraph(graph, exclusions, includeTests, includeGenerated, revealed) : undefined, [graph, exclusions, includeTests, includeGenerated, revealed]);
  const [showExclusions, setShowExclusions] = useState(false);
  const [branches, setBranches] = useState<BranchSelection>({ options: host ? [] : [
    { ref: 'main', label: 'main', group: 'Local branches' },
    { ref: 'feature/retries', label: 'feature/retries', group: 'Local branches' }
  ], before: host ? '' : 'main', after: host ? '' : 'feature/retries' });
  const [canvas, setCanvas] = useState<CanvasState>(emptyCanvas);
  const canvasRef = useRef(canvas); canvasRef.current = canvas;
  const graphRef = useRef(graph); graphRef.current = graph;
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState('Opening review workspace…');
  const [error, setError] = useState('');
  const [showScope, setShowScope] = useState(false);
  const [branchWait, setBranchWait] = useState(false);
  useEffect(() => {
    if (!host || branches.options.length) { setBranchWait(false); return; }
    post({ type: 'getBranches' });
    const retry = window.setTimeout(() => { setBranchWait(true); post({ type: 'getBranches' }); }, 3000);
    return () => window.clearTimeout(retry);
  }, [branches.options.length]);
  const flow = useReactFlow<MapNode>();
  const flowRef = useRef(flow); flowRef.current = flow;
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
    const focus = focusRef.current;
    g = focusedGraph(g, exclusionsRef.current, focus.includeTests, focus.includeGenerated, focus.revealed);
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
      if (message.type === 'exclusions' && validExclusions(message.patterns)) {
        generation.current++; exclusionsRef.current = message.patterns; setExclusions(message.patterns);
      }
      if (message.type === 'branches') setBranches(message.selection);
      if (message.type === 'loading') {
        generation.current++;
        setBusy(message.message); setError(''); setGraph(undefined); setSelected(undefined);
        setNodes([]); setEdges([]);
        setRevealed([]); focusRef.current.revealed = []; setExplorationStatus('');
      }
      if (message.type === 'error') { setError(message.message); setBusy(''); }
      if (message.type === 'graph') {
        if (message.selection) setBranches(message.selection);
        generation.current++; setGraph(message.graph); setSelected(undefined); setBusy(''); setError('');
        setRevealed([]); focusRef.current.revealed = []; setExplorationStatus('');
        const state = message.state ?? emptyCanvas(); setCanvas(state);
        if (Object.keys(state.positions).length) setNodes(makeNodes(focusedGraph(message.graph, exclusionsRef.current, focusRef.current.includeTests, focusRef.current.includeGenerated, []), state));
        else void layout(message.graph, state);
      }
    };
    window.addEventListener('message', receive);
    if (host) post({ type: 'ready' });
    else {
      try { const value: unknown = JSON.parse(localStorage.getItem('zeile-demo-exclusions') ?? '[]'); if (validExclusions(value)) { exclusionsRef.current = value; setExclusions(value); } } catch { exclusionsRef.current = []; }
      let saved: CanvasState | undefined;
      try { const value = localStorage.getItem('zeile-demo'); if (value) { const parsed: unknown = JSON.parse(value); if (validCanvas(parsed)) saved = parsed; } } catch { saved = undefined; }
      receive({ data: { type: 'graph', graph: demo, state: saved } } as MessageEvent<ToWebview>);
    }
    return () => { window.removeEventListener('message', receive); generation.current++; };
  }, [layout, makeNodes, setNodes, setEdges]);
  useEffect(() => {
    if (!shownGraph) return;
    const graph = shownGraph;
    setNodes(previous => {
      const fresh = makeNodes(graph, canvas);
      const known = new Map(previous.map(node => [node.id, node.position]));
      const placed = fresh.map(node => ({ ...node, deletable: false, selected: node.id === selected, position: canvas.positions[node.id] ?? known.get(node.id) ?? node.position }));
      for (const parent of placed.filter(node => !node.parentId)) {
        const children = placed.filter(node => node.parentId === parent.id);
        const reserved = children.filter(node => canvas.positions[node.id] || known.has(node.id));
        for (const child of children.filter(node => !canvas.positions[node.id] && !known.has(node.id))) {
          let y = 58;
          while (reserved.some(node => Math.abs(node.position.y - y) < 92)) y += 92;
          child.position = { x: 16, y }; reserved.push(child);
        }
        if (!parent.data.collapsed) parent.style = { ...parent.style, height: Math.max(Number(parent.style?.height) || 0, ...children.map(node => node.position.y + 92)) };
      }
      return placed;
    });
    const groupFor = (id: string) => { const n = graph.nodes.find(n => n.id === id); return n && canvas.collapsed.includes(n.file) ? fileId(n.file) : id; };
    const sourceEdges: Edge[] = graph.edges.map(e => ({ id: e.id, source: groupFor(e.source), target: groupFor(e.target), label: e.revision === 'both' ? undefined : e.revision, data: { manual: false }, deletable: false, style: { stroke: e.revision === 'before' ? '#d88080' : e.revision === 'after' ? '#5fc9b5' : '#617887', strokeDasharray: e.kind === 'declaration' ? '5 4' : undefined }, markerEnd: { type: 'arrowclosed' as const, color: '#78909c' } })).filter(e => e.source !== e.target);
    const visibleIds = new Set(graph.nodes.flatMap(node => [node.id, fileId(node.file)]));
    const manual: Edge[] = canvas.manualEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)).map(e => ({ ...e, source: groupFor(e.source), target: groupFor(e.target), label: e.label || 'manual', data: { manual: true }, style: { stroke: '#e3b86a', strokeDasharray: '4 5' } }));
    setEdges([...sourceEdges, ...manual]);
    const timer = setTimeout(() => { if (host) post({ type: 'saveLayout', state: canvas }); else localStorage.setItem('zeile-demo', JSON.stringify(canvas)); }, 400);
    return () => clearTimeout(timer);
  }, [canvas, shownGraph, makeNodes, selected, setEdges, setNodes]);
  const onConnect = (connection: Connection) => setCanvas(s => ({ ...s, manualEdges: [...s.manualEdges, { id: `manual:${crypto.randomUUID()}`, source: connection.source, target: connection.target, label: 'manual' }] }));
  const current = shownGraph?.nodes.find(n => n.id === selected);
  const applyExclusions = (patterns: string[]) => {
    generation.current++; exclusionsRef.current = patterns; setExclusions(patterns);
    if (host) post({ type: 'saveExclusions', patterns });
    else localStorage.setItem('zeile-demo-exclusions', JSON.stringify(patterns));
  };
  const hiddenFiles = new Set(graph?.nodes.filter(node => isExcluded(node.file, exclusions)).map(node => node.file));
  const selectFromQueue = (id: string) => {
    const node = graph?.nodes.find(node => node.id === id);
    if (!node || isExcluded(node.file, exclusions)) return;
    generation.current++;
    setRevealed(current => [...new Set([...current, id])]);
    setCanvas(current => ({ ...current, collapsed: current.collapsed.filter(path => path !== node.file) }));
    setSelected(id);
  };
  const focusedFile = shownGraph?.nodes.find(node => node.id === selected)?.file;
  useEffect(() => { if (focusedFile) void flowRef.current.fitView({ nodes: [{ id: fileId(focusedFile) }], duration: 0, padding: .25, maxZoom: 1.2 }); }, [focusedFile]);
  const expand = (direction: RelationshipDirection) => {
    if (!graph || !current) return;
    const related = relatedNodes(graph, current.id, direction);
    const allowed = related.filter(node => !isExcluded(node.file, exclusions));
    const visibleIds = new Set(shownGraph?.nodes.map(node => node.id));
    const added = allowed.filter(node => !visibleIds.has(node.id));
    generation.current++;
    setRevealed(previous => [...new Set([...previous, ...allowed.map(node => node.id)])]);
    setCanvas(previous => ({ ...previous, collapsed: previous.collapsed.filter(path => !allowed.some(node => node.file === path)) }));
    setExplorationStatus(`${added.length} ${direction} revealed · ${allowed.length - added.length} already shown · ${related.length - allowed.length} excluded. Before/After source references, not proof of runtime dispatch.`);
  };
  return <main className="workspace"><header className="toolbar"><div className="brand"><span className="brand-mark">z</span><div><strong>zeile</strong><span>REVIEW MAP {host ? '' : '· DEMO'}</span></div></div><div className="comparison"><span>{graph?.repository ?? 'Local workspace'} · committed code only</span><div className="comparison-versions" title="Compare exact committed snapshots. No checkout or fetch.">{(['before', 'after'] as const).map((side, index) => <React.Fragment key={side}>{index > 0 && <span aria-hidden="true">→</span>}<BranchPicker label={side === 'before' ? 'Before' : 'After'} value={branches[side]} options={branches.options} disabled={!host || !branches.options.length} onChange={ref => post({ type: 'changeBranch', side, ref })}/></React.Fragment>)}</div></div><div className="toolbar-actions"><button type="button" disabled={!graph || !!busy} onClick={() => graph && void layout(graph, canvasRef.current)}>Auto-layout</button><button type="button" disabled={!graph} onClick={() => void flow.fitView({ duration: 300, padding: .15 })}>Fit map</button><button type="button" disabled={!host || !!busy} onClick={() => post({ type: 'refresh' })}>↻ Refresh</button><button type="button" className={exclusions.length ? 'selected' : ''} onClick={() => setShowExclusions(true)}>Exclusions{exclusions.length ? ` (${exclusions.length})` : ''}</button><button type="button" className={showScope ? 'selected' : ''} onClick={() => setShowScope(!showScope)}>Scope & limits</button></div></header>
    {!host && <div className="branch-notice">Browser demo — branch selection requires the VS Code extension. Install Zeile 0.1.8 and run “Zeile: Open Review Map” in your repository.</div>}
    {host && (!branches.options.length || branchWait) && <div className="branch-notice" role="alert">{branchWait ? 'The branch list did not arrive. Retry to reload it independently of the map.' : 'Loading branches from your repository…'} <button type="button" onClick={() => post({ type: 'getBranches' })}>Retry branch list</button></div>}
    <div className="work-area" style={queueWidth ? { '--queue-width': `${queueWidth}px` } as React.CSSProperties : undefined}><button type="button" className="queue-mobile-toggle" aria-expanded={queueOpen} onClick={() => setQueueOpen(!queueOpen)}>{queueOpen ? 'Hide review queue' : 'Review queue'}</button><ResizableQueue open={queueOpen} onWidth={setQueueWidth}><nav className="file-rail" aria-label="Review queue"><ReviewQueue graph={graph} exclusions={exclusions} selected={selected} includeTests={includeTests} includeGenerated={includeGenerated} setTests={value => { generation.current++; setIncludeTests(value); setRevealed([]); setSelected(undefined); }} setGenerated={value => { generation.current++; setIncludeGenerated(value); setRevealed([]); setSelected(undefined); }} select={id => { selectFromQueue(id); setQueueOpen(false); }} editExclusions={() => setShowExclusions(true)} scope={() => setShowScope(true)} reset={() => { generation.current++; setRevealed([]); setSelected(undefined); setExplorationStatus('Exploration reset. Changed files remain visible according to filters.'); }}/></nav></ResizableQueue>
    <section className="canvas-area"><div className="canvas-summary"><span className="eyebrow">{graph?.base.slice(0, 7)} → {graph?.head.slice(0, 7)}</span><h1>Understand the change.</h1><p>{shownGraph?.nodes.filter(n => isReviewChange(n, shownGraph)).length ?? 0} changed nodes · {shownGraph?.nodes.filter(n => !isReviewChange(n, shownGraph)).length ?? 0} context nodes · {shownGraph?.edges.length ?? 0} source links</p></div>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_, n) => { if (n.type === 'function') setSelected(n.id); }} onNodeDragStop={(_, n, moved) => { generation.current++; setCanvas(s => ({ ...s, positions: { ...s.positions, ...Object.fromEntries((moved.length ? moved : [n]).map(node => [node.id, node.position])) } })); }} onConnect={onConnect} onEdgesDelete={deleted => setCanvas(s => ({ ...s, manualEdges: s.manualEdges.filter(e => !deleted.some(d => d.id === e.id)) }))} fitView minZoom={.12} maxZoom={1.8} deleteKeyCode={['Backspace', 'Delete']} colorMode="dark"><Background gap={24} size={1} color="#2a3640"/><Controls/><MiniMap pannable zoomable nodeColor={n => n.type === 'file' ? '#293944' : '#708b94'}/></ReactFlow>
      {!busy && shownGraph && !shownGraph.nodes.length && <div className="overlay-card"><h2>{graph?.nodes.length ? 'No changes in the current focus' : 'No mapped function changes'}</h2><p>Enable tests/generated files, edit Exclusions, or inspect the full change index. Unchanged context appears when you expand source relationships.</p></div>}
      {!!hiddenFiles.size && <div className="exclusion-notice">{hiddenFiles.size} files · {graph?.nodes.filter(node => isExcluded(node.file, exclusions)).length} nodes hidden by exclusions<button type="button" onClick={() => setShowExclusions(true)}>Edit exclusions</button></div>}
      {explorationStatus && <output className="exploration-status">{explorationStatus}</output>}
      {busy && <MappingIndicator key={busy} message={busy}/>}
      {error && <div className="error-banner" role="alert"><strong>Could not complete operation</strong><p>{error}</p>{host && <button type="button" onClick={() => post({ type: 'showLogs' })}>Show diagnostics</button>}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}
      <footer className="canvas-legend"><span><i className="status-dot modified"/>Modified</span><span><i className="status-dot added"/>Added</span><span><i className="status-dot removed"/>Removed</span><span><i className="status-dot context"/>Context</span><span className="manual-legend">┄ Manual connection</span><span>Drag handles to connect · Delete to remove manual links</span></footer>
    </section>{current && <Inspector key={current.id} node={current} width={inspectorWidth} onWidth={setInspectorWidth} note={canvas.notes[current.id] ?? ''} onNote={value => setCanvas(s => ({ ...s, notes: { ...s.notes, [current.id]: value } }))} close={() => setSelected(undefined)} relationships={<div className="relationships"><div>{(['callers', 'dependencies'] as const).map(direction => <button type="button" key={direction} onClick={() => expand(direction)}>Show {direction} ({graph ? relatedNodes(graph, current.id, direction).length : 0})</button>)}</div><p>Available static source references · method declarations are not guaranteed dispatch. Zero does not mean unused. Expansion is limited to the analyzed neighborhood of changed functions.</p></div>}/>}</div>
    {showScope && <ScopeDialog graph={graph} close={() => setShowScope(false)}/>}
    {showExclusions && <ExclusionsDialog patterns={exclusions} apply={applyExclusions} close={() => setShowExclusions(false)}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Workspace/></ReactFlowProvider>);
