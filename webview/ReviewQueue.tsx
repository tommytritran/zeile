import type { ReviewGraph } from '../src/model';
import { fileCategory, isReviewChange } from '../src/review-focus';
import { isExcluded } from '../src/visibility';

export function ReviewQueue({ graph, exclusions, selected, includeTests, includeGenerated, setTests, setGenerated, select, editExclusions, scope, reset }: {
  graph?: ReviewGraph; exclusions: string[]; selected?: string; includeTests: boolean; includeGenerated: boolean;
  setTests: (value: boolean) => void; setGenerated: (value: boolean) => void; select: (id: string) => void; editExclusions: () => void; scope: () => void; reset: () => void;
}) {
  const changed = graph?.nodes.filter(node => isReviewChange(node, graph)) ?? [];
  const files = [...new Set(changed.filter(node => !isExcluded(node.file, exclusions) &&
    (fileCategory(node.file) === 'production' || (fileCategory(node.file) === 'tests' ? includeTests : includeGenerated))).map(node => node.file))];
  const count = (category: string) => new Set(changed.filter(node => fileCategory(node.file) === category && !isExcluded(node.file, exclusions)).map(node => node.file)).size;
  return <>
    <div className="rail-title">REVIEW QUEUE <span>{files.length} files</span></div>
    <p className="queue-count">{changed.filter(node => files.includes(node.file)).length} shown / {changed.length} changed nodes</p>
    <div className="queue-controls"><label><input type="checkbox" checked={includeTests} onChange={event => setTests(event.target.checked)}/> Tests ({count('tests')})</label><label><input type="checkbox" checked={includeGenerated} onChange={event => setGenerated(event.target.checked)}/> Generated ({count('generated')})</label><button type="button" onClick={reset}>Reset exploration</button><small>Filename-based categories · no risk scoring</small></div>
    {!files.length && <p className="queue-empty">No mapped changes in this queue. Check the filters and full change index below.</p>}
    {files.map(path => <section className="queue-file" key={path}><h3 title={path}>{path}</h3>{changed.filter(node => node.file === path).map(node => <button type="button" key={node.id} aria-pressed={selected === node.id} className="queue-item" onClick={() => select(node.id)}><strong>{node.name}</strong><span>{node.status === 'context' ? 'file renamed' : node.status}{node.kind === 'module' ? ' · top-level / full file' : ''}{node.before && node.after && node.before.signature !== node.after.signature ? ' · signature differs*' : ''}</span></button>)}</section>)}
    <details className="queue-inventory"><summary>Full change index ({graph?.files.length ?? 0})</summary>{graph?.files.map(file => <button type="button" className={`file-item ${isExcluded(file.path, exclusions) ? 'excluded' : ''}`} key={file.path} title={file.path} onClick={() => {
      if (isExcluded(file.path, exclusions)) editExclusions();
      else { const node = graph.nodes.find(node => node.file === file.path); if (node) select(node.id); else scope(); }
    }}><span className={`file-status ${file.status[0]}`}>{file.status[0]}</span><span>{file.path.split('/').pop()}<small>{file.path}{isExcluded(file.path, exclusions) ? ' · excluded' : !file.represented ? ' · not mapped' : ''}</small></span></button>)}</details>
    <div className="rail-bottom"><span className="eyebrow">LOCAL BY DESIGN</span><p>No AI. No code uploads.<br/>* Inferred signatures can be incomplete.</p></div>
  </>;
}
