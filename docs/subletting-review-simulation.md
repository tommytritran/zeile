# Subletting PR: exploratory reviewer-agent evaluation

## Decision summary

The exercise did not demonstrate that Zeile improves PR review over GitHub plus an IDE. It demonstrated that the built workspace can support orientation and several source-navigation tasks on a real, large PR, while leaving important behavioral questions unresolved. Keep the product direction open: test the review process before investing in another map or overview redesign.

No product or Styrerommet source changes were made for this exercise. A temporary localhost harness and browser artifacts were used outside the repositories.

## Subject and procedure

- Repository: Styrerommet/Vibbo.
- PR: https://github.com/code-obos/styrerommet/pull/10008, Subletting APIs.
- Effective Before: `438bec63d734c2b4923fb110af3b2b97e9a80a57`.
- After: `76ab85b7c2046a1b5f15176df0a1859850abb526`.
- Scope: 101 changed files, 5,650 additions, 775 deletions, 85 commits.
- Actual built Zeile webview loaded with its actual analyzer output, not demo source or a hand-curated graph.
- Five independent reviewer-agent sessions, each using its own Chromium context at 1440 × 1000.
- UI-first access only: rendered source, file navigation, and relationships. Repository grep, raw graph access, and application-state extraction were prohibited.
- Approximate budget: 25 meaningful interactions or 10 minutes per session. Counting was not standardized closely enough for comparative click metrics.
- Correct comparison preloaded. Native VS Code integration, branch selection/freshness, checkpoint persistence, and runtime housing-application behavior were excluded.

The shared tasks were:

1. Establish purpose, starting point, and displayed comparison scope.
2. Explain approval during APIM failure and subsequent recovery.
3. Explain tenant identity and cleanup timing with multiple subletting tenants.
4. Explain termination success, conflict, and queued outcomes and corresponding frontend state.

## Persona lenses and outcomes

These are assigned expertise lenses, not human participants or validated models of seniority.

| Lens | Orientation | Approval/recovery | Tenant identity/cleanup | Termination/UI |
| --- | --- | --- | --- | --- |
| Junior React/JavaScript frontend | Answered | Partial | Partial | Partial |
| Senior Java/Spring/SQL backend | Answered | Partial | Partial | Partial |
| Senior TypeScript/React/GraphQL full-stack | Answered | Partial | Partial | Partial |
| Python/Django/Postgres platform | Answered | Partial | Partial | Partial |
| C#/.NET security/architecture | Answered | Partial | Partial | Partial |

These are conservative task assessments from agent reports cross-checked against selected UI transcripts, not independent blinded scores. None completed all behavioral tasks inside the budget; this is not proof that those tasks are impossible in Zeile or slower than a baseline.

Differences were mainly in emphasis: the platform lens inspected migrations; the security lens inspected authorization and target selection; the backend lens questioned error classification; the frontend lens inspected status badges. No reliable seniority or technology-stack effect was established.

## Observed useful interactions

- Comparison provenance and source-availability limits were visible and understood by the agents.
- The feature README supplied the domain/process model: local decision, external handoff, retry/reconciliation, identity, and known gaps. It was the main orientation source, not the directory or line-count summary.
- Function-focused reading exposed concrete permission, transaction, error-handling, and status branches.
- The `submitApimWrite` relationship investigation exposed ten incoming references, including production submission methods and tests. Some sessions followed a production caller or call-site into the application implementation.
- Agents generally separated documentation claims, inspected implementation, and runtime-unverified behavior rather than claiming approval readiness.

## Observed barriers

### A file list is not a review plan

Reviewers still had to discover the right README and decide the next source themselves. Counts describe size and provenance but do not explain the behavior being changed, assumptions, or evidence needed for a decision.

### Function references did not connect the important workflow

`submitApimWrite` showed no resolved outgoing dependencies despite visible operations. Useful incoming jumps did not establish callback execution, injected connector dispatch, transaction boundaries, or cross-system recovery. Those conclusions required source reading and documentation.

### Nested owning functions can hide the desired operation

The SQL connector appeared as a broad `createTransferApplicationConnector` review unit. Several sessions opened it but did not reach the tenant-scoping predicates before their budget ended. This suggests an operation-discovery problem, not merely a need for more graph nodes.

### Source presentation introduced navigation overhead

Sessions alternated file and function views and scrolled virtualized editor windows to obtain sufficient context. Markdown diagrams were raw Mermaid text; long Markdown lines were awkward in split comparison. An editor excerpt was not necessarily the complete function or file.

