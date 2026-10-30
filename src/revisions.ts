import { git, resolveCommit } from './git';
import type { BranchOption } from './model';

export interface RevisionChoice { ref: string; label: string; description: string; detail: string; group: string }
export interface Comparison {
  base: string; head: string; baseLabel: string; headLabel: string; mode: 'latest' | 'snapshots';
  kind?: 'pr' | 'exact'; target?: string; mergeBase?: string;
}

export async function listRevisions(repository: string): Promise<RevisionChoice[]> {
  const [branches, commits] = await Promise.all([
    git(repository, ['for-each-ref', '--sort=-committerdate', '--format=%(refname)%00%(refname:short)%00%(HEAD)%00%(symref)', 'refs/heads/', 'refs/remotes/']),
    git(repository, ['log', '-40', '--format=%H%x00%s%x00%an%x00%cs', 'HEAD', '--'])
  ]);
  const choices: RevisionChoice[] = [{ ref: 'HEAD', label: 'Current checked-out commit', description: 'HEAD', detail: 'Last committed code. Uncommitted edits are not included.', group: 'Shortcuts' }];
  for (const line of branches.trim().split('\n').filter(Boolean)) {
    const [ref, label, current, symbolic] = line.split('\0');
    if (symbolic) continue;
    choices.push({ ref, label, description: current?.trim() === '*' ? 'Current branch' : ref.startsWith('refs/remotes/') ? 'Remote-tracking branch · local copy' : 'Local branch', detail: 'Compare the committed snapshot at this branch tip. No checkout or fetch.', group: 'Branches' });
  }
  for (const line of commits.trim().split('\n').filter(Boolean)) {
    const [ref, subject, author, date] = line.split('\0');
    choices.push({ ref, label: subject || '(no commit message)', description: `${ref.slice(0, 7)} · ${date}`, detail: author, group: 'Recent commits on current history' });
  }
  return choices;
}

export async function listBranches(repository: string): Promise<BranchOption[]> {
  const output = await git(repository, ['for-each-ref', '--sort=refname', '--format=%(refname)%00%(refname:short)%00%(symref)', 'refs/heads/', 'refs/remotes/']);
  return output.trim().split('\n').filter(Boolean).flatMap(line => {
    const [ref, label, symbolic] = line.split('\0');
    return symbolic ? [] : [{ ref, label, group: ref.startsWith('refs/remotes/') ? 'Remote branches' as const : 'Local branches' as const }];
  });
}

export async function latestComparison(repository: string): Promise<Comparison | undefined> {
  // A root commit has no parent: let the user choose another comparison instead.
  const parents = (await git(repository, ['rev-list', '--parents', '-n', '1', 'HEAD', '--'])).trim().split(/\s+/);
  if (parents.length < 2) return undefined;
  return { base: parents[1], head: parents[0], baseLabel: 'Before latest commit', headLabel: 'Latest commit', mode: 'latest', kind: 'pr', target: parents[1], mergeBase: parents[1] };
}

export function defaultBeforeBranch(branches: BranchOption[]): BranchOption | undefined {
  for (const ref of ['refs/remotes/origin/main', 'refs/remotes/origin/master', 'refs/heads/main', 'refs/heads/master']) {
    const branch = branches.find(option => option.ref === ref);
    if (branch) return branch;
  }
  return undefined;
}

export async function initialComparison(repository: string, branches: BranchOption[]): Promise<Comparison | undefined> {
  const before = defaultBeforeBranch(branches);
  if (!before) return latestComparison(repository);
  return resolveComparison(repository, before, { ref: 'HEAD', label: 'Current commit (HEAD)' }, true);
}

export async function resolveComparison(repository: string, before: { ref: string; label: string }, after: { ref: string; label: string }, allowIdentical = false, kind: 'pr' | 'exact' = 'pr'): Promise<Comparison> {
  const [target, head] = await Promise.all([resolveCommit(repository, before.ref), resolveCommit(repository, after.ref)]);
  if (target === head && !allowIdentical) throw new Error('These choices point to the same commit. Pick a different Before or After version.');
  if (kind === 'exact') return { base: target, target, head, baseLabel: before.label, headLabel: after.label, mode: 'snapshots', kind };
  let bases: string[];
  try { bases = (await git(repository, ['merge-base', '--all', target, head])).trim().split(/\s+/).filter(Boolean); }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`No merge base could be resolved: ${reason}. Check Git access, choose related branches, or select exact comparison.`);
  }
  if (bases.length !== 1) throw new Error('A unique merge base is required for PR comparison. Choose related branches or select exact comparison.');
  return { base: bases[0], target, head, mergeBase: bases[0], baseLabel: `${before.label} (merge-base)`, headLabel: after.label, mode: 'snapshots', kind };
}

export async function refreshComparison(repository: string, comparison: Comparison | undefined): Promise<Comparison | undefined> {
  return !comparison || comparison.mode === 'latest' ? latestComparison(repository) : comparison;
}
