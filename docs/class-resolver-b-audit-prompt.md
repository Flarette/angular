# External audit: the design B class resolver round

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

- The plan, [`docs/class-resolver-b-plan.md`](class-resolver-b-plan.md): the Conventions register
  (owner rulings B1 to B16, carried-over rulings R1, R3, R4, R5, R10 to R13, orchestrator defaults
  D1 to D13), the WP entries (WP0 to WP6), the Errata, and the Reviews. It states intent; the
  audit measures the code against it.
- The design, [`proposal.md`](../proposal.md), including its notes for maintainers, and the
  deferred findings, [`docs/DEFERRED.md`](DEFERRED.md).
- The branch `feat/class-resolver-b`.
  - Primary scope: the changes since `b6dafc80d0`, the commit that added the plan: the runtime
    under `packages/core/src/render3/` (`instructions/class_resolver.ts`,
    `instructions/class_resolver_hook.ts`, `class_resolver_auto.ts`,
    `class_resolver_provider.ts`, `interfaces/class_resolver.ts`, and the edits in
    `change_detection.ts`, `styling.ts`, `element.ts`, `component_ref.ts`), the compiler under
    `packages/compiler/src/` (`render3/r3_class_resolver.ts`, `render3/r3_template_transform.ts`,
    `render3/partial/`, `template/pipeline/`, `typecheck/`, `jit_compiler_facade.ts`), and
    `packages/compiler-cli/src/` (diagnostics, extended checks, directive annotations, the
    out-of-band recorder), with their specs and goldens.
  - Secondary scope: the first round's code that this round builds on, such as
    `collectClassSources`, `foldClassNames`, `applyResolvedClasses`, and hydration seeding.

### Don't flag these unless the code doesn't do what they say

Owner rulings and accepted costs:

- B1 and B2: the full form `(attr.class)` and its `ClassResolveEvent`; the shorthand `(class)="F"`
  means exactly `(attr.class)="$event.resolve((F)($event.resolver))"`, so `$event` is in scope
  inside `F`.
- B4 and B16: the fixed resolver contract `(...classes: string[]) => string`, one string per
  source, and the plain merge without a provider. No declaration merging.
- B5: extras and `resolve()` read values the way `[class]` does in production; names containing
  a space are dropped.
- B7: `(class)` and `(attr.class)` always resolve and shadow a directive output with the same name;
  `NG8120` warns at compile time.
- B8: on `<ng-container>` and `<ng-template>`, `NG8121` at compile time (TypeScript compiler only)
  and `NG0321` at runtime in dev mode, logged once per view creation.
- B9 to B11: `@HostListener('class')` and `@HostListener('attr.class')` are errors; one resolver
  per directive and per element; a chain in `(class)` is an error.
- B13 and D12: the runtime is reached only through three module-level hooks; each bundling golden
  holds `_refreshClassResolvers` and `_setUpClassResolution`, and the two forms goldens also hold
  `_registerClassResolverBinding`. A JIT app carries the runtime, as it carries every instruction.
- B14: automatic resolution is declared at the root only. Below a root without it, dev mode throws
  `NG0322` and production ignores the declaration. An automatically resolved element uses its
  view's resolver, not its own injector (a recorded departure from D5).
- The owner accepted, and the proposal documents, that a template compiled before the first
  `withAutoResolution()` call never gets automatic resolution.
- D10: automatic resolution skips the resolver and the diff when no source's string changed;
  explicit resolvers run on every refresh (R3).
- R10: nothing under `packages/compiler-cli/preprocessor/` changes; specs that the preprocessor
  fails are in `ngp_known_failures.ts`.
- Runtime error codes 320 to 323 are positive, so they print no documentation link.
- `ɵɵclassResolver`'s `flags` parameter is typed `number`.
- A linked partial declaration isn't re-validated for a chain in a host `(class)`.

Deferred design and known issues, recorded in the plan, the proposal, or `docs/DEFERRED.md`:

- A TypeScript error that starts at an arrow parameter in a template is dropped (upstream
  `/*D:ignore*/` marker), so `(class)="(cn) => () => cn()"` compiles. Fixed on a separate branch.
- A constructor that calls `ViewContainerRef.createEmbeddedView` overwrites the creation flag that
  hydration seeding reads. It predates the round.
- Type checking doesn't run the unclaimed-output check for `<ng-template>`, so `NG8121` and
  `NG8111` branches for it are unreachable until a separate container fix.
- Reserving the whole `(attr.*)` namespace, resolving other attributes, a `(style)` counterpart,
  a second automatic-resolution flag for plain elements, lazy setup, and language service support.
- Production-mode, AOT, and browser cost measurements. The proposal's cost table is JIT dev mode.

## Deliverables

- Probes and smoke tests, committed on the audit branch as evidence. Put runtime probes in new
  spec files next to `packages/core/test/acceptance/class_resolver/class_resolver_spec.ts` (or in
  the `auto_resolution` target for automatic resolution, which turns on for the whole process),
  and compiler probes next to the existing compiler, ngtsc, or compliance tests. Don't change files
  under any `packages/*/src/` directory.
- A report at `docs/class-resolver-b-audit-report.md` on the audit branch, with four sections:
  completeness against the plan, correctness, code style, and code structure. One finding per
  item, each with:
  - An ID (`A1`, `A2`, …) and a severity (blocker, major, minor, nit).
  - The evidence: the probe's file and test name, and its output.
  - The execution path, as `file:line` references.
  - A fix proposal.
