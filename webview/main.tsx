import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BranchSelection, CanvasState, ReviewGraph, ReviewNode, SourceVersion, ToHost, ToWebview } from '../src/model';
import { emptyCanvas, validCanvas } from '../src/model';
import { fileCategory } from '../src/review-focus';
import { locationKey, neighbors, ownedNodes, reviewUnits, type InvestigationRevision, type ReadingLocation } from '../src/review-units';
import { isExcluded, validExclusions } from '../src/visibility';
import { BranchPicker } from './BranchPicker';
import { ExclusionsDialog } from './ExclusionsDialog';
import { ResizableQueue } from './ResizableQueue';
import { SourceReader, type ReadingScroll } from './SourceReader';
import { Investigation } from './Investigation';
import { CheckpointPanel } from './CheckpointPanel';
import { ReviewBrief } from './ReviewBrief';
import { ConnectedChanges } from './ConnectedChanges';
import { ChangeGroups } from './ChangeGroups';
import { FileSymbols } from './FileSymbols';
import type { CheckpointView } from '../src/checkpoint';
import '@xyflow/react/dist/style.css';
import './workspace.css';

declare global { interface Window { acquireVsCodeApi?: () => { postMessage(message: ToHost): void } } }
const host = window.acquireVsCodeApi?.();
const post = (message: ToHost) => host?.postMessage(message);
const version = (path: string, code: string, line = 1): SourceVersion => ({ path, line, code, signature: 'Source snapshot' });
const demo: ReviewGraph = {
  repository: 'checkout-service · DEMO', base: 'a41e879', head: 'c92b361', baseLabel: 'main', headLabel: 'feature/retries', unresolvedCalls: 2,
  warnings: ['Browser demo: no repository access.', 'Static references do not prove runtime dispatch.'],
  files: [{ path: 'src/checkout.ts', status: 'M', represented: true }, { path: 'src/payments.ts', status: 'M', represented: true }, { path: 'README.md', status: 'M', represented: false }],
  nodes: [
    { id: 'checkout', file: 'src/checkout.ts', name: 'submitOrder', kind: 'function', status: 'modified', before: version('src/checkout.ts', 'export async function submitOrder(order: Order) {\n  return charge(order.total);\n}', 4), after: version('src/checkout.ts', 'export async function submitOrder(order: Order) {\n  return charge(order.total, order.id);\n}', 4) },
    { id: 'charge', file: 'src/payments.ts', name: 'charge', kind: 'function', status: 'modified', before: version('src/payments.ts', 'export async function charge(amount: number) {\n  return provider.charge(amount);\n}'), after: version('src/payments.ts', 'export async function charge(amount: number, key: string) {\n  return retry(() => provider.charge(amount, key));\n}') },
    { id: 'retry', file: 'src/retry.ts', name: 'retry', kind: 'function', status: 'context', before: version('src/retry.ts', 'export function retry(action: () => Payment) { return action(); }'), after: version('src/retry.ts', 'export function retry(action: () => Payment) { return action(); }') }
  ], edges: [{ id: 'charge-call', source: 'checkout', target: 'charge', revision: 'both', kind: 'resolved', label: 'source reference' }, { id: 'retry-call', source: 'charge', target: 'retry', revision: 'after', kind: 'resolved', label: 'source reference' }],
  fileSources: { 'README.md': { before: version('README.md', '# Checkout\nPayments are charged once.'), after: version('README.md', '# Checkout\nPayments use idempotency keys.') } }
};
type Screen = 'overview' | 'read' | 'explore';
type ReaderMode = 'compare' | 'before' | 'after';
type HistoryEntry = ReadingLocation & { targetLine?: number; revision?: InvestigationRevision; referenceRevision: InvestigationRevision; mode: ReaderMode; highlight: boolean; fold: boolean };

