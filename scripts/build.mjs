import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
await build({
  entryPoints: { extension: 'src/extension.ts', 'analysis-worker': 'src/analysis-worker.ts' },
  outdir: 'dist', outExtension: { '.js': '.cjs' }, bundle: true,
  platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], sourcemap: true,
});
await viteBuild();
