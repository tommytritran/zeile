# Zeile Review Workspace

A local, non-AI VS Code extension for reviewing committed TypeScript/JavaScript changes and investigating their source relationships. No source uploads or inspected project execution.

## Project status: discontinued

As of 2026-10-30, we have decided to abandon Zeile. The prototype and findings are retained for reference, but further product development and maintenance are not planned. The instructions below document the final experimental implementation, not an active product roadmap.

### Findings and decision

The [exploratory reviewer-agent evaluation](docs/subletting-review-simulation.md) tested the actual analyzer and reader on a large, real pull request with five reviewer-agent sessions. It demonstrated orientation and some useful source navigation, but did not demonstrate an improvement over GitHub plus an IDE:

- The feature's own README provided the main domain and process orientation. File counts and relationship groups did not supply a review plan.
- Function references helped with local navigation, but did not establish the important workflow across injected dependencies, callbacks, transactions, retries, persistence, and frontend state.
- Nested operations and source navigation required additional discovery and context reconstruction. None of the five sessions completed all behavioral tasks within the exercise budget.
- Reading history and notes did not establish a retained, source-backed review argument across those boundaries.

The [connected-diff assessment](docs/connected-diff-assessment.md) records later improvements to integrated reference navigation, production/test separation, and nested-symbol discovery. Those changes addressed specific barriers, but did not establish better review quality or speed.

This was an exploratory agent exercise on one PR, not a controlled study with human reviewers. There was no GitHub-plus-IDE baseline, so we cannot claim that Zeile is slower, universally ineffective, or incapable of helping a narrow task. Our decision is that the demonstrated value does not justify further investment in a separate reader/map and its analysis and navigation complexity. We are stopping here rather than pursuing the report's proposed follow-up experiments or another redesign. Our default remains GitHub plus an IDE, supported by clear author-written review briefs and existing source-navigation tools.

## Prototype reference

## Review journey

1. Run **Zeile: Open Review Map** in a trusted local Git workspace.
2. Select the target branch in **Before**, and the feature branch in **After**. Both selectors support name search and keyboard navigation.
3. Start at **Overview → Related changes**: automatically grouped changed files linked by source references in one snapshot, directly or through at most one unchanged function. Read connected diffs from a suggested symbol, or use **All files** and the complete searchable **Changed files** navigator. Groups exclude tests/generated files and are navigation suggestions, not workflows, execution order, complete impact coverage, or review status. Unlinked files are never removed. Comparison metadata is available in an expandable section rather than dominating the reading entry point.
4. Select a file to **Read change** in the full remaining workspace. Compare is the default, with clean Before/After sources and an optional **Highlight changes** toggle. Use Previous/Next change, optional unchanged-context folding, and Previous/Next file.
5. Select an owning function to read its diff with **Read connected changes** directly above it: incoming references → selected change → outgoing references. Click a related symbol to read its actual Before/After diff without opening a separate map; Back restores your previous reading mode and position. Before/After reference scope is explicit and independent of Compare mode. Nested-body references are included with lexical provenance, not fabricated callback invocation. Tests are separate from production references; declaration dispatch remains uncertain. Expand or hide connections to control reading space. **Find any indexed function** in full-file context searches nested operations and unchanged symbols, including operations inside large connector factories. Nested symbols remain individually accessible inside their owner. A pure rename appears once as a file change.
6. Use **Explore this function** for a small local relationship map. Start with the chosen function; browse named incoming callers/outgoing dependencies and reveal only the branch you want. The map does not include unrelated changed functions. Neighbor lists show ten items initially with explicit Show more; nothing is silently discarded. **Show selected symbol** and **Fit investigation** move the camera explicitly, rather than jumping whenever you read code.
7. **Read** a neighbor or open an indexed **Call site**, then use **Back/Forward** to return to your reading position. **Return to code** preserves the current source. Reading mode and comparison preferences survive navigation; scroll positions are cached per source/mode for the session.

Map highlighting, reader selection, and camera movement are separate. Clearing a highlight or clicking empty map space does not close the code. The exploration snapshot is explicitly **Before** or **After**, so old and new references cannot accidentally form a mixed-revision path.

The older global function canvas, folder-based architecture arrangements, and right-side implementation inspector are no longer the default interface. Code and relationships use alternate main surfaces rather than squeezing both into narrow columns. The left file navigator remains resizable by dragging its right edge, arrow keys (Shift for larger steps), and Home/double-click to reset. Notes and older canvas annotations remain in local storage; this workspace does not expose the old pin/manual-edge authoring controls.

