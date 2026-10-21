import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChangedFile } from './model';
const exec = promisify(execFile);
export async function git(cwd: string, args: string[]): Promise<string> {
  const result = await exec('git', ['--no-pager', ...args], {
    cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_MASTER: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }
  });
  return result.stdout;
}
export async function resolveCommit(repo: string, ref: string): Promise<string> {
  if (!ref.trim() || ref.length > 1000) throw new Error('Enter a valid Git revision.');
  return (await git(repo, ['rev-parse', '--verify', '--end-of-options', `${ref.trim()}^{commit}`])).trim();
}
export function parseChangedFiles(output: string): ChangedFile[] {
  const fields = output.split('\0');
  const files: ChangedFile[] = [];
  for (let i = 0; i < fields.length && fields[i];) {
    const status = fields[i++];
    const first = fields[i++];
    if (!first) throw new Error('Invalid Git file status output.');
    if (/^[RC]/.test(status)) {
      const path = fields[i++];
      if (!path) throw new Error('Invalid Git rename output.');
      files.push({ path, oldPath: first, status, represented: false });
    } else files.push({ path: first, status, represented: false });
  }
  return files;
}
export async function changedFiles(repo: string, base: string, head: string): Promise<ChangedFile[]> {
  return parseChangedFiles(await git(repo, ['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', '--find-renames', base, head, '--']));
}
export interface Snapshot { sources: Map<string, string>; warnings: string[] }
export async function readSnapshot(repo: string, commit: string, priorityPaths: string[] = []): Promise<Snapshot> {
  const listing = await git(repo, ['ls-tree', '-r', '-z', '-l', commit]);
  const sources = new Map<string, string>();
  const warnings: string[] = [];
  let total = 0;
  const priority = new Set(priorityPaths);
  const records = listing.split('\0').filter(Boolean).sort((a, b) => {
    const pathA = a.slice(a.indexOf('\t') + 1), pathB = b.slice(b.indexOf('\t') + 1);
    return Number(priority.has(pathB)) - Number(priority.has(pathA));
  });
  for (const record of records) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const [mode, type, hash, sizeText] = record.slice(0, tab).trim().split(/\s+/);
    const path = record.slice(tab + 1);
    if (!/\.(?:[cm]?[jt]sx?|json)$/.test(path) || /(^|\/)(node_modules|vendor|dist|build|\.git)\//.test(path)) continue;
    if (type !== 'blob' || mode === '120000') continue;
    const size = Number(sizeText);
    if (size > 512000 || total + size > 16 * 1024 * 1024 || sources.size >= 1500) {
      warnings.push(`Snapshot limit: skipped ${path}. Analysis is incomplete (1,500 files / 16 MB / 500 KB per file).`);
      continue;
    }
    total += size;
    const content = await git(repo, ['cat-file', 'blob', hash]);
    if (!content.includes('\0')) sources.set(path, content);
  }
  return { sources, warnings: warnings.slice(0, 8).concat(warnings.length > 8 ? [`${warnings.length - 8} additional files skipped.`] : []) };
}
