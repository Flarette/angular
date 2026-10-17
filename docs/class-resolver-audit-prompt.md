# External audit: the 2026-10-17 class resolver round

Working document. It's removed with the plan when the work merges.

## Stance

Zero trust. The code is assumed faulty until a probe shows otherwise. The existing tests assert
the authors' assumptions; correctness is shown by your own probes.

## Premises

- Types agree with runtime behavior.
- Unexpected behavior raises an explicit error. Silent degradation is a bug.
- API misuse that compiles is a design gap.
- Decomposition over complexity, for reuse.

## Inputs

- The plan, [`docs/class-resolver-plan.md`](class-resolver-plan.md): the Conventions register (R1
  to R13, D1 to D10), the WP entries, the Errata, and the Reviews. It states intent; the audit
  measures the code against it.
- The design, [`proposal.md`](../proposal.md), and the deferred findings,
  [`docs/DEFERRED.md`](DEFERRED.md).
- The branch `feat/class-resolver-decisions`.
  - Primary scope: the changes since `f28ecff43d`, the commit that added the plan.
  - Secondary scope: prototype code that this round's behavior depends on, from `ce30bb0889` to
    `f28ecff43d`. For example: `collectClassSources`, `applyResolvedClasses`, the styling hooks
    in `styling.ts`, the compiler's `ingest.ts` and `reify.ts` changes, and the type-check block.

### Don't flag these unless the code doesn't do what they say

Owner rulings and accepted costs:

- R1: `ClassSources` is `[component, directives, template]`, flat, ordered by source; static before
  `[class]` before `[class.x]` within a source.
- R2: host-level resolvers rank below the template's `(class)`.
- R3: handlers run on every refresh of the declaring view; a signal write throws `NG0600`.
- R4: hydration seeds the first resolution only when the element has no static classes.
- R5 and D8: every registration runs, lowest first; each later one receives the previous result
  folded back by origin. There's no `$event.inherited()`.
- R6: no warning about replaced resolvers.
- R7: host-level `(class)` always resolves on an element; only the template's `(class)` next to a
  directive output named `class` falls back to a listener, with `NG0319` per registration.
- R8: no app-wide controls in core.
- R9: `minVersion: "22.3.0"` for partial declarations that use `(class)`. Over-declaring is
  accepted; under-declaring isn't.
- R10: nothing under `packages/compiler-cli/preprocessor/` changes.
- D5: a lower resolver's result is normalized differently from how the highest one's is applied
  (for example, a number gives `[]` below but throws in dev mode at the top).
- D10: `(class)` on `<ng-container>` and `<ng-template>`, including host bindings, is a listener.

Deferred design, recorded in the plan or the proposal:

- An output named `class` makes Angular drop the element's template `[class]` binding. Upstream
  behavior, to be fixed in a separate upstream pull request.
- The blocks rule sets `minVersion` to `17.0.0` even when signal inputs or queries need `17.1.0` or
  `17.2.0`. Upstream behavior.
- No switch that makes a resolver replace the ones below it.
- The cost of running every resolver on every refresh isn't measured.
- Root components with a host `(class)`, `NG8119` for a host directive's output aliased as
  `class`, checking the handler's return type, and language service support.

## Deliverables

- Probes and smoke tests, committed on the audit branch as evidence. Put runtime probes in a new
  spec file next to `packages/core/test/acceptance/class_resolver/class_resolver_spec.ts`, and
  compiler probes next to the existing compiler or compliance tests. Don't change files under any
  `packages/*/src/` directory.
- A report at `docs/class-resolver-audit-report.md` on the audit branch, with four sections:
  completeness against the plan, correctness, code style, and code structure. One finding per
  item, each with:
  - An ID (`A1`, `A2`, …) and a severity (blocker, major, minor, nit).
  - The evidence: the probe's file and test name, and its output.
  - The execution path, as `file:line` references.
  - A fix proposal.
