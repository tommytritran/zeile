import * as vscode from 'vscode';
import { Worker } from 'node:worker_threads';
import { randomBytes, createHash } from 'node:crypto';
import { git } from './git';
import { validCanvas, type BranchOption, type CanvasState, type ReviewGraph, type ToWebview } from './model';
import { defaultBeforeBranch, initialComparison, latestComparison, listBranches, resolveComparison, type Comparison } from './revisions';
import { validExclusions } from './visibility';
import { checkpointBaseline, checkpointScope, validCheckpoint, type CheckpointView } from './checkpoint';
import { checkpointAfterRef, checkpointChanges } from './checkpoint-git';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Zeile');
  context.subscriptions.push(output, vscode.commands.registerCommand('zeile.showLogs', () => output.show()));
  const log = (message: string) => output.appendLine(`${new Date().toISOString()} ${message}`);
  const documents = new Map<string, string>();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('zeile-source', {
    provideTextDocumentContent: uri => documents.get(uri.toString()) ?? 'Source is no longer available. Reopen the review map.'
  }));
  context.subscriptions.push(vscode.commands.registerCommand('zeile.openReviewMap', async () => {
    try {
      const folders = vscode.workspace.workspaceFolders?.filter(f => f.uri.scheme === 'file');
      if (!folders?.length) throw new Error('Open a local Git repository folder first.');
      const folder = folders.length === 1 ? folders[0] : (await vscode.window.showQuickPick(folders.map(f => ({ label: f.name, folder: f }))))?.folder;
      if (!folder) return;
      const repository = (await git(folder.uri.fsPath, ['rev-parse', '--show-toplevel'])).trim();
      const exclusionsKey = `exclusions.${createHash('sha256').update(repository).digest('hex')}`;
      const sendExclusions = () => {
        const patterns = context.globalState.get<unknown>(exclusionsKey);
        void panel.webview.postMessage({ type: 'exclusions', patterns: validExclusions(patterns) ? patterns : [] });
      };
      log(`Zeile ${context.extension.packageJSON.version}: Git access OK. Loading comparison and branch names.`);
      let branches = await listBranches(repository);
      let comparison: Comparison | undefined;
      let initialError: string | undefined;
      try { comparison = await initialComparison(repository, branches); }
      catch (error) {
        initialError = `${error instanceof Error ? error.message : String(error)} Select exact comparison or choose different branches, then retry.`;
        log(`Initial comparison failed: ${initialError}`);
      }
      let comparisonKind: 'pr' | 'exact' = comparison?.kind ?? 'pr';
      log(`Loaded ${branches.length} branch names.`);
      const conventionalBefore = defaultBeforeBranch(branches);
      let beforeChoice = conventionalBefore ?? { ref: comparison?.base ?? 'HEAD', label: comparison?.baseLabel ?? 'Current commit' };
      let afterChoice = { ref: 'HEAD', label: 'Current commit (HEAD)' };
      const panel = vscode.window.createWebviewPanel('zeile.review', 'Zeile · Review Map', vscode.ViewColumn.Active, {
        enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')]
      });
      const webview = panel.webview;
      const nonce = randomBytes(24).toString('hex');
      const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', name));
      const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:; worker-src blob:;"><link rel="stylesheet" href="${asset('app.css')}"><title>Zeile Review Map</title></head><body><div id="root"></div><script nonce="${nonce}" type="module" src="${asset('app.js')}"></script></body></html>`;
      let worker: Worker | undefined;
      let graph: ReviewGraph | undefined;
      let disposed = false, request = 0, resolution = 0, storageKey = '', choosing = false;
      let checkpointKey = '', checkpointBusy = false;
      let checkpointView: CheckpointView = { files: [] };
      let analysisTimer: ReturnType<typeof setTimeout> | undefined;
      let readyReceived = false;
      const handshakeTimer = setTimeout(() => {
        if (!readyReceived && !disposed) { log('Webview did not connect within 15 seconds.'); void vscode.window.showWarningMessage('Zeile: the review UI did not connect. Close the review tab, reload VS Code, and reopen it. See Output → Zeile.'); }
      }, 15000);
      const sourceKeys = new Set<string>();
      const send = (message: ToWebview) => { if (!disposed) void webview.postMessage(message); };
      const branchSelection = () => {
        const options: BranchOption[] = [...branches];
        for (const choice of [beforeChoice, afterChoice]) if (!options.some(option => option.ref === choice.ref)) {
          options.push({ ...choice, group: 'Snapshots' });
        }
        return { options, before: beforeChoice.ref, after: afterChoice.ref, comparisonKind };
      };
      const sendBranches = () => send({ type: 'branches', selection: branchSelection() });
      const uriFor = (id: string, side: 'before' | 'after') => {
        const node = graph?.nodes.find(n => n.id === id);
        const version = node?.[side];
        if (!version || !graph) return undefined;
        const uri = vscode.Uri.from({ scheme: 'zeile-source', path: `/${side === 'before' ? graph.base : graph.head}/${version.path}`, query: encodeURIComponent(id) });
        documents.set(uri.toString(), version.code); sourceKeys.add(uri.toString());
        return uri;
      };
      const load = async () => {
        if (!comparison) { send({ type: 'error', message: initialError ?? 'There is no previous commit to compare yet. Select different branches in the Before and After dropdowns. Only committed code is included.' }); return; }
        const { base, head, baseLabel, headLabel, target, mergeBase } = comparison;
        const kind = comparisonKind;
        const selection = branchSelection();
        const generation = ++request;
        graph = undefined;
        checkpointKey = '';
        checkpointView = { files: [] };
        const scope = checkpointAfterRef(repository, selection.after, head).then(after =>
          `checkpoint.${createHash('sha256').update(checkpointScope(repository, selection.before, after, kind)).digest('hex')}`);
        clearTimeout(analysisTimer);
        if (worker) { void worker.terminate(); worker = undefined; }
        send({ type: 'loading', message: `Comparing ${baseLabel} → ${headLabel}…` });
        log(`Starting analysis ${base.slice(0, 7)} → ${head.slice(0, 7)}.`);
        const started = Date.now();
        const running = new Worker(vscode.Uri.joinPath(context.extensionUri, 'dist', 'analysis-worker.cjs').fsPath, { workerData: { repository, base, head } });
        worker = running;
        analysisTimer = setTimeout(() => {
          if (generation !== request || disposed) return;
          request++; void running.terminate();
          log('Analysis exceeded 120 seconds and was stopped.');
          send({ type: 'error', message: 'Mapping exceeded 2 minutes and was stopped. Branch selection is still available. Use Show diagnostics to inspect startup/Git errors.' });
        }, 120000);
        running.on('message', (result: { graph?: ReviewGraph; error?: string }) => {
          if (generation !== request || disposed) return;
          clearTimeout(analysisTimer);
          log(`Analysis finished in ${((Date.now() - started) / 1000).toFixed(1)}s: ${result.error ?? `${result.graph?.nodes.length ?? 0} nodes`}`);
          if (result.error || !result.graph) { send({ type: 'error', message: `${result.error ?? 'Analysis failed.'} Select available branches in the Before and After dropdowns.` }); return; }
          graph = { ...result.graph, baseLabel, headLabel, comparison: { kind, target: target ?? base, ...(kind === 'pr' ? { mergeBase: mergeBase ?? base } : {}) } };
          storageKey = `canvas.${createHash('sha256').update(`${repository}:${graph.base}:${graph.head}`).digest('hex')}`;
          const state = context.workspaceState.get<CanvasState>(storageKey);
          send({ type: 'graph', graph, state: validCanvas(state) ? state : undefined, selection, token: generation });
          const completedGraph = graph;
          void (async () => {
            try {
              const key = await scope;
              if (generation !== request || disposed) return;
              const saved = context.globalState.get<unknown>(key);
              const view = validCheckpoint(saved) ? await checkpointChanges(repository, saved, completedGraph) :
                { files: [], ...(saved === undefined ? {} : { unavailable: 'The local checkpoint is invalid. Save a new checkpoint to replace it.' }) };
              if (generation !== request || disposed) return;
              checkpointKey = key;
              checkpointView = view;
              send({ type: 'checkpoint', base, head, token: generation, view });
            } catch {
              if (generation === request && !disposed) send({ type: 'checkpoint', base, head, token: generation, view: { files: [], unavailable: 'Could not load the local checkpoint. Refresh to retry.' } });
            }
          })();
        });
        running.on('error', error => { if (generation === request) { clearTimeout(analysisTimer); log(`Worker error: ${error.message}`); send({ type: 'error', message: error.message }); } });
        running.on('exit', code => { if (generation === request && !disposed && code !== 0) { clearTimeout(analysisTimer); log(`Worker exited with code ${code}.`); send({ type: 'error', message: `Analysis worker stopped (${code}). Try a smaller repository.` }); } });
      };
      panel.onDidDispose(() => { disposed = true; request++; resolution++; clearTimeout(handshakeTimer); clearTimeout(analysisTimer); if (worker) void worker.terminate(); for (const key of sourceKeys) documents.delete(key); });
      webview.onDidReceiveMessage(async (message: unknown) => {
        if (disposed || !message || typeof message !== 'object' || !('type' in message)) return;
        const m = message as Record<string, unknown>;
        try {
          if (m.type === 'showLogs') output.show();
          if (m.type === 'saveCheckpoint' || m.type === 'clearCheckpoint') {
            if (!graph || choosing || !checkpointKey || checkpointBusy || m.base !== graph.base || m.head !== graph.head || m.token !== request) {
              if (graph) send({ type: 'checkpoint', base: graph.base, head: graph.head, token: request, view: checkpointView, error: 'The comparison changed or a checkpoint operation is still pending. Wait for loading to finish and try again.' });
              return;
            }
            checkpointBusy = true;
            const generation = request, key = checkpointKey, current = graph;
            try {
              const checkpoint = m.type === 'saveCheckpoint' ? checkpointBaseline(current) : undefined;
              await context.globalState.update(key, checkpoint);
              if (generation !== request || disposed) return;
              checkpointView = { checkpoint, files: [] };
              send({ type: 'checkpoint', base: current.base, head: current.head, token: generation, view: checkpointView });
            } catch {
              if (generation === request && !disposed) send({ type: 'checkpoint', base: current.base, head: current.head, token: generation, view: checkpointView, error: 'Could not save the local checkpoint. Your previous checkpoint has not been replaced in this view.' });
            } finally { checkpointBusy = false; }
          }
          if (m.type === 'cancelAnalysis') {
            graph = undefined; checkpointKey = '';
            request++; resolution++; clearTimeout(analysisTimer); if (worker) void worker.terminate();
            log('Analysis canceled by reviewer.');
            send({ type: 'error', message: 'Mapping canceled. Select branches or click Refresh to try again.' });
          }
          if (m.type === 'refresh') {
            if (choosing || checkpointBusy) return;
            choosing = true;
            const token = ++resolution;
            try {
              const available = await listBranches(repository);
              if (disposed || token !== resolution) return;
              const latest = comparison?.mode === 'latest' || (!comparison && !conventionalBefore);
              const selected = latest ? await latestComparison(repository) : await resolveComparison(repository, beforeChoice, afterChoice, true, comparisonKind);
              if (disposed || token !== resolution) return;
              branches = available;
              comparison = selected;
              initialError = undefined;
              if (latest) beforeChoice = { ref: selected?.target ?? selected?.base ?? 'HEAD', label: selected?.baseLabel ?? 'Current commit' };
              sendBranches();
              await load();
            } catch (error) {
              if (disposed || token !== resolution) return;
              throw error;
            } finally { choosing = false; }
          }
          if (m.type === 'ready') { readyReceived = true; clearTimeout(handshakeTimer); log('Webview connected; sending branch names.'); sendExclusions(); sendBranches(); await load(); }
          if (m.type === 'saveExclusions') {
            if (!validExclusions(m.patterns)) throw new Error('Use at most 100 exclusion names, each between 1 and 200 characters.');
            await context.globalState.update(exclusionsKey, m.patterns);
            sendExclusions();
          }
          if (m.type === 'getBranches') {
            branches = await listBranches(repository);
            sendBranches();
          }
          if (m.type === 'changeBranch' && (m.side === 'before' || m.side === 'after') && typeof m.ref === 'string') {
            if (choosing || checkpointBusy) return;
            choosing = true;
            const token = ++resolution;
            try {
              const option = branches.find(branch => branch.ref === m.ref) ?? [beforeChoice, afterChoice].find(choice => choice.ref === m.ref);
              if (!option) throw new Error('That branch is no longer available. Refresh to reload the branch list.');
              const before = m.side === 'before' ? option : beforeChoice;
              const after = m.side === 'after' ? option : afterChoice;
              const selected = await resolveComparison(repository, before, after, false, comparisonKind);
              if (disposed || token !== resolution) return;
              beforeChoice = { ref: before.ref, label: before.label };
              afterChoice = { ref: after.ref, label: after.label };
              comparison = selected; initialError = undefined; sendBranches(); await load();
            } catch (error) {
              if (disposed || token !== resolution) return;
              sendBranches();
              throw error;
            } finally { choosing = false; }
          }
          if (m.type === 'changeComparisonKind') {
            if (m.kind !== 'pr' && m.kind !== 'exact') throw new Error('Choose PR or exact comparison.');
            if (choosing || checkpointBusy) return;
            choosing = true;
            const token = ++resolution;
            try {
              const selected = await resolveComparison(repository, beforeChoice, afterChoice, true, m.kind);
              if (disposed || token !== resolution) return;
              comparison = selected;
              initialError = undefined;
              comparisonKind = m.kind;
              sendBranches();
              await load();
            } catch (error) {
              if (disposed || token !== resolution) return;
              sendBranches(); throw error;
            }
            finally { choosing = false; }
          }
          if (m.type === 'saveLayout' && storageKey && validCanvas(m.state)) await context.workspaceState.update(storageKey, m.state);
          if (m.type === 'openSource' && typeof m.id === 'string' && (m.revision === 'before' || m.revision === 'after')) {
            const uri = uriFor(m.id, m.revision);
            if (uri) await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: true });
          }
          if (m.type === 'openDiff' && typeof m.id === 'string') {
            const before = uriFor(m.id, 'before'), after = uriFor(m.id, 'after');
            if (before && after) await vscode.commands.executeCommand('vscode.diff', before, after, graph?.nodes.find(n => n.id === m.id)?.name, { viewColumn: vscode.ViewColumn.Beside });
          }
        } catch (error) { const message = error instanceof Error ? error.message : 'Could not complete the request.'; log(`Request failed: ${message}`); send({ type: 'error', message }); }
      });
      // Register the message bridge before loading scripts that immediately send ready.
      webview.html = html;
    } catch (error) {
      log(`Startup failed: ${error instanceof Error ? error.message : String(error)}`);
      void vscode.window.showErrorMessage(`Zeile: ${error instanceof Error ? error.message : 'Could not open repository.'}`);
    }
  }));
}
