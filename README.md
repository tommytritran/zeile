# Zeile Review Map

A local, non-AI VS Code extension for exploring TypeScript/JavaScript changes as an interactive map.

## Run the MVP

Requires Node 22+ for development, Git, and VS Code 1.95+.

1. Run `npm install` and `npm run build`.
2. Open this folder in VS Code and press **F5** (Run Zeile extension).
3. In the Extension Development Host, open a local Git repository.
4. Run **Zeile: Open Review Map** from the Command Palette.
5. The initial comparison is **HEAD~1 → HEAD**. Use the revision selector to compare branches or commit SHAs. This is an exact snapshot comparison, not an automatic PR merge-base comparison. Revisions must already exist locally.

Or run `npm run package`, then install `zeile-0.1.0.vsix` using **Extensions: Install from VSIX…**.

`npm run dev:webview` opens a standalone browser preview with clearly labeled demo data. It does not read local repositories.

## Review interactions

- File containers group changed functions and one-hop unchanged context.
- Drag file headers to move groups; drag functions within groups. Connections follow.
- Collapse/expand file groups, fit the map, pin file positions, or explicitly re-run automatic layout.
- Click a function to inspect **Before**, **After**, clean **Compare**, or highlighted **Diff**.
- Drag connection handles to create a dashed amber **manual** relationship. Select a manual edge and press Delete to remove it. Extracted edges and nodes cannot be deleted.
- Add local notes in the implementation inspector. Positions, notes, collapse state, and manual connections are saved per repository and exact commit pair.
- Open historical function source in the native editor. Non-code/unmapped files remain in the change index and scope panel.

## Scope and limitations

This is a source navigation MVP, not complete runtime tracing or automated verification. Calls through interfaces, DI, event emitters, callbacks, computed properties, and external packages may be unresolved. Method edges identify a declaration, not guaranteed concrete dispatch. No caller edges resolved does **not** mean unused.

The analyzer uses the TypeScript compiler API with an in-memory Git snapshot. It reads root compiler options but does not resolve extended configurations, project references, installed dependency packages, or standard library declarations. Inferred types may consequently be incomplete. No inspected repository code, package scripts, installs, or builds are executed. Git operations are read-only; the working tree is not checked out or modified. Analysis runs in a worker thread.

Snapshots are bounded to 1,500 eligible source/config files, 16 MB total, and 500 KB per file. Skipped files produce scope warnings. Large or unsupported changes remain visible in the file inventory. Function matching uses file paths and declaration names (plus Git rename candidates), not semantic identity across arbitrary moves/renames. Anonymous callbacks use line-based identities. Module context nodes show complete files for top-level changes.

Canvas state is local workspace data, not shared review approval. Saved views are commit-specific; a new head starts a new map. Manual annotations do not prove a call relationship or correctness.

## Development

- `npm run typecheck`
- `npm test`
- `npm run test:e2e` (install Chromium first with `npx playwright install chromium`)
- `npm run build`
- `npm run package`

Architecture: `src/git.ts` reads immutable objects; `src/analyze.ts` extracts/comparers symbols; `src/analysis-worker.ts` runs analysis off the extension host; `src/extension.ts` bridges the sandboxed webview; `webview/` renders the canvas and source inspector. No hosted service or AI is involved.

The current folder need not itself be a Git repository to build the extension. The command operates on the repository opened in the Extension Development Host. Git fixtures in tests are created and removed in the OS temporary directory.
