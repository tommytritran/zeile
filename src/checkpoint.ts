import type { ChangedFile, ReviewGraph } from './model';

export interface ReviewCheckpoint { version: 1; base: string; head: string; savedAt: string }
export interface CheckpointView {
  checkpoint?: ReviewCheckpoint;
  files: ChangedFile[];
  unavailable?: string;
}

export function validCheckpoint(value: unknown): value is ReviewCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.version === 1 && typeof item.base === 'string' && /^[a-f0-9]{40,64}$/.test(item.base) &&
    typeof item.head === 'string' && /^[a-f0-9]{40,64}$/.test(item.head) &&
    typeof item.savedAt === 'string' && item.savedAt.length <= 30 && Number.isFinite(Date.parse(item.savedAt));
}

export function checkpointScope(repository: string, before: string, after: string, kind: string): string {
  return JSON.stringify([repository, before, after, kind]);
}

export function checkpointBaseline(graph: ReviewGraph, savedAt = new Date().toISOString()): ReviewCheckpoint {
  return { version: 1, base: graph.base, head: graph.head, savedAt };
}

export function checkpointMismatch(checkpoint: ReviewCheckpoint, graph: ReviewGraph): string | undefined {
  if (checkpoint.base !== graph.base) return 'The comparison baseline changed. Replace the checkpoint to start again; no incremental comparison is shown.';
  return undefined;
}