Some failed selectors were automation mistakes, not demonstrated human usability defects. Disabled exploration at file level was observable, but its effect on humans remains untested.

### Production and test relationships compete for attention

Neighbor lists combined production methods with verbose test callbacks. Tests were useful discovery leads, but their names were not executed-test evidence or behavioral guarantees.

### Evidence gathering did not preserve the review argument

The workspace provides notes/history, but the sessions did not establish a structured claim-to-evidence chain across approval, persistence, retry, identity, and frontend state. Important questions remained documentation-dependent or unverified when reviewers moved on.

## What this exercise cannot establish

- Five agents are not five independent human observations; they share model capabilities and likely biases. Similar recommendations are not a user preference vote.
- Review questions named the key concerns in advance, making this a guided comprehension exercise rather than an unprompted review. Agents were not tested on discovering omitted requirements or defects.
- Every session was required to try relationships. Their use does not demonstrate voluntary demand or that a diagram added value over a plain reference list.
- No GitHub-plus-IDE control condition was run. No speed, accuracy, completeness, or cost advantage was measured.
- A broad artificial interaction cap contributed to incomplete tasks. Reported run durations include automation/model overhead and must not be used as human review timings.
- Most findings concern reading the After implementation. We did not establish whether reviewers accurately distinguished new behavior from existing behavior in the diff.
- Branch correctness was supplied by the harness. The known stale-local-master default problem was deliberately not evaluated here.
- The actual housing application and its tests were not run. External API contracts, production scheduler wiring, authorization semantics, and operational guarantees remain outside the observed evidence.
- One full-stack session reported a driver collision and discarded its initial trail. Selected retained artifacts were checked, but the entire experiment is not a standardized reproducibility benchmark.
- One platform report proposed a Postgres rehearsal based on its persona background; Styrerommet uses SQLite/MSSQL. That recommendation is not adopted. Expertise-role prompting does not substitute for codebase facts.

## Product interpretation

The current hypothesis should be narrowed from “a function graph improves PR review” to:

> A reviewer can assemble and retain a source-backed explanation of a changed behavior with less reconstruction effort than in their existing workflow.

This is not yet a recommendation to implement a new evidence dashboard. First test whether the problem and improvement are real using a low-cost manual workflow.

Keep three alternatives alive:

1. Existing GitHub/IDE tools plus a better author-supplied review brief solve the problem; stop developing Zeile.
2. An evidence-and-question layer integrated with existing tools is useful; abandon the standalone reader/map direction.
3. Zeile's reader/reference navigation demonstrates an advantage on a narrow task; retain only that proven capability.

## Next experiment

1. Prepare an evidence rubric for the three behavioral tasks, checked by a Styrerommet maintainer. Separate local implementation facts, intended domain rules, and external assumptions.
2. Add genuinely review-oriented questions: what behavior changed from Before, what adverse scenario is unsupported, and what evidence would justify requesting changes? Do not give away every risk area in the task prompt.
3. Include tenant-change SQL predicates, legacy null-ID rows, external retry trigger ownership, and frontend pending-state distinctions as evidence to investigate, not pre-declared bugs.
4. Compare normal GitHub/IDE review with a manually prepared question/evidence worksheet. Include Zeile only as a separate condition, not as the assumed solution.
5. Use different, comparable PR slices or counterbalanced tasks to reduce learning effects. Do not review the same already-understood task twice and call the second run faster.
6. Observe real engineers where possible. Record correct evidence-backed conclusions, missed assumptions, unsupported confidence, context reconstruction, and whether reviewers voluntarily keep using the aid.
7. Prefer the least complex workflow that preserves review quality. If Zeile adds no meaningful advantage or introduces extra setup/navigation, narrow it or stop. Do not treat further UI polish as the default next step.

## Local artifacts

Temporary artifacts are under `/var/folders/l0/4_mj0ggd6tx8vkp5wbclby300000gn/T/opencode/`, including:

- `junior-study-1027/actions.log`, rendered text captures, and screenshots.
- `zeile-independent-platform-actions.jsonl` and `zeile-independent-platform-report.md`.
- `owned-study-04-relationships.txt`, `owned-study-05-accept.txt`, `owned-study-14-identity.txt`, `owned-study-15-modal.txt`, and `owned-study-16-resolver.txt`.

These artifacts include private repository source in rendered captures. They were kept local, are not part of this document, and should not be published or committed inadvertently. Temporary storage is not a durable archive.
