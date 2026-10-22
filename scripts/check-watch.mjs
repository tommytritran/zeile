import { spawn } from 'node:child_process';
import { stat, utimes } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Touch timestamps only: validate real rebuilds without rewriting source files.
const child = spawn(process.execPath, ['scripts/build.mjs', '--watch'], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', ready = 0;
child.stdout.on('data', chunk => {
  output += chunk;
  ready = output.split('[zeile-watch] ready').length - 1;
});
child.stderr.on('data', chunk => { output += chunk; });
const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
async function waitFor(predicate, label) {
  const deadline = Date.now() + 30000;
  while (!predicate()) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`${label}\n${output}`);
    await delay(100);
  }
}
async function touchAndCheck(source, artifacts) {
  const marker = source.startsWith('webview/') ? '[zeile-watch] webview built' : '[zeile-watch] extension built';
  const builds = output.split(marker).length;
  const expected = ready + 1;
  const now = new Date();
  await utimes(source, now, now);
  await waitFor(() => ready >= expected, `No successful rebuild after touching ${source}`);
  if (output.split(marker).length <= builds) throw new Error(`Missing build completion for ${source}`);
  // esbuild intentionally does not rewrite byte-identical outputs after a touch.
  for (const path of artifacts) if (!(await stat(path)).size) throw new Error(`${path} is empty`);
}
async function stop() {
  child.kill('SIGTERM');
  const result = await Promise.race([exited, delay(10000).then(() => undefined)]);
  if (!result) { child.kill('SIGKILL'); throw new Error('Watch process did not shut down after SIGTERM'); }
  if (result.code !== 0) throw new Error(`Watch exited unexpectedly: ${JSON.stringify(result)}\n${output}`);
}
try {
  await waitFor(() => ready >= 1, 'Initial build never became ready');
  await touchAndCheck('webview/main.tsx', ['dist/webview/app.js']);
  await touchAndCheck('src/model.ts', ['dist/extension.cjs', 'dist/analysis-worker.cjs']);
} finally {
  await stop();
}
console.log('PASS: watch waits for initial builds, rebuilds webview, extension, and worker, and shuts down.');
