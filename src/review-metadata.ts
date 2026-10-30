import { git } from './git';
import type { ReviewMetadata } from './model';

/** With -z a rename has an empty path followed by old and new NUL fields. */
export function parseNumstat(output: string): NonNullable<ReviewMetadata['churn']> {
  const fields = output.split('\0');
  const result: NonNullable<ReviewMetadata['churn']> = [];
  for (let i = 0; i < fields.length && fields[i];) {
    const record = fields[i++];
    const first = record.indexOf('\t'), second = record.indexOf('\t', first + 1);
    if (first < 0 || second < 0) throw new Error('Invalid numstat record');
    let path = record.slice(second + 1);
    if (!path) { const oldPath = fields[i++]; path = fields[i++]; if (!oldPath || !path) throw new Error('Invalid numstat rename'); }
    const count = (value: string) => {
      if (value === '-') return null;
      if (!/^\d+$/.test(value)) throw new Error('Invalid numstat count');
      return Number(value);
    };
    result.push({ path, added: count(record.slice(0, first)), deleted: count(record.slice(first + 1, second)) });
  }
  return result;
}

export async function reviewMetadata(repo: string, base: string, head: string): Promise<ReviewMetadata> {
  const result: ReviewMetadata = { unavailable: [] };
  await Promise.all([
    (async () => {
      try { result.churn = parseNumstat(await git(repo, ['diff', '--no-ext-diff', '--no-textconv', '--numstat', '-z', '--find-renames', base, head, '--'])); }
      catch { result.unavailable.push('Git line-change metadata could not be loaded.'); }
    })(),
    (async () => {
      try {
        const range = `${base}..${head}`;
        const [count, log] = await Promise.all([
          git(repo, ['rev-list', '--count', range, '--']),
          git(repo, ['log', '-20', '--no-show-signature', '--encoding=UTF-8', '--format=%H%x00%an%x00%aI%x00%s%x00', range, '--'])
        ]);
        if (!/^\d+$/.test(count.trim())) throw new Error('Invalid commit count');
        const fields = log.split('\0');
        const recent: NonNullable<ReviewMetadata['commits']>['recent'] = [];
        for (let i = 0; i + 3 < fields.length; i += 4) recent.push({ sha: fields[i].trim(), author: fields[i + 1], date: fields[i + 2], subject: fields[i + 3] });
        result.commits = { total: Number(count.trim()), recent };
      } catch { result.unavailable.push('Git commit metadata could not be loaded.'); }
    })()
  ]);
  return result;
}