## What is compared?

Overview starts with a comparison brief: target/effective-base/head commit IDs, file-status totals, Git-reported text-line additions/deletions, directory distribution, and complete/incomplete file-source coverage. Totals describe the whole comparison, independently of navigator filters. Binary files are excluded from text-line totals. Commit context shows the total commits in effective `Before..After` and up to 20 recent subjects, author names, dates, and hashes; displayed author-name counts are not a complete contributor count. Missing metadata is explicitly unavailable. Directory and test/generated categories are path-based, not architecture, risk, test execution, or review-progress claims. The brief does not verify remote freshness or GitHub parity.

**PR changes (merge base)** is the default. It compares the unique common ancestor of the selected target/feature tips with the feature tip, equivalent to the usual `git diff target...feature` scope used for a GitHub PR. This excludes target-only changes after divergence. **Before source is the merge-base snapshot**, not necessarily the latest target-branch source.

**Exact snapshots** is an explicit alternative comparing the selected tips directly. The comparison basis and effective commit IDs appear above the workspace. Missing or ambiguous merge bases produce an actionable error; Zeile never silently switches to exact mode. The branch controls remain available for recovery.

Before initially prefers remote-tracking `origin/main`, then `origin/master`, then local `main` or `master`, so an older checked-out target does not take precedence over its remote-tracking counterpart. These are still local cached refs, not a live GitHub check. After starts at HEAD. Without a conventional target branch, Zeile falls back to the previous commit; a root commit has no previous snapshot. Identical initial tips produce an empty comparison. Manual identical-tip selections produce a warning.

All refs are local. No fetch, checkout, merge, or push occurs. **Refresh** reloads local branch names and re-resolves the selected comparison. Matching GitHub requires the same pushed commits and target branch; Zeile does not discover PR metadata from GitHub. Dirty working-tree edits are excluded.

## Source reading, exclusions and notes

- TypeScript/JavaScript/JSX source has local syntax highlighting in Compare, Before, and After. Syntax colors describe code; subtle line shading, underlined inline highlights and −/+ gutter marks describe edits. Toggle change highlighting off without replacing editors or resetting the reading position.
- Function and file sources use original revision paths and line numbers. Supported changed-file documents such as Markdown, SQL, YAML, JSON, CSS, HTML and GraphQL are readable as plain text. No code is executed.
- Binary, sensitive-config paths, symlinks, unsupported extensions, and oversized files stay in the complete inventory with explicit unavailable-source reasons. Partial file coverage has a warning: an empty pane is not silently presented as a deletion.
- **Exclusions** accepts up to 100 literal, case-insensitive filename/path fragments, one per line—not globs or regexes. Examples: `.test.`, `__tests__/`, `generated`. They hide exploration nodes, never remove changed files from review or close readable code. Settings are stored locally per repository in the current VS Code profile.
- **Review note** is optional, local, and specific to a source item and effective commit pair. Notes are not approval or correctness evidence. There is no automatic reviewed/verified status.

## Local review checkpoints (experiment)

In **Overview**, choose **Save checkpoint** before leaving a review. After committing more changes to the same feature branch, use **Refresh** to see a separate **Since your checkpoint** file inventory. **Replace checkpoint** advances the baseline explicitly; **Clear checkpoint** removes it. Nothing is saved automatically by reading code, and a checkpoint never means reviewed, approved, verified, or safe.

Only versioned base/head commit IDs and a timestamp are stored in the current VS Code profile's local extension storage; no source is copied, uploaded, or synchronized by Zeile. Checkpoints are scoped to the repository, target/feature branch identities, and PR/exact comparison mode. HEAD follows its branch identity, not whichever branch you later check out; detached HEAD checkpoints are scoped to that commit. No database, backend, accounts, or telemetry are involved. Browser-only demo mode cannot compare Git checkpoints.

The list compares the saved feature commit with the current feature commit, includes renames/deletions and files no longer present in the PR inventory, and does not filter the full PR. Links open the **full PR comparison**, not an incremental source diff. Files outside the current PR inventory remain listed without a source link. A changed comparison baseline, missing saved commit, rewritten/non-descendant history, or Git error makes the delta explicitly unavailable; replace the checkpoint to start again. Notes remain specific to their original commit pair and are not carried forward.

