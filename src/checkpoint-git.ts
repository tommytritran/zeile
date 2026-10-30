import { changedFiles, git } from './git';
import { checkpointMismatch, type CheckpointView, type ReviewCheckpoint } from './checkpoint';
import type { ReviewGraph } from './model';

/** HEAD must resolve to a branch identity, not follow the user between branches. */
export async function checkpointAfterRef(repository: string, ref: string, head: string): Promise<string> {
  if (ref !== 'HEAD') return ref;
  try { return (await git(repository, ['symbolic-ref', '--quiet', 'HEAD'])).trim() || head; }
  catch { return head; }
}

export async function checkpointChanges(repository: string, checkpoint: ReviewCheckpoint, graph: ReviewGraph): Promise<CheckpointView> {
  const unavailable = checkpointMismatch(checkpoint, graph);
  if (unavailable) return { checkpoint, files: [], unavailable };
  if (checkpoint.head === graph.head) return { checkpoint, files: [] };
  try {
    await git(repository, ['merge-base', '--is-ancestor', checkpoint.head, graph.head]);
    return { checkpoint, files: await changedFiles(repository, checkpoint.head, graph.head) };
  } catch {
    return { checkpoint, files: [], unavailable: 'The saved commit is missing, history was rewritten, or Git could not compare it. Replace the checkpoint to start again.' };
  }
}
