import { useEffect, useRef, useState } from 'react';
import { validExclusions } from '../src/visibility';

export function ExclusionsDialog({ patterns, apply, close }: { patterns: string[]; apply: (patterns: string[]) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(patterns.join('\n'));
  const names = [...new Set(text.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
  const valid = validExclusions(names);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="scope-dialog exclusions-dialog" onCancel={close} onClose={close} aria-label="Canvas exclusions"><section className="scope-panel">
    <button type="button" className="icon-button close" aria-label="Close canvas exclusions" onClick={close}>×</button>
    <span className="eyebrow">FOCUS YOUR REVIEW</span><h2>Hide matching files</h2>
    <p>One filename or path fragment per line. Matching is literal and case-insensitive—not a glob or regular expression. For example: <code>.test.</code>, <code>.spec.</code>, <code>__tests__/</code>, or <code>generated</code>.</p>
    <label htmlFor="exclusion-names">Excluded file names / paths</label>
    <textarea id="exclusion-names" rows={8} value={text} maxLength={21000} placeholder={'.test.\n.spec.\n__tests__/\ngenerated'} onChange={event => setText(event.target.value)}/>
    <p className="muted">Saved locally for this repository across comparisons. Files remain in the change index; this only hides canvas nodes and their links. Notes and manual connections are retained.</p>
    {!valid && <p role="alert">Use at most 100 names, each no longer than 200 characters.</p>}
    <div className="exclusion-actions"><button type="button" onClick={() => setText('')}>Clear list</button><button type="button" onClick={close}>Cancel</button><button type="button" className="selected" disabled={!valid} onClick={() => { apply(names); close(); }}>Apply exclusions</button></div>
  </section></dialog>;
}
