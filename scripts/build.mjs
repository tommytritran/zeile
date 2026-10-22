import { build, context } from 'esbuild';
import { build as viteBuild } from 'vite';
const watch = process.argv.includes('--watch');
const options = {
  entryPoints: { extension: 'src/extension.ts', 'analysis-worker': 'src/analysis-worker.ts' },
  outdir: 'dist', outExtension: { '.js': '.cjs' }, bundle: true,
  platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], sourcemap: true,
};

if (!watch) {
  await build(options);
  await viteBuild();
} else {
  let extensionReady = false, webviewReady = false;
  const report = () => {
    if (!stopping && extensionReady && webviewReady) console.log('[zeile-watch] ready');
  };
  console.log('[zeile-watch] building');
  const bundler = await context({ ...options, plugins: [{
    name: 'zeile-watch',
    setup(build) {
      build.onStart(() => { extensionReady = false; console.log('[zeile-watch] building extension'); });
      build.onEnd(result => {
        extensionReady = result.errors.length === 0;
        if (extensionReady) console.log('[zeile-watch] extension built');
        report();
      });
    }
  }] });
  let watcher;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await Promise.all([bundler.dispose(), watcher?.close()]);
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  try {
    watcher = await viteBuild({ build: { watch: {} } });
    let webviewFailed = false;
    watcher.on('event', event => {
      if (event.code === 'START') { webviewReady = false; webviewFailed = false; console.log('[zeile-watch] building webview'); }
      if (event.code === 'ERROR') { webviewReady = false; webviewFailed = true; console.error(event.error); }
      if (event.code === 'END' && !webviewFailed) { webviewReady = true; console.log('[zeile-watch] webview built'); report(); }
    });
    await bundler.watch();
  } catch (error) {
    await stop();
    throw error;
  }
}
