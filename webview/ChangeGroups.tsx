import { useMemo, useState } from 'react';
import type { ReviewGraph, ReviewNode } from '../src/model';
import { changeGroups } from '../src/connected-changes';
import type { InvestigationRevision } from '../src/review-units';

export function ChangeGroups({ graph, read }: { graph: ReviewGraph; read: (node: ReviewNode, revision: InvestigationRevision) => void }) {
  const [revision, setRevision] = useState<InvestigationRevision>('after');
  const groups = useMemo(() => changeGroups(graph, revision), [graph, revision]);
  return <section className="change-groups" aria-label="Related change groups"><div className="group-heading"><div><span className="eyebrow">READ BY CONNECTION, NOT FILENAME</span><h1>Related changes</h1></div><label>Group references in <select aria-label="Change group revision" value={revision} onChange={event => setRevision(event.target.value === 'before' ? 'before' : 'after')}><option value="after">After</option><option value="before">Before</option></select></label></div><p>Automatically linked changed files, using source references and at most one unchanged intermediate. Groups may overlap real workflows; they are not inferred execution sequences. Tests, documentation, unlinked changes and unsupported sources remain in All files below.</p>{!groups.length && <p>No cross-file change groups resolved in this snapshot. Use All files to start reading; missing connections do not imply independence.</p>}<div className="group-list">{groups.map(group => <article className="change-group" key={group.entry.id}><div><strong>{group.files.length} connected files</strong><small>{group.links} grouping connections · starting at {group.entry.name}</small></div><ul>{group.files.map(path => <li key={path}>{path}</li>)}</ul><button type="button" onClick={() => read(group.entry, revision)}>Read connected diffs</button></article>)}</div></section>;
}
