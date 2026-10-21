import * as vscode from 'vscode';
import { latestComparison, listRevisions, resolveComparison, type Comparison } from './revisions';
import { resolveCommit } from './git';

interface Choice extends vscode.QuickPickItem { ref?: string; action?: 'manual' }
async function chooseRevision(repository: string, items: Choice[], side: 'Before' | 'After'): Promise<{ ref: string; label: string } | undefined> {
  const selected = await vscode.window.showQuickPick(items, {
    title: `Zeile · ${side === 'Before' ? '1/2 · Before: choose the starting version' : '2/2 · After: choose the version to review'}`,
    placeHolder: side === 'Before' ? 'Search branches or commit messages. This is the original code.' : 'Search branches or commit messages. This is the proposed code.',
    matchOnDescription: true, matchOnDetail: true, ignoreFocusOut: true
  });
  if (!selected) return undefined;
  if (selected.action === 'manual') {
    const ref = await vscode.window.showInputBox({
      title: `Zeile · ${side} · Advanced Git revision`, prompt: 'Enter a branch, tag, or commit SHA already available locally. Nothing is checked out.',
      placeHolder: 'e.g. main, v1.0.0, or a commit SHA', ignoreFocusOut: true,
      validateInput: async value => {
        try { await resolveCommit(repository, value); return undefined; }
        catch { return 'No commit found for this revision. Choose a local branch, tag, or valid commit SHA.'; }
      }
    });
    return ref?.trim() ? { ref: ref.trim(), label: ref.trim() } : undefined;
  }
  return selected.ref ? { ref: selected.ref, label: selected.label } : undefined;
}

export async function pickComparison(repository: string): Promise<Comparison | undefined> {
  const latest = await latestComparison(repository);
  const mode = await vscode.window.showQuickPick([
    ...(latest ? [{ label: '$(git-commit) Review the latest commit', detail: 'Compare the code before your last commit with the code after it.', mode: 'latest' as const }] : []),
    { label: '$(git-compare) Choose two versions', detail: 'Pick Before and After from branches or recent commits. Compares exact snapshots, not changes since branching.', mode: 'choose' as const }
  ], { title: 'Zeile · What would you like to review?', placeHolder: 'Only committed code is included. Your working files stay untouched.', ignoreFocusOut: true });
  if (!mode) return undefined;
  if (mode.mode === 'latest') return latest;
  const revisions = await listRevisions(repository);
  const items: Choice[] = [];
  let group = '';
  for (const revision of revisions) {
    if (revision.group !== group) { group = revision.group; items.push({ label: group, kind: vscode.QuickPickItemKind.Separator }); }
    items.push(revision);
  }
  items.push({ label: 'Advanced', kind: vscode.QuickPickItemKind.Separator }, { label: 'Enter a tag or Git revision…', detail: 'Optional: use a revision that is not listed above.', action: 'manual', alwaysShow: true });
  while (true) {
    const before = await chooseRevision(repository, items, 'Before');
    if (!before) return undefined;
    const after = await chooseRevision(repository, items, 'After');
    if (!after) return undefined;
    let comparison: Comparison;
    try { comparison = await resolveComparison(repository, before, after); }
    catch (error) { await vscode.window.showWarningMessage(error instanceof Error ? error.message : 'Could not resolve the selected versions.'); continue; }
    const confirmation = await vscode.window.showQuickPick([
      { label: '$(check) Open comparison', description: `${comparison.base.slice(0, 7)} → ${comparison.head.slice(0, 7)}`, detail: `Before: ${before.label}  →  After: ${after.label}. Exact snapshots; uncommitted edits are excluded.`, action: 'open' },
      { label: 'Choose different versions', action: 'retry' }
    ], { title: 'Zeile · Confirm Before → After', placeHolder: 'Additions appear in After; removals appear in Before.', ignoreFocusOut: true });
    if (!confirmation) return undefined;
    if (confirmation.action === 'open') return comparison;
  }
}