function Mapping({ message }: { message: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const start = Date.now(); const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000); return () => window.clearInterval(timer); }, []);
  return <output className="mapping-indicator"><span className="mapping-spinner" aria-hidden="true"/><h2>Building review index</h2><p>{message}</p><p>{seconds}s elapsed · committed snapshots only</p>{host && <div><button type="button" onClick={() => post({ type: 'cancelAnalysis' })}>Cancel mapping</button><button type="button" onClick={() => post({ type: 'showLogs' })}>Show diagnostics</button></div>}</output>;
}
function Workspace() {
  const [graph, setGraph] = useState<ReviewGraph>();
  const [checkpoint, setCheckpoint] = useState<CheckpointView>();
  const [checkpointError, setCheckpointError] = useState('');
  const [checkpointPending, setCheckpointPending] = useState(false);
  const graphRef = useRef<ReviewGraph | undefined>(undefined);
  const checkpointToken = useRef<number | undefined>(undefined);
  const [branches, setBranches] = useState<BranchSelection>({ options: host ? [] : [{ ref: 'main', label: 'main', group: 'Local branches' }, { ref: 'feature/retries', label: 'feature/retries', group: 'Local branches' }], before: host ? '' : 'main', after: host ? '' : 'feature/retries', comparisonKind: 'pr' });
  const [canvas, setCanvas] = useState<CanvasState>(emptyCanvas);
  const canvasRef = useRef(canvas); canvasRef.current = canvas;
  const [busy, setBusy] = useState(host ? 'Reading local branches…' : '');
  const [error, setError] = useState('');
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [showExclusions, setShowExclusions] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [screen, setScreen] = useState<Screen>('overview');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [mode, setMode] = useState<ReaderMode>('compare');
  const [highlight, setHighlight] = useState(true);
  const [fold, setFold] = useState(false);
  const [revision, setRevision] = useState<InvestigationRevision>('after');
  const [root, setRoot] = useState<string>();
  const [queueWidth, setQueueWidth] = useState<number>();
  const [queueOpen, setQueueOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showConnections, setShowConnections] = useState(true);
  const scroll = useRef(new Map<string, ReadingScroll>());
  const identity = useRef('');
  const [branchWait, setBranchWait] = useState(false);
  useEffect(() => {
    const receive = (event: MessageEvent<ToWebview>) => {
      const message = event.data;
      if (message.type === 'branches') setBranches(message.selection);
      if (message.type === 'exclusions' && validExclusions(message.patterns)) setExclusions(message.patterns);
      if (message.type === 'loading') { setBusy(message.message); setError(''); setGraph(undefined); graphRef.current = undefined; setCheckpoint(undefined); setCheckpointPending(false); setCheckpointError(''); }
      if (message.type === 'checkpoint' && checkpointToken.current === message.token && graphRef.current?.base === message.base && graphRef.current?.head === message.head) {
        setCheckpoint(message.view); setCheckpointError(message.error ?? ''); setCheckpointPending(false);
      }
      if (message.type === 'error') { setBusy(''); setError(message.message); }
      if (message.type === 'graph') {
        graphRef.current = message.graph;
        checkpointToken.current = message.token;
        setCheckpoint(undefined); setCheckpointError(''); setCheckpointPending(false);
        const nextIdentity = `${message.graph.repository}:${message.graph.base}:${message.graph.head}`;
        if (identity.current !== nextIdentity) { setHistory([]); setCursor(-1); setRoot(undefined); setScreen('overview'); scroll.current.clear(); }
        identity.current = nextIdentity;
        setGraph(message.graph); setCanvas(message.state ?? emptyCanvas()); setBusy(''); setError('');
        if (message.selection) setBranches(message.selection);
      }
    };
    window.addEventListener('message', receive);
    if (host) post({ type: 'ready' });
    else {
      let state = emptyCanvas();
      try { const saved: unknown = JSON.parse(localStorage.getItem('zeile-demo') ?? 'null'); if (validCanvas(saved)) state = saved; const patterns: unknown = JSON.parse(localStorage.getItem('zeile-demo-exclusions') ?? '[]'); if (validExclusions(patterns)) setExclusions(patterns); } catch { state = emptyCanvas(); }
      receive({ data: { type: 'graph', graph: demo, state } } as MessageEvent<ToWebview>);
    }
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (!host || branches.options.length) { setBranchWait(false); return; }
    post({ type: 'getBranches' });
    const timer = window.setTimeout(() => { setBranchWait(true); post({ type: 'getBranches' }); }, 3000);
    return () => window.clearTimeout(timer);
  }, [branches.options.length]);
  const location = history[cursor];
  const current = graph?.nodes.find(node => node.id === location?.node);
  const activeFile = location?.file;
  const indexedFiles = useMemo(() => graph?.files.filter(file => file.path.toLowerCase().includes(query.toLowerCase()) && (category === 'all' || fileCategory(file.path) === category)) ?? [], [graph, query, category]);
  const navigate = useCallback((entry: ReadingLocation & { targetLine?: number; revision?: InvestigationRevision }, nextScreen: Screen = 'read', readerMode?: ReaderMode, referenceRevision = revision) => {
    const nextMode = readerMode ?? entry.revision ?? mode;
    setHistory(previous => {
      const existing = previous[cursor];
      if (existing && locationKey(existing) === locationKey(entry) && existing.targetLine === entry.targetLine && existing.revision === entry.revision) return previous;
      const saved = previous.map((value, index) => index === cursor ? { ...value, mode, highlight, fold, referenceRevision: revision } : value);
      const next = [...saved.slice(0, cursor + 1), { ...entry, mode: nextMode, highlight, fold, referenceRevision }]; setCursor(next.length - 1); return next;
    });
    if (entry.revision || readerMode) setMode(nextMode);
    setRevision(referenceRevision);
    setScreen(nextScreen); setQueueOpen(false);
  }, [cursor, mode, highlight, fold, revision]);
  const readNode = useCallback((node: ReviewNode) => navigate({ file: node.file, node: node.id }), [navigate]);
  const readInvestigation = useCallback((node: ReviewNode) => navigate({ file: node.file, node: node.id, revision }), [navigate, revision]);
  const readReference = useCallback((node: ReviewNode, targetLine: number) => navigate({ file: node.file, node: node.id, targetLine, revision }), [navigate, revision]);
  const startInvestigation = (node: ReviewNode) => { setRoot(node.id); navigate({ file: node.file, node: node.id }, 'explore', undefined, node.after ? 'after' : 'before'); };
  const fileSource = graph && activeFile ? graph.fileSources?.[activeFile] : undefined;
  const module = graph?.nodes.find(node => node.file === activeFile && node.kind === 'module');
  const before = current?.before ?? (location?.node ? undefined : fileSource?.before ?? module?.before);
  const after = current?.after ?? (location?.node ? undefined : fileSource?.after ?? module?.after);
  const incomplete = current ? (current.status === 'context' && (!current.before || !current.after)) : !!fileSource?.unavailable;
  const key = location ? locationKey(location) : '';
  const scrollKey = `${key}:${mode}:${fold}:${location?.targetLine ?? ''}`;
  const saveScroll = useCallback((position: ReadingScroll) => { scroll.current.set(scrollKey, position); }, [scrollKey]);
  const setNote = (value: string) => {
    const state = { ...canvasRef.current, notes: { ...canvasRef.current.notes, [key]: value } }; setCanvas(state);
    if (host) post({ type: 'saveLayout', state }); else localStorage.setItem('zeile-demo', JSON.stringify(state));
  };
  const applyExclusions = (patterns: string[]) => { setExclusions(patterns); if (host) post({ type: 'saveExclusions', patterns }); else localStorage.setItem('zeile-demo-exclusions', JSON.stringify(patterns)); };
  const graphId = graph ? `${graph.repository}:${graph.base}:${graph.head}` : '';
  const restoreHistory = (index: number) => {
    const target = history[index]; if (!target) return;
    setHistory(previous => previous.map((entry, i) => i === cursor ? { ...entry, mode, highlight, fold, referenceRevision: revision } : entry));
    setMode(target.mode); setRevision(target.referenceRevision); setHighlight(target.highlight); setFold(target.fold); setCursor(index); setScreen('read');
  };
  const fileIndex = graph?.files.findIndex(file => file.path === activeFile) ?? -1;
  return <main className="workspace review-workspace"><header className="toolbar"><div className="brand"><strong>zeile</strong><span>REVIEW WORKSPACE</span></div>
    <div className="comparison"><div className="comparison-versions">{(['before', 'after'] as const).map(side => <BranchPicker key={side} label={side === 'before' ? 'Before' : 'After'} value={branches[side]} options={branches.options} disabled={!host || !branches.options.length} onChange={ref => post({ type: 'changeBranch', side, ref })}/>)}</div></div>
    <label className="comparison-kind">Comparison<select aria-label="Comparison kind" value={branches.comparisonKind ?? 'pr'} disabled={!host} onChange={event => post({ type: 'changeComparisonKind', kind: event.target.value === 'exact' ? 'exact' : 'pr' })}><option value="pr">PR changes (merge base)</option><option value="exact">Exact snapshots</option></select></label>
    <div className="toolbar-actions"><button type="button" disabled={!host || !!busy} onClick={() => post({ type: 'refresh' })}>Refresh</button><button type="button" onClick={() => setShowExclusions(true)}>Exclusions{exclusions.length ? ` (${exclusions.length})` : ''}</button><button type="button" onClick={() => setShowScope(true)}>Scope & limits</button></div></header>
    {!host && <div className="branch-notice">Browser demo — branch selection requires the VS Code extension. No local repository is read.</div>}
    {host && (!branches.options.length || branchWait) && <div className="branch-notice">Loading branches… <button type="button" onClick={() => post({ type: 'getBranches' })}>Retry branch list</button></div>}
    <div className="comparison-basis">{graph ? <>{graph.repository} · {graph.comparison?.kind === 'pr' ? 'PR scope: merge base → After' : graph.comparison?.kind === 'exact' ? 'Exact snapshots: Before → After' : 'Demo comparison'} · {graph.base.slice(0, 8)} → {graph.head.slice(0, 8)} · {graph.files.length} changed files</> : 'Local committed snapshots · no checkout, no code execution'}</div>
    <div className="work-area" style={queueWidth ? { '--queue-width': `${queueWidth}px` } as React.CSSProperties : undefined}>
      <button type="button" className="queue-mobile-toggle" aria-expanded={queueOpen} onClick={() => setQueueOpen(!queueOpen)}>{queueOpen ? 'Hide files' : 'Changed files'}</button>
      <ResizableQueue open={queueOpen} onWidth={setQueueWidth}><nav className="file-rail" aria-label="Changed files"><div className="rail-title">CHANGED FILES <span>{graph?.files.length ?? 0}</span></div>
        <label className="file-search">Find a file<input aria-label="Search changed files" value={query} onChange={event => setQuery(event.target.value)} placeholder="Filename or path…"/></label>
        <label className="file-category">Category<select aria-label="File category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All changed files</option><option value="production">Production / other</option><option value="tests">Tests</option><option value="generated">Generated</option></select></label>
        {indexedFiles.map(file => <div className="file-entry" key={file.path}><button type="button" className="file-item" aria-current={activeFile === file.path ? 'true' : undefined} title={file.path} onClick={() => navigate({ file: file.path })}><span>{file.status[0]}</span><span>{file.path.split('/').pop()}<small>{file.path}{isExcluded(file.path, exclusions) ? ' · excluded from map' : ''}</small></span></button>
          {activeFile === file.path && graph && <div className="file-symbols"><span>{reviewUnits(graph, file.path).length} owning function changes</span>{reviewUnits(graph, file.path).map(node => <button type="button" className="review-unit" key={node.id} aria-current={current?.id === node.id ? 'true' : undefined} onClick={() => readNode(node)}>{node.name}<small>{node.status} · {ownedNodes(graph, node.id).length - 1} nested symbols grouped</small></button>)}</div>}
        </div>)}{graph && !indexedFiles.length && <p className="muted pad">No files match this filter. The comparison still contains {graph.files.length} files.</p>}
        <div className="rail-bottom">Local source evidence.<br/>Hidden is not reviewed.</div>
      </nav></ResizableQueue>
      <section className="main-surface"><div className="surface-navigation"><div className="surface-tabs">{(['overview', 'read', 'explore'] as const).map(view => <button type="button" className={screen === view ? 'selected' : ''} disabled={view === 'read' ? !location : view === 'explore' ? !root : false} key={view} onClick={() => setScreen(view)}>{view === 'overview' ? 'Overview' : view === 'read' ? 'Read change' : 'Explore relationships'}</button>)}</div><div className="history-controls"><button type="button" aria-label="Back in reading history" disabled={cursor <= 0} onClick={() => restoreHistory(cursor - 1)}>← Back</button><button type="button" aria-label="Forward in reading history" disabled={cursor >= history.length - 1} onClick={() => restoreHistory(cursor + 1)}>Forward →</button></div></div>
        {error && <div className="error-banner" role="alert"><strong>Could not complete operation</strong><p>{error}</p>{host && <button type="button" onClick={() => post({ type: 'showLogs' })}>Show diagnostics</button>}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}
        {busy && <Mapping key={busy} message={busy}/>}
        {!busy && graph && <>
          <div className="overview-surface" hidden={screen !== 'overview'}><ChangeGroups graph={graph} read={(node, scope) => navigate({ file: node.file, node: node.id }, 'read', 'compare', scope)}/><details className="comparison-details"><summary>Comparison metadata & source coverage</summary><ReviewBrief graph={graph} read={file => navigate({ file })}/></details>
            <CheckpointPanel graph={graph} view={checkpoint} error={checkpointError} pending={checkpointPending} enabled={!!host}
              save={() => { if (checkpointToken.current === undefined) return; setCheckpointPending(true); setCheckpointError(''); post({ type: 'saveCheckpoint', base: graph.base, head: graph.head, token: checkpointToken.current }); }}
              clear={() => { if (checkpointToken.current === undefined) return; setCheckpointPending(true); setCheckpointError(''); post({ type: 'clearCheckpoint', base: graph.base, head: graph.head, token: checkpointToken.current }); }} read={file => navigate({ file })}/>
            <h2 className="overview-list-title">All files <small>{indexedFiles.length} of {graph.files.length} · navigator filters apply to this list only</small></h2><div className="overview-files">{indexedFiles.map(file => {
              const units = reviewUnits(graph, file.path), kind = fileCategory(file.path);
              const churn = graph.metadata?.churn?.find(entry => entry.path === file.path);
              return <article className="overview-card" key={file.path}><div><span className="file-status">{file.status}</span><span>{kind === 'production' ? 'Source / other' : kind}</span></div><h2>{file.path}</h2><p>{file.oldPath ? `Renamed from ${file.oldPath}` : `${units.length} owning function changes`}{isExcluded(file.path, exclusions) ? ' · excluded from exploration' : ''}</p>{churn && <p>{churn.added === null || churn.deleted === null ? 'Binary · line counts unavailable' : `+${churn.added} / −${churn.deleted} lines`}</p>}<button type="button" onClick={() => navigate({ file: file.path })}>Read file changes</button></article>;
            })}</div>{!graph.files.length && <p className="pad">No file differences in this comparison. Select a different After branch or comparison mode.</p>}
          </div>
          <div className="reading-surface" hidden={screen !== 'read'}>{location && <>
            <div className="reading-heading"><div><small>{current ? 'FUNCTION IMPLEMENTATION' : 'COMPLETE FILE COMPARISON'}</small><h2>{current?.name ?? activeFile?.split('/').pop()}</h2><p>{activeFile}{current?.status === 'context' ? ' · unchanged context' : ''}{activeFile && isExcluded(activeFile, exclusions) ? ' · excluded from map, still readable' : ''}</p></div><div className="file-stepping"><button type="button" aria-label="Previous changed file" disabled={fileIndex <= 0} onClick={() => { const file = graph.files[fileIndex - 1]; if (file) navigate({ file: file.path }); }}>Previous file</button><button type="button" aria-label="Next changed file" disabled={fileIndex < 0 || fileIndex >= graph.files.length - 1} onClick={() => { const file = graph.files[fileIndex + 1]; if (file) navigate({ file: file.path }); }}>Next file</button></div></div>
            <div className="reading-options"><div className="reader-modes">{(['compare', 'before', 'after'] as const).map(value => <button type="button" key={value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}>{value}</button>)}</div>{mode === 'compare' && <><label><input type="checkbox" checked={highlight} onChange={event => setHighlight(event.target.checked)}/> Highlight changes</label><label><input type="checkbox" checked={fold} onChange={event => setFold(event.target.checked)}/> Fold unchanged context</label></>}<button type="button" onClick={() => setShowNotes(!showNotes)}>{showNotes ? 'Hide note' : 'Review note'}</button>{current && <button type="button" disabled={!host || !(mode === 'before' ? current.before : current.after)} onClick={() => post({ type: 'openSource', id: current.id, revision: mode === 'before' ? 'before' : 'after' })}>Open historical source</button>}</div>
            {current ? <div className="context-actions"><button type="button" onClick={() => navigate({ file: current.file })}>Read full file context</button><button type="button" disabled={isExcluded(current.file, exclusions)} onClick={() => startInvestigation(current)}>Explore this function</button><span>{neighbors(graph, current.id, 'callers', revision, exclusions).length} incoming · {neighbors(graph, current.id, 'dependencies', revision, exclusions).length} outgoing in {revision}</span></div> : <div className="function-jumps"><span>Function changes</span>{reviewUnits(graph, location.file).map(node => <button type="button" key={node.id} onClick={() => readNode(node)}>{node.name}</button>)}{!reviewUnits(graph, location.file).length && <span>No separate function changes—review this file once.</span>}</div>}
            {!current && activeFile && <FileSymbols key={`${graphId}:${activeFile}`} graph={graph} path={activeFile} read={readNode}/>}
            {current && <div className="connected-toggle"><button type="button" aria-expanded={showConnections} onClick={() => setShowConnections(!showConnections)}>{showConnections ? 'Hide connections' : 'Show connections'}</button><span>Follow related diffs without leaving the reader.</span></div>}
            {current && showConnections && <ConnectedChanges key={`${graphId}:${current.id}`} graph={graph} current={current} revision={revision} setRevision={setRevision} exclusions={exclusions} read={node => navigate({ file: node.file, node: node.id }, 'read', 'compare')}/>}
            {incomplete && <p className="source-coverage" role="alert">Incomplete file comparison: {fileSource?.unavailable ?? 'A function revision is unavailable in the bounded source index'}. An empty pane may mean unavailable source—not an addition/deletion.</p>}
            {before || after ? <SourceReader key={`${graphId}:${scrollKey}`} before={before} after={after} mode={mode} highlight={highlight && !incomplete} fold={fold} incomplete={incomplete} saved={scroll.current.get(scrollKey)} remember={saveScroll} targetLine={location.targetLine}/> : <div className="source-unavailable"><h3>Source is not available for this file</h3><p>{fileSource?.unavailable ?? 'This file is not in the bounded text-source index. Binary, sensitive, unsupported, or oversized files remain in the inventory but are not loaded.'}</p><p>Review it in your repository’s normal diff viewer. It has not been marked reviewed or omitted from the comparison.</p></div>}
            {current && ownedNodes(graph, current.id).length > 1 && <details className="nested-symbols"><summary>Nested symbols ({ownedNodes(graph, current.id).length - 1}) · included in this implementation</summary>{ownedNodes(graph, current.id).filter(node => node.id !== current.id).map(node => <button type="button" key={node.id} onClick={() => readNode(node)}>{node.name} · {node.status}</button>)}</details>}
            {showNotes && <div className="review-note"><label htmlFor="review-note">Local review note · not verification</label><textarea id="review-note" value={canvas.notes[key] ?? ''} onChange={event => setNote(event.target.value)}/></div>}
          </>}</div>
          {root && <div className="exploration-surface" hidden={screen !== 'explore'}><div className="exploration-options"><button type="button" onClick={() => setScreen('read')}>Return to code</button><label>Trace snapshot<select aria-label="Relationship revision" value={revision} onChange={event => setRevision(event.target.value === 'before' ? 'before' : 'after')}><option value="after">After</option><option value="before">Before</option></select></label><span>Read code does not reset this investigation.</span></div><Investigation key={`${graphId}:${root}:${revision}`} graph={graph} root={root} revision={revision} exclusions={exclusions} read={readInvestigation} reference={readReference}/></div>}
        </>}
      </section>
    </div>
    {showExclusions && <ExclusionsDialog patterns={exclusions} apply={applyExclusions} close={() => setShowExclusions(false)}/>}
    {showScope && <div className="scope-backdrop"><section role="dialog" aria-modal="true" aria-label="Analysis scope" className="scope-panel"><button type="button" onClick={() => setShowScope(false)}>Close scope</button><h2>Source evidence, not runtime execution</h2>{graph?.warnings.map(warning => <p key={warning}>{warning}</p>)}<p>The source index is bounded. No resolved callers does not mean unused. Calls through DI, callbacks, JSX and network boundaries may be unresolved. Nothing here runs inspected repository code.</p><p>{graph?.unresolvedCalls ?? 0} unresolved call expressions in After.</p></section></div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Workspace/>);
