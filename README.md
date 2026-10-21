# Zeile Review Map

A local, non-AI VS Code extension for exploring TypeScript/JavaScript changes as an interactive map.

## Run the MVP

Requires Node 22+ for development, Git, and VS Code 1.95+.

1. Run `npm install` and `npm run build`.
2. Open this folder in VS Code and press **F5** (Run Zeile extension).
3. In the Extension Development Host, open a local Git repository.
4. Run **Zeile: Open Review Map** from the Command Palette.
5. Use the **Before** and **After** dropdowns in the toolbar to select branches by name. Each side is independent; changing one immediately loads the comparison. Local and remote-tracking branches are grouped separately.

For example, select `main` in **Before** and your feature branch in **After**. This compares their **exact committed snapshots**, not only changes since branching. No checkout or fetch occurs; remote-tracking branches are local copies. Uncommitted edits are excluded. **Refresh** reloads branch names and re-resolves your selected branch tips.

Initially, the dropdowns show the snapshot before the latest commit and the current commit (HEAD), grouped under **Snapshots**. Select named branches to replace either side. Identical commits produce an actionable error without replacing your map. In a repository with just one commit, choose branches with different commits; there is no previous commit snapshot. The browser demo shows disabled example dropdowns; real branch selection is available in VS Code.

Or run `npm run package`, then install `zeile-0.1.3.vsix` using **Extensions: Install from VSIX…** and reload VS Code. Check the installed version is 0.1.3.

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

Snapshots are bounded to 1,500 eligible source/config files, 16 MB total, and 500 KB per file. Changed files are prioritized before background context. Skipped files produce scope warnings; missing snapshot coverage is not treated as deleted code. Large or unsupported changes remain visible in the file inventory. Function matching uses file paths and declaration names (plus Git rename candidates), not semantic identity across arbitrary moves/renames. Anonymous callbacks use their call-site names/test descriptions and occurrence order rather than line numbers; inserting/reordering indistinguishable callbacks can still affect matching. Module context nodes show complete files for top-level changes. Nested callbacks and enclosing functions each have nodes; tests and one-hop unchanged context are currently expanded by default, so node count exceeds changed-file count.

Canvas state is local workspace data, not shared review approval. Saved views are commit-specific; a new head starts a new map. Manual annotations do not prove a call relationship or correctness.

## Development

## Troubleshooting loading

Run **Zeile: Show Diagnostics** (or click **Show diagnostics** on the loading/error card). The **Zeile** Output channel records whether Git access succeeded, how many branches loaded, whether the webview connected, and worker completion/errors. It does not log source contents. Permission and missing-Git errors appear there and in a notification. No GitHub permissions or network authentication are required for local mapping. VS Code must trust the workspace.

Mapping can be canceled and is stopped automatically after two minutes. Branch controls remain independent of mapping. A missing webview connection produces a warning after 15 seconds. The standalone browser preview deliberately does not access your repository.

## Development commands

- `npm run typecheck`
- `npm test`
- `npm run test:e2e` (install Chromium first with `npx playwright install chromium`)
- `npm run build`
- `npm run package`

Architecture: `src/git.ts` reads immutable objects; `src/analyze.ts` extracts/comparers symbols; `src/analysis-worker.ts` runs analysis off the extension host; `src/extension.ts` bridges the sandboxed webview; `webview/` renders the canvas and source inspector. No hosted service or AI is involved.

The current folder need not itself be a Git repository to build the extension. The command operates on the repository opened in the Extension Development Host. Git fixtures in tests are created and removed in the OS temporary directory.
