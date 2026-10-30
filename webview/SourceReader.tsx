import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { MergeView } from '@codemirror/merge';
import type { SourceVersion } from '../src/model';

const colors = HighlightStyle.define([
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
const theme = EditorView.theme({ '&': { backgroundColor: '#141a20', color: '#d5dfe4', height: '100%', fontSize: '12px' }, '.cm-content': { fontFamily: 'var(--vscode-editor-font-family, ui-monospace, monospace)', padding: '12px 0' }, '.cm-gutters': { backgroundColor: '#11171d', color: '#8195a2', border: 'none' }, '.cm-scroller': { overflow: 'auto' } }, { dark: true });
function extensions(version: SourceVersion | undefined) {
  const code = version && /\.[cm]?[jt]sx?$/.test(version.path);
  return [code ? javascript({ typescript: true, jsx: true }) : [], syntaxHighlighting(colors), lineNumbers({ formatNumber: line => String(line + (version?.line ?? 1) - 1) }), EditorState.readOnly.of(true), EditorView.editable.of(false), theme];
}
export interface ReadingScroll { a: number; b: number; outer: number; leftA: number; leftB: number }
export function SourceReader({ before, after, mode, highlight, fold, saved, remember, targetLine, incomplete = false }: {
  before?: SourceVersion; after?: SourceVersion; mode: 'compare' | 'before' | 'after'; highlight: boolean; fold: boolean;
  saved?: ReadingScroll; remember: (position: ReadingScroll) => void; targetLine?: number; incomplete?: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const merge = useRef<MergeView | null>(null);
  const single = useRef<EditorView | null>(null);
  const latest = useRef({ saved, remember, highlight, targetLine }); latest.current = { saved, remember, highlight, targetLine };
  const [chunks, setChunks] = useState(0);
  const [active, setActive] = useState(-1);
  useLayoutEffect(() => {
    if (!parent.current) return;
    const host = parent.current;
    const rememberPosition = latest.current.remember;
    if (mode === 'compare') {
      const view = new MergeView({ a: { doc: before?.code ?? '', extensions: extensions(before) }, b: { doc: after?.code ?? '', extensions: extensions(after) }, parent: host,
        highlightChanges: latest.current.highlight, gutter: latest.current.highlight, collapseUnchanged: fold ? { margin: 3, minSize: 6 } : undefined });
      merge.current = view; setChunks(view.chunks.length); setActive(-1);
    } else {
      const version = mode === 'before' ? before : after;
      single.current = new EditorView({ doc: version?.code ?? '', extensions: extensions(version), parent: host });
      setChunks(0); setActive(-1);
    }
    const position = latest.current.saved;
    let restoring = !!position;
    const restore = () => {
      if (merge.current && position) { merge.current.a.scrollDOM.scrollTo(position.leftA, position.a); merge.current.b.scrollDOM.scrollTo(position.leftB, position.b); merge.current.dom.scrollTop = position.outer; }
      if (single.current && position) single.current.scrollDOM.scrollTo(position.leftA, position.a);
      if (!position && latest.current.targetLine !== undefined) {
        const view = single.current;
        const version = mode === 'before' ? before : after;
        if (view) { const line = Math.max(1, Math.min(view.state.doc.lines, latest.current.targetLine - (version?.line ?? 1) + 1)); view.dispatch({ selection: { anchor: view.state.doc.line(line).from }, effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'center' }) }); }
      }
    };
    // Restore after CodeMirror has measured its virtualized content, rather than
    // ignoring real scroll events for an arbitrary interval after mounting.
    (merge.current?.a ?? single.current)?.requestMeasure({ read: () => null, write: () => { restore(); restoring = false; } });
    const save = () => {
      if (restoring || !host.isConnected || host.closest('[hidden]')) return;
      const a = merge.current?.a ?? single.current, b = merge.current?.b;
      rememberPosition({ a: a?.scrollDOM.scrollTop ?? 0, b: b?.scrollDOM.scrollTop ?? 0, outer: merge.current?.dom.scrollTop ?? 0, leftA: a?.scrollDOM.scrollLeft ?? 0, leftB: b?.scrollDOM.scrollLeft ?? 0 });
    };
    host.addEventListener('scroll', save, true);
    // Layout cleanup runs before React detaches the DOM and resets scrollTop.
    // Keep the callback captured for this source, not a later cache key.
    return () => { save(); host.removeEventListener('scroll', save, true); merge.current?.destroy(); single.current?.destroy(); merge.current = null; single.current = null; };
  }, [before, after, mode, fold]);
  useEffect(() => { merge.current?.reconfigure({ highlightChanges: highlight, gutter: highlight }); }, [highlight]);
  const move = (direction: number) => {
    const view = merge.current;
    if (!view?.chunks.length) return;
    const next = (active < 0 ? direction < 0 ? view.chunks.length - 1 : 0 : active + direction + view.chunks.length) % view.chunks.length;
    const chunk = view.chunks[next];
    for (const [editor, offset] of [[view.a, chunk.fromA], [view.b, chunk.fromB]] as const) { const pos = Math.min(offset, editor.state.doc.length); editor.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) }); }
    setActive(next);
  };
  return <div className={`source-reader ${highlight ? '' : 'clean-comparison'}`}>
    {mode === 'compare' && <><div className="comparison-tools"><span>{incomplete ? 'Incomplete source coverage — not a definitive diff' : chunks ? `${chunks} change ${chunks === 1 ? 'region' : 'regions'}` : 'No source changes'}</span><div><button type="button" aria-label="Previous change" disabled={!chunks} onClick={() => move(-1)}>↑</button><output aria-live="polite">{active < 0 ? '—' : active + 1} / {chunks}</output><button type="button" aria-label="Next change" disabled={!chunks} onClick={() => move(1)}>↓</button></div></div><div className="revision-headings">{([['Before', before], ['After', after]] as const).map(([label, version]) => <div key={label}><strong>{label}</strong><span>{version ? `${version.path} · L${version.line}` : incomplete ? 'Source unavailable in indexed snapshot' : 'Not present in this revision'}</span></div>)}</div></>}
    {mode !== 'compare' && !(mode === 'before' ? before : after) && <p className="source-absence">{incomplete ? 'Source unavailable in indexed snapshot' : 'Not present in this revision'}</p>}
    <div ref={parent} className={`source-editors ${mode === 'compare' ? 'merge-editor' : 'code-editor'}`}/>
  </div>;
}
