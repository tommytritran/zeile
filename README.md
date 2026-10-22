# Zeile Review Map

A local, non-AI VS Code extension for exploring TypeScript/JavaScript changes as an interactive map.

## Run the MVP

Requires Node 22+ for development, Git, and VS Code 1.95+.

1. Run `npm install` once.
2. Open this folder in VS Code and press **F5** (Run Zeile extension).
3. In the Extension Development Host, open a local Git repository.
4. Run **Zeile: Open Review Map** from the Command Palette.
5. Use the searchable **Before** and **After** dropdowns in the toolbar to select branches by name. Click and type part of a name to filter, then click a result or use ↑/↓ and Enter. Escape cancels the search. Each side is independent; selecting a result immediately loads the comparison. Local and remote-tracking branches are grouped separately.

For example, select `main` in **Before** and your feature branch in **After**. This compares their **exact committed snapshots**, not only changes since branching. No checkout or fetch occurs; remote-tracking branches are local copies. Uncommitted edits are excluded. **Refresh** reloads branch names and re-resolves your selected branch tips.

Initially, **Before** selects local `main`, then local `master`, then `origin/main` or `origin/master` if only remote-tracking copies exist. **After** is the current commit (HEAD). With none of those branches, Before falls back to the previous commit. If the default branch already points to HEAD, the initial map is empty; choose a different After branch. Manual selection of identical commits produces an actionable error without replacing your map. In a single-commit repository without a default branch, choose branches with different commits; there is no previous commit snapshot. The browser demo shows disabled example dropdowns; real branch selection is available in VS Code.

Or run `npm run package`, then install `zeile-0.1.9.vsix` using **Extensions: Install from VSIX…** and reload VS Code. Check the installed version is 0.1.9.

`npm run dev:webview` opens a standalone browser preview with clearly labeled demo data. It does not read local repositories.

## Review interactions

- The **Review queue** groups changed functions and top-level file changes by file, with shown/total node counts. Selecting an item opens its implementation and focuses its file. Pure file renames remain in the queue. Signature-difference hints compare extracted signatures, which may be inferred or incomplete; they are not risk scores.
- The canvas starts with changed production code only. **Tests** and **Generated** queue filters reveal those changed files; both start off. Categories are filename conventions, not semantic classification: test/spec suffixes and test directories; generated directories, `.generated`/`.gen` suffixes, and declaration files. The **Full change index** retains every changed file, including excluded and unmapped files. On narrow screens, use the **Review queue** button.
- In the implementation inspector, **Show callers** reveals incoming source references and **Show dependencies** reveals referenced functions, one hop per click within the available graph. Counts include already-visible and excluded neighbors; the result reports newly revealed, already shown, and excluded nodes. Explicit exploration may reveal tests/generated code even when their queue filters are off, but never bypasses Exclusions. Source links retain Before/After revision evidence; method declarations do not prove runtime dispatch. No resolved callers does not mean unused.
- **Reset exploration** returns to the filtered changed-code map. Changing queue filters or comparison resets exploration; hiding nodes never deletes their saved notes, positions, pins, or manual links. Filters and exploration are session-only. The current analyzer only returns the immediate neighborhood of changed functions: expansion from context nodes may be incomplete, and module-only changes do not have extracted call edges. This is not recursive or complete call-chain tracing.
- Use **Exclusions** to hide matching files from the canvas. Enter one literal filename/path fragment per line, such as `.test.`, `.spec.`, `__tests__/`, or `generated`. Matching is case-insensitive against the canonical/current repository-relative path (the old path for deleted files); entries are not globs or regexes. Nothing is excluded by default. The list is saved locally per repository across comparisons and workspaces in the current VS Code profile. Matching files remain labeled **excluded** in the change index; a canvas notice reports hidden files/nodes. Clear the list to restore nodes, notes, saved positions and manual links. Exclusions affect rendering, not analysis duration or snapshot limits.
- Drag file headers to move groups; drag functions within groups. Connections follow.
- **Arrange → Architecture hints** places backend Entry/API, Logic/domain, and Integration/persistence files in left-to-right columns; frontend Page/layout, Feature/state, and Component/API-client files use a separate row band. File headers show folder-based roles. This is an optional organizational convention, not execution order or proof of start/end points; unknown files remain unclassified. Pins are preserved; drag freely afterward or return to **Source links**. Newly revealed files receive role-based initial positions; use Auto-layout again to arrange the complete current map.
- JSX component composition and frontend HTTP/GraphQL-to-backend endpoint links are not currently extracted. A monorepo alone does not establish those relationships. Manual links may document reviewer understanding; automatic cross-boundary links require explicit contract/route-registration evidence and would be separate from ordinary source references.
- Select a function to highlight its upstream/downstream **source-reference paths** across the current map and dim unrelated nodes/links. Before and After are traversed independently; revision colors and method-declaration dashes remain visible. Manual annotations do not participate. Collapsed groups preserve logical function relationships without inventing file-level paths. Click empty canvas or **Clear highlight** to clear the selection. This does not reveal hidden nodes, prove runtime/data flow, or establish complete impact coverage.
- Collapse/expand file groups, fit the map, pin file positions, or explicitly re-run automatic layout.
- Click a function to inspect **Before**, **After**, or **Compare**. All three views include local TypeScript/JavaScript and JSX syntax highlighting.
- **Compare** keeps labeled Before/After sources separate. **Highlight changes** is on by default: subtle shading marks changed lines, stronger underlined highlights mark edited text, and −/+ gutter symbols identify each side without relying only on color. Turn it off for clean reading without losing alignment, reading position, or change navigation. Use Previous/Next change to jump between textual change regions, **Fold unchanged context** for long implementations, and **Expand** for a wider reading surface. Source line numbers use each revision's original location. Region counts describe textual chunks, not semantic changes. There is no separate Diff tab.
- Drag connection handles to create a dashed amber **manual** relationship. Select a manual edge and press Delete to remove it. Extracted edges and nodes cannot be deleted.
- Add local notes in the implementation inspector. Positions, notes, collapse state, and manual connections are saved per repository and exact commit pair.
- Drag the Implementation panel's left edge to resize it. Focus the divider and use ←/→ (Shift for larger steps); double-click it or press Home to reset. Width is retained across functions for the current session. **Expand/Reduce** temporarily maximizes the reading surface without losing your chosen width.
- Drag the Review queue's right edge to resize the left panel. It supports the same arrow-key, Shift, double-click, and Home controls. Its width is kept for the session; the expanded Implementation panel follows its boundary.
- Open historical function source in the native editor. Non-code/unmapped files remain in the change index and scope panel.

