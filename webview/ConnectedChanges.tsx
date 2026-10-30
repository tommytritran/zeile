import { useMemo, useState } from 'react';
import type { ReviewGraph, ReviewNode } from '../src/model';
import { connectedReferences, type ConnectedReference } from '../src/connected-changes';
import type { InvestigationRevision } from '../src/review-units';
import { isExcluded } from '../src/visibility';

export function ConnectedChanges({ graph, current, revision, setRevision, read, exclusions }: {
  graph: ReviewGraph; current: ReviewNode; revision: InvestigationRevision; setRevision: (revision: InvestigationRevision) => void; read: (node: ReviewNode) => void; exclusions: string[];
}) {
  const references = useMemo(() => connectedReferences(graph, current.id, revision), [graph, current.id, revision]);
  const [expanded, setExpanded] = useState(false);
  const render = (entries: ConnectedReference[], direction: string) => {
    const production = entries.filter(entry => !entry.test), tests = entries.filter(entry => entry.test);
    const item = (entry: ConnectedReference) => <li key={entry.node.id}><button type="button" className="connected-node" title={`${entry.node.name}\n${entry.node.file}`} onClick={() => read(entry.node)}><strong>{entry.node.name}</strong><small>{entry.node.file}</small><span>{entry.node.status === 'context' ? 'Unchanged bridge' : entry.node.status} · {entry.edges.some(edge => edge.kind === 'declaration') ? 'declaration · dispatch uncertain' : 'resolved reference'} · {entry.edges.every(edge => edge.revision === 'both') ? 'shared reference' : `${revision}-only reference`}{entry.nested ? ' · inside nested implementation' : ''}{isExcluded(entry.node.file, exclusions) ? ' · excluded from exploration, still readable' : ''}</span></button><details className="connection-evidence"><summary>Reference evidence</summary>{entry.edges.map(edge => <p key={edge.id}>{edge.sites?.filter(site => site.revision === revision).map(site => `${site.path}:L${site.line}`).join(' · ') || 'Call-site location not provided'}</p>)}</details></li>;
    return <section className="connected-column" aria-label={direction}><h3>{direction} <span>{production.length}</span></h3><ul>{production.map(item)}</ul>{!production.length && <p className="connected-empty">No production references resolved in this snapshot. This is not proof none exist.</p>}{tests.length > 0 && <details className="connected-tests"><summary>Test references ({tests.length}) · not test results</summary><ul>{tests.map(item)}</ul></details>}</section>;
  };
  return <section className="connected-reading" aria-label="Connected change reading"><div className="connected-heading"><div><strong>Read connected changes</strong><small>Arrows show source references, not execution order. Each node opens its Before/After diff.</small></div><label>References in <select aria-label="Connected reference revision" value={revision} onChange={event => setRevision(event.target.value === 'before' ? 'before' : 'after')}><option value="after">After</option><option value="before">Before</option></select></label><button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Compact connections' : 'Expand connections'}</button></div><div className={`connected-graph${expanded ? ' expanded' : ''}`}>
    {render(references.callers, 'Referenced by')}<div className="connected-center"><span aria-hidden="true">→</span><div><strong>{current.name}</strong><small>{current.file}</small><span>{current.status === 'context' ? 'Unchanged context' : current.status} · selected diff</span></div><span aria-hidden="true">→</span></div>{render(references.dependencies, 'References')}
  </div></section>;
}
