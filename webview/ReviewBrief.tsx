import type { ReviewGraph } from '../src/model';
import { fileCategory } from '../src/review-focus';

const fileStatuses = [{ code: 'A', label: 'added' }, { code: 'M', label: 'modified' }, { code: 'D', label: 'deleted' }, { code: 'R', label: 'renamed' }, { code: 'C', label: 'copied' }, { code: 'T', label: 'type changed' }];

export function ReviewBrief({ graph, read }: { graph: ReviewGraph; read: (path: string) => void }) {
  const churn = graph.metadata?.churn;
  const commits = graph.metadata?.commits;
  const totals = churn?.reduce((sum, file) => ({ added: sum.added + (file.added ?? 0), deleted: sum.deleted + (file.deleted ?? 0), binary: sum.binary + Number(file.added === null || file.deleted === null) }), { added: 0, deleted: 0, binary: 0 });
  const directories = new Map<string, number>();
  for (const file of graph.files) { const directory = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '(repository root)'; directories.set(directory, (directories.get(directory) ?? 0) + 1); }
  const areas = [...directories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const gaps = graph.files.filter(file => {
    const source = graph.fileSources?.[file.path];
    return !source || source.unavailable || (!file.status.startsWith('A') && !source.before) || (!file.status.startsWith('D') && !source.after);
  });
  return <section className="review-brief" aria-label="Review brief">
    <div className="overview-heading"><span className="eyebrow">COMPARISON BRIEF</span><h1>{graph.repository}</h1><p>Scope, provenance, and reading context for this comparison.</p></div>
    <section className="brief-provenance" aria-label="Comparison provenance"><h2>{graph.comparison?.kind === 'pr' ? 'Merge base → feature tip' : graph.comparison?.kind === 'exact' ? 'Exact branch snapshots' : 'Comparison basis not provided'}</h2>
      <dl><div><dt>Target · {graph.baseLabel.replace(/ \(merge-base\)$/, '')}</dt><dd>{graph.comparison?.target ?? 'Target commit not provided'}</dd></div><div><dt>Effective Before{graph.comparison?.kind === 'pr' ? ' · merge base' : ''}</dt><dd>{graph.base}</dd></div><div><dt>After · {graph.headLabel}</dt><dd>{graph.head}</dd></div></dl>
      <p>Local committed refs only. No fetch is performed. Remote freshness and matching GitHub PR endpoints are not verified; uncommitted edits are excluded.</p>
    </section>
    <section className="brief-metrics" aria-label="Whole comparison totals">
      <div><strong>{graph.files.length}</strong><span>changed files</span><small>{fileStatuses.map(status => `${graph.files.filter(file => file.status.startsWith(status.code)).length} ${status.label}`).join(' · ')}</small></div>
      <div><strong>{totals ? `+${totals.added} / −${totals.deleted}` : 'Unavailable'}</strong><span>text lines added / deleted</span><small>{totals ? `${totals.binary} binary files excluded from line totals` : 'Git line metadata not provided'}</small></div>
      <div><strong>{commits?.total ?? 'Unavailable'}</strong><span>commits in Before..After</span><small>{commits ? `${new Set(commits.recent.map(commit => commit.author)).size} author names in ${commits.recent.length} displayed commits` : 'Git commit metadata not provided'}</small></div>
    </section>
    <div className="brief-columns"><section><h2>Where the change sits</h2><p>Files grouped by directory—not inferred architecture. Totals ignore navigator filters.</p><ul className="brief-areas">{areas.map(([path, count]) => <li key={path}><code>{path}</code><span>{count} files</span><meter min={0} max={Math.max(graph.files.length, 1)} value={count} aria-label={`${path}: ${count} changed files`}/></li>)}</ul><p>{graph.files.filter(file => fileCategory(file.path) === 'tests').length} test files · {graph.files.filter(file => fileCategory(file.path) === 'generated').length} generated files · {graph.files.filter(file => fileCategory(file.path) === 'production').length} other files. Path-based categories; tests have not been executed by Zeile.</p></section>
      <section><h2>Reading coverage</h2><p>{graph.files.length - gaps.length} complete file sources · {gaps.length} incomplete or unavailable. This is source availability, not review progress.</p>{gaps.length > 0 && <details><summary>Files needing another diff viewer ({gaps.length})</summary><ul className="brief-gaps">{gaps.map(file => <li key={file.path}><button type="button" onClick={() => read(file.path)}>{file.path}</button><small>{graph.fileSources?.[file.path]?.unavailable ?? 'Complete file sources not provided'}</small></li>)}</ul></details>}<p>{graph.unresolvedCalls} unresolved call expressions in the After source index. Relationships are static evidence, not complete impact coverage.</p>{graph.metadata?.unavailable.map(message => <p className="brief-warning" key={message}>{message}</p>)}</section></div>
    <details className="brief-commits"><summary>Commit context{commits ? ` · showing ${commits.recent.length} of ${commits.total}` : ' · unavailable'}</summary><p>Commits reachable from After but not effective Before. Up to 20 most recent; merge commits may be included. Commit messages describe author intent, not verified behavior.</p>{commits?.recent.map(commit => <article key={commit.sha}><strong>{commit.subject}</strong><small><code title={commit.sha}>{commit.sha.slice(0, 8)}</code> · {commit.author} · <time dateTime={commit.date}>{commit.date}</time></small></article>)}</details>
  </section>;
}
