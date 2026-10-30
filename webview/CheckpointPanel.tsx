import type { CheckpointView } from '../src/checkpoint';
import type { ReviewGraph } from '../src/model';

export function CheckpointPanel({ graph, view, error, pending, enabled, save, clear, read }: {
  graph: ReviewGraph; view?: CheckpointView; error?: string; pending: boolean; enabled: boolean;
  save: () => void; clear: () => void; read: (path: string) => void;
}) {
  const checkpoint = view?.checkpoint;
  return <section className="checkpoint-panel" aria-label="Local review checkpoint">
    <div className="checkpoint-heading"><div><h2>Since your checkpoint</h2><p>A local comparison baseline—not a reviewed, approved, or verified status.</p></div>
      <div className="checkpoint-actions"><button type="button" disabled={!enabled || !view || pending} onClick={save}>{checkpoint ? 'Replace checkpoint' : 'Save checkpoint'}</button>
        <button type="button" disabled={!enabled || !view || pending || (!checkpoint && !view.unavailable)} onClick={clear}>Clear checkpoint</button></div></div>
    {!enabled ? <p>Checkpoint comparison requires the VS Code extension and local Git history.</p> : !view ? <p>Loading local checkpoint…</p> : <>
      {checkpoint && <p>Saved <time dateTime={checkpoint.savedAt}>{new Date(checkpoint.savedAt).toLocaleString()}</time> · {checkpoint.head.slice(0, 8)} → {graph.head.slice(0, 8)}</p>}
      {view.unavailable ? <output className="checkpoint-warning">{view.unavailable}</output> : !checkpoint ? <p>Save a checkpoint now. After new commits, Refresh to see which files changed since it.</p> : !view.files.length ? <p>No file differences since this checkpoint. This is not evidence of correctness.</p> : <>
        <p>{view.files.length} files changed since checkpoint. Opening a file shows the <strong>full PR comparison</strong>, not a checkpoint diff. The complete PR inventory remains below.</p>
        <ul>{view.files.map(file => <li key={file.path}><span>{file.status} · {file.path}{file.oldPath ? ` (from ${file.oldPath})` : ''}</span>
          {graph.files.some(current => current.path === file.path) ? <button type="button" onClick={() => read(file.path)}>Read full PR comparison</button> : <small>Not in the current PR inventory; source comparison unavailable here.</small>}</li>)}</ul>
      </>}
    </>}
    {error && <p role="alert">{error}</p>}
    {pending && <output>Updating local checkpoint…</output>}
  </section>;
}