## Scope and limitations

This is a source navigation MVP, not complete runtime tracing or automated verification. Calls through interfaces, DI, event emitters, callbacks, computed properties, and external packages may be unresolved. Method edges identify a declaration, not guaranteed concrete dispatch. No caller edges resolved does **not** mean unused.

The analyzer uses the TypeScript compiler API with an in-memory Git snapshot. It reads root compiler options but does not resolve extended configurations, project references, installed dependency packages, or standard library declarations. Inferred types may consequently be incomplete. No inspected repository code, package scripts, installs, or builds are executed. Git operations are read-only; the working tree is not checked out or modified. Analysis runs in a worker thread.

Snapshots are bounded to 1,500 eligible source/config files, 16 MB total, and 500 KB per file. Changed files are prioritized before background context. Skipped files produce scope warnings; missing snapshot coverage is not treated as deleted code. Large or unsupported changes remain visible in the file inventory. Function matching uses file paths and declaration names (plus Git rename candidates), not semantic identity across arbitrary moves/renames. Anonymous callbacks use their call-site names/test descriptions and occurrence order rather than line numbers; inserting/reordering indistinguishable callbacks can still affect matching. Module context nodes show complete files for top-level changes. Nested callbacks and enclosing functions each have nodes, so node count can exceed changed-file count. Tests/generated files and unchanged context are hidden from the initial focused map but retained for filtering and explicit exploration.

Canvas state is local workspace data, not shared review approval. Saved views are commit-specific; a new head starts a new map. Manual annotations do not prove a call relationship or correctness.

## Development

### Local extension loop — no VSIX installation

Open **this Zeile source folder** in VS Code, select **Run Zeile extension** in Run and Debug, and press **F5** (or **Run → Start Debugging**). This starts `npm run watch`, waits until both the extension/analysis worker and webview have built successfully, then opens an **Extension Development Host** running Zeile directly from this folder. Open the repository you want to review in that new window and run **Zeile: Open Review Map**. The repository's own dependencies/build scripts are not needed.

Keep the source window and its watch task running while you edit:

- **Webview UI/CSS changes:** save, wait for `[zeile-watch] ready` in the task terminal, then close the Zeile review tab in the development window and run **Zeile: Open Review Map** again. This loads the rebuilt local assets.
- **Extension or analyzer changes (`src/`):** save, wait for the ready message, then use **Restart** in the source window's debug toolbar (**Shift+Cmd+F5** on macOS). Reopen the map if needed. Rebuilding alone does not replace already-running extension code or workers.
- **Type errors:** run the **Typecheck Zeile** task or `npm run typecheck:watch` in another terminal. The bundler watches syntax/build errors, not TypeScript types; build errors appear in its terminal and prevent the ready message until fixed.
- **Stop watching:** use **Tasks: Terminate Task → Watch Zeile** in the source window. Stopping debugging alone can leave the reusable watch task running.

This uses packaged-style local webview assets and the same CSP as the installed extension; it is **automatic rebuild, not hot reload**. Your normally installed Zeile remains unchanged—test the new code in the window titled **Extension Development Host**. Use `npm run package` only when distributing/installing a release.

For faster UI-only iteration with browser hot reload, run `npm run dev:webview` and open `http://127.0.0.1:5189`. This uses demo data; real repositories, branch selection, and the extension bridge require the development host.

## Troubleshooting loading

Run **Zeile: Show Diagnostics** (or click **Show diagnostics** on the loading/error card). The **Zeile** Output channel records whether Git access succeeded, how many branches loaded, whether the webview connected, and worker completion/errors. It does not log source contents. Permission and missing-Git errors appear there and in a notification. No GitHub permissions or network authentication are required for local mapping. VS Code must trust the workspace.

Mapping can be canceled and is stopped automatically after two minutes. Branch controls remain independent of mapping. A missing webview connection produces a warning after 15 seconds. The standalone browser preview deliberately does not access your repository.

## Development commands

- `npm run typecheck`
- `npm run watch` (extension, worker, and local webview rebuilds)
- `npm run typecheck:watch`
- `npm test`
- `npm run test:e2e` (install Chromium first with `npx playwright install chromium`)
- `npm run build`
- `npm run package`

Architecture: `src/git.ts` reads immutable objects; `src/analyze.ts` extracts/comparers symbols; `src/analysis-worker.ts` runs analysis off the extension host; `src/extension.ts` bridges the sandboxed webview; `webview/` renders the canvas and source inspector. No hosted service or AI is involved.

The current folder need not itself be a Git repository to build the extension. The command operates on the repository opened in the Extension Development Host. Git fixtures in tests are created and removed in the OS temporary directory.
