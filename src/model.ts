export type ChangeStatus = 'added' | 'removed' | 'modified' | 'context';
export interface SourceVersion { path: string; line: number; code: string; signature: string }
export interface ReviewNode {
  id: string; file: string; name: string; kind: 'function' | 'module'; status: ChangeStatus;
  before?: SourceVersion; after?: SourceVersion;
}
export interface ReviewEdge {
  id: string; source: string; target: string; revision: 'before' | 'after' | 'both';
  kind: 'resolved' | 'declaration'; label: string;
}
export interface ChangedFile { path: string; oldPath?: string; status: string; represented: boolean }
export interface ReviewGraph {
  repository: string; base: string; head: string; baseLabel: string; headLabel: string;
  nodes: ReviewNode[]; edges: ReviewEdge[]; files: ChangedFile[]; warnings: string[];
  unresolvedCalls: number;
}
export interface Point { x: number; y: number }
export interface ManualEdge { id: string; source: string; target: string; label: string }
export interface CanvasState {
  positions: Record<string, Point>; collapsed: string[]; manualEdges: ManualEdge[];
  notes: Record<string, string>; pinned: string[];
}
export type ToHost =
  | { type: 'ready' } | { type: 'refresh' } | { type: 'selectComparison' }
  | { type: 'saveLayout'; state: CanvasState }
  | { type: 'openSource'; id: string; revision: 'before' | 'after' }
  | { type: 'openDiff'; id: string };
export type ToWebview =
  | { type: 'loading'; message: string }
  | { type: 'error'; message: string }
  | { type: 'graph'; graph: ReviewGraph; state?: CanvasState };
export const emptyCanvas = (): CanvasState => ({ positions: {}, collapsed: [], manualEdges: [], notes: {}, pinned: [] });

export function validCanvas(value: unknown): value is CanvasState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 5000 && v.every(x => typeof x === 'string' && x.length < 2000);
  if (!strings(s.collapsed) || !strings(s.pinned) || !Array.isArray(s.manualEdges) || s.manualEdges.length > 5000) return false;
  if (!s.positions || typeof s.positions !== 'object' || !s.notes || typeof s.notes !== 'object') return false;
  const positions = Object.entries(s.positions);
  const notes = Object.entries(s.notes);
  return positions.length <= 5000 && notes.length <= 5000 && positions.every(([k, p]) =>
    k.length < 2000 && p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e7 && Math.abs(p.y) < 1e7) &&
    notes.every(([k, v]) => k.length < 2000 && typeof v === 'string' && v.length <= 10000) &&
    s.manualEdges.every(e => e && typeof e === 'object' && ['id', 'source', 'target', 'label'].every(k => typeof e[k] === 'string' && e[k].length < 2000));
}