This first experiment tests whether a persistent, explicit baseline reduces re-orientation after PR updates. It does not track inspected files, preserve conclusions, analyze semantic impact, or claim measured review-speed gains. Try saving a checkpoint on a representative PR, return after another commit, and compare the time needed to identify what needs another look with your normal workflow.

## Source relationship evidence

The analyzer uses the TypeScript compiler API and retains the functions and call/declaration edges resolved in its bounded immutable snapshots. Unlike the earlier one-hop payload, the index retains unchanged intermediate functions so exploration can continue through them on demand. The displayed map remains small and explicit.

Edges are **static source evidence**, not runtime calls, execution order, data flow, or complete impact coverage. Property-access references identify method declarations, not guaranteed concrete dispatch. Call sites include snapshot/path/line evidence when available. Lexical ownership groups nested functions for review; it is not an invocation edge.

DI, interfaces, callbacks, events, computed properties, external packages, JSX composition, and frontend HTTP/GraphQL-to-backend boundaries may be unresolved. A monorepo alone does not establish cross-boundary relationships. No resolved callers does **not** mean unused. Folder structure is not used to invent call edges or workflow endpoints.

The analyzer reads root compiler options but does not resolve extended tsconfig files, project references, installed packages, or standard library declarations. Inferred signatures can be incomplete. Unchanged context with missing opposite-snapshot coverage is not treated as a definitive addition/deletion.

Snapshot indexing is bounded to 1,500 eligible source/config files, 16 MB per snapshot, and 500 KB per file. Changed files are prioritized. Full changed-file reading has a separate combined 16 MB budget across both revisions and the same per-file limit. Scope warnings disclose omitted context; there is no guarantee that all neighbors were indexed. Function matching uses paths, declaration/call-site names and occurrence order—not semantic identity across arbitrary moves or indistinguishable callback insertions.

## Local development — no repeated VSIX installation

Requires Node 22+, Git, and VS Code 1.95+.

1. Run `npm install` once in this Zeile folder.
2. Open the source folder in VS Code and press **F5**, choosing **Run Zeile extension**.
3. The watch task waits for extension/worker/webview builds, then opens an Extension Development Host loading directly from this folder.
4. Open the repository to review in that new window and run **Zeile: Open Review Map**.

For UI/CSS edits, save and wait for `[zeile-watch] ready`, then close/reopen the review tab. For extension/analyzer edits, restart the debug host after rebuilding. This is automatic rebuild, not extension-webview HMR. Stop the reusable task through **Tasks: Terminate Task → Watch Zeile**. The inspected repository needs no dependency installation or scripts.

For browser-only hot reload, run `npm run dev:webview` and open `http://127.0.0.1:5189`. This uses labeled demo data; real branch selection requires VS Code.

For distribution, run `npm run package`, then use **Extensions: Install from VSIX…** and reload VS Code. The current version is shown in `package.json` and diagnostics. Version 0.3.0 introduces connected-diff reading; it does not add inferred interface-to-implementation or network links.

## Verification and troubleshooting

- `npm run typecheck`
- `npm test`
- `npm run test:e2e` (install Chromium with `npx playwright install chromium`)
- `npm run build`
- `npm run package`
- `node scripts/check-watch.mjs`
- `node scripts/check-vscode.mjs` (native macOS VS Code smoke test, isolated temporary repository/profile)

Tests include diverged Git history, missing ancestry recovery, cancellation during revision resolution, unchanged-chain retention, nested ownership, bounded file sources, and an analyzer-generated 20-file browser review journey with real rectangle-intersection assertions and reading-history restoration. The native smoke test reads both committed sources, follows an unchanged service to a connector, and returns through history. These are correctness checks—not proof of review-speed improvement. The redesigned workflow still needs observed evaluation on representative PRs.

Use **Scope & limits** for source coverage. **Zeile: Show Diagnostics** opens the local Output channel with Git/worker/bridge startup results and elapsed time, not source contents. Mapping can be canceled and is stopped after two minutes. A missing webview connection warns after 15 seconds. No GitHub permissions or network credentials are required.

Architecture: `src/git.ts` reads immutable Git objects; `src/revisions.ts` resolves comparison scope; `src/analyze.ts` builds the bounded source index; the worker keeps analysis off the host thread; `src/extension.ts` bridges the sandboxed webview; `webview/` supplies compact scope, a wide source reader, and on-demand investigations. The Zeile folder itself need not be a Git repository.
