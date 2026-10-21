import * as vscode from 'vscode';
import { Worker } from 'node:worker_threads';
import { randomBytes, createHash } from 'node:crypto';
import { git } from './git';
import { validCanvas, type CanvasState, type ReviewGraph, type ToWebview } from './model';

export function activate(context: vscode.ExtensionContext): void {
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
      const panel = vscode.window.createWebviewPanel('zeile.review', 'Zeile · Review Map', vscode.ViewColumn.Active, {
        enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')]
      });
      const webview = panel.webview;
      const nonce = randomBytes(24).toString('hex');
      const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', name));
      webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:; worker-src blob:;"><link rel="stylesheet" href="${asset('app.css')}"><title>Zeile Review Map</title></head><body><div id="root"></div><script nonce="${nonce}" type="module" src="${asset('app.js')}"></script></body></html>`;
      let worker: Worker | undefined;
      let graph: ReviewGraph | undefined;
      let base = 'HEAD~1', head = 'HEAD', disposed = false, request = 0, storageKey = '';
      const sourceKeys = new Set<string>();
      const send = (message: ToWebview) => { if (!disposed) void webview.postMessage(message); };
      const uriFor = (id: string, side: 'before' | 'after') => {
        const node = graph?.nodes.find(n => n.id === id);
        const version = node?.[side];
        if (!version || !graph) return undefined;
        const uri = vscode.Uri.from({ scheme: 'zeile-source', path: `/${side === 'before' ? graph.base : graph.head}/${version.path}`, query: encodeURIComponent(id) });
        documents.set(uri.toString(), version.code); sourceKeys.add(uri.toString());
        return uri;
      };
      const load = async () => {
        const generation = ++request;
        if (worker) { void worker.terminate(); worker = undefined; }
        send({ type: 'loading', message: `Reading ${base} → ${head} from Git snapshots…` });
        const running = new Worker(vscode.Uri.joinPath(context.extensionUri, 'dist', 'analysis-worker.cjs').fsPath, { workerData: { repository, base, head } });
        worker = running;
        running.on('message', (result: { graph?: ReviewGraph; error?: string }) => {
          if (generation !== request || disposed) return;
          if (result.error || !result.graph) { send({ type: 'error', message: `${result.error ?? 'Analysis failed.'} Choose valid committed revisions; for a first commit, select an existing base branch.` }); return; }
          graph = result.graph;
          storageKey = `canvas.${createHash('sha256').update(`${repository}:${graph.base}:${graph.head}`).digest('hex')}`;
          const state = context.workspaceState.get<CanvasState>(storageKey);
          send({ type: 'graph', graph, state: validCanvas(state) ? state : undefined });
        });
        running.on('error', error => { if (generation === request) send({ type: 'error', message: error.message }); });
        running.on('exit', code => { if (generation === request && !disposed && code !== 0) send({ type: 'error', message: `Analysis worker stopped (${code}). Try a smaller repository.` }); });
      };
      panel.onDidDispose(() => { disposed = true; request++; if (worker) void worker.terminate(); for (const key of sourceKeys) documents.delete(key); });
      webview.onDidReceiveMessage(async (message: unknown) => {
        if (!message || typeof message !== 'object' || !('type' in message)) return;
        const m = message as Record<string, unknown>;
        try {
          if (m.type === 'ready' || m.type === 'refresh') await load();
          if (m.type === 'selectComparison') {
            const selectedBase = await vscode.window.showInputBox({ title: 'Base Git revision', value: base, prompt: 'Exact snapshot comparison (not merge-base). Example: main, HEAD~1, or commit SHA.' });
            if (!selectedBase?.trim()) return;
            const selectedHead = await vscode.window.showInputBox({ title: 'Head Git revision', value: head });
            if (!selectedHead?.trim()) return;
            base = selectedBase.trim(); head = selectedHead.trim(); await load();
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
        } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : 'Could not complete the request.' }); }
      });
    } catch (error) {
      void vscode.window.showErrorMessage(`Zeile: ${error instanceof Error ? error.message : 'Could not open repository.'}`);
    }
  }));
}
