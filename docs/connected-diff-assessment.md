# Connected-diff refactor: assessment and evaluation scope

## Decision

The source-backed subletting slice is `TransferApplication.accept` → `submitToApim` → `submitApimWrite`, with a return to `accept` for result consumption. Retry enters submission independently through `CheckTransferApplicationsCommand.resubmitIfOwed`; it does not rerun approval's result-consumption branch. SQL submission markers, residency confirmation, and frontend presentation require separate evidence.

The previous interaction hid relationships behind a separate investigation screen after the reviewer had already found a function. The refactor makes connected diff navigation part of reading, while keeping the complete file inventory and the older explicit investigation available.

## Implemented scope

- Overview suggests groups of changed production files linked by directed references from one revision, directly or through one unchanged function. Shared utility consumers alone do not form a link. Connected components are suggestions, not domain workflows; broad components and missing boundaries remain possible.
- The reader displays a bounded incoming → selected → outgoing reference graph. Every related symbol opens its actual diff. The arrows do not imply execution sequence, returned-value data flow, or runtime dispatch.
- References from nested implementations are included with the originating call-site evidence. No callback invocation or interface implementation edges are invented.
- Tests are separated, unchanged bridges are labeled, and Before/After reference evidence never mixes snapshots.
- A searchable per-file symbol browser exposes nested factory operations and unchanged source that owner-level review units conceal.
- Callback names no longer embed large chained expressions. IDs remain best-effort lexical names, not semantic identities across arbitrary refactors.
- Default target selection prefers remote-tracking conventional branches over potentially stale local targets. No fetch or GitHub parity claim is introduced.

## Deliberately unresolved

The APIM connector is invoked through an interface and injected context. The analyzer cannot establish that concrete dispatch; users must still inspect wiring. A union-typed retry invocation can resolve one declaration without proving it is the only runtime implementation. References are explicitly labeled accordingly. Root-only compiler configuration, snapshot limits, missing generated declarations, and framework/network boundaries still limit coverage.

Grouping is not a PR-wide execution graph and does not guarantee every changed line is reached from a suggested group. All files remain available. No manually curated subletting edges or PR-specific production behavior were added.

## Human evaluation

Install 0.3.0, open Styrerommet, verify Before=`origin/master`, After=`origin/feat/subletting_api`, and PR comparison mode. Start from a related group or the application `accept` diff; follow submission and return to its consumers while reading actual changes. Check whether nested operation search helps reach SQL cleanup rather than reading the whole factory.

Evaluate correlated reading, not whether the diagram looks useful: did you find the relevant changed consumers, keep enough unchanged context, distinguish Before from After relationships, and avoid losing the original diff? Report missing connections and oversized groups rather than assuming they represent actual workflow boundaries. No review-quality or speed improvement is claimed until human evaluation.
