# External audit of class resolver design B

Audited revision: `67b6bf60b49cfb43a6ed2eed21d18174ed05d60c`.
Primary comparison: `git diff b6dafc80d0...67b6bf60b4`.
Audit branch: `codex/class-resolver-b-audit-1`.

Result: one major correctness finding, A1. No blockers or additional findings.
The audit adds probes and this report. It does not change production code.

## Completeness against the plan

The review used the conventions register, WP0–WP6, errata, and reviews in
`docs/class-resolver-b-plan.md`, the design and maintainer notes in `proposal.md`,
and `docs/DEFERRED.md`. The primary diff contains 105 files. The secondary review
included source collection, folding, DOM application, and hydration seeding.

| Work package                       | Assessment                                                   | Evidence                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP0: runtime hooks                 | Implemented.                                                 | Eight bundling symbol gates pass with the accepted hook symbols; the API gates and circular-dependency check pass.                                                                                                                                                |
| WP1: shared classifier             | Implemented.                                                 | Recognition is shared by emission, type checking, partial declarations, and diagnostics. Declaration and targeted-listener smoke tests pass.                                                                                                                      |
| WP2: full-form event               | Implemented in the cases probed.                             | A new refresh probe switches from replacement back to current sources and preserves an unmanaged class. Existing runtime and server tests pass.                                                                                                                   |
| WP3: shorthand and provider        | Implemented at runtime in the cases probed.                  | Direct method references preserve their receiver in both forms; moved and recreated embedded views retain their own callback context. A1 concerns the compiler's model of a different, unsafe invocation.                                                         |
| WP4: type checking and diagnostics | Incomplete: A1.                                              | The shorthand accepts a call that its literal full-form expansion rejects with TS2684. Output-alias, narrowing, parameter-shadowing, and two-way-binding controls pass under the TypeScript backend.                                                              |
| WP5: declaration rules             | Implemented in the TypeScript compiler and JIT cases probed. | Independent duplicate/chain rejection and targeted `HostListener` controls pass. The preprocessor exceptions remain deferred under R10.                                                                                                                           |
| WP6: automatic resolution          | Implemented in the cases probed.                             | New probes cover templates transplanted in both directions across an opt-out boundary, standalone `createComponent` plus attachment and host updates, and production component providers below a root without the feature. All three pass in ten randomized runs. |

The audit does not reclassify accepted behavior as a defect. This includes the
root-only automatic feature, view-scoped automatic resolvers, templates compiled
before activation, output shadowing, container diagnostics, normalization matching
production `[class]`, and explicit refreshes versus automatic memoization. It also
excludes the documented arrow-parameter diagnostic suppression and embedded-view
constructor hydration flag issue. A1 uses class methods with explicit `this`
parameters, so it does not depend on the deferred template arrow-parameter issue.

The stale WP5 container `minVersion` entry in `docs/DEFERRED.md` is superseded by
the WP5 review and implemented fix. It is not a new finding.

## Correctness

### A1 — major: shorthand checking erases a callback's explicit receiver requirement

With `strictTemplates: true`, an unsafe conditional callback compiles as a
shorthand. The required literal expansion produces TS2684. Both expressions throw
at runtime because selecting a method through a conditional expression loses its
receiver. A direct method reference remains valid and renders correctly.

```ts
class ExplicitThisConsumer {
  active = false;
  extra = 'extra';

  first(this: ExplicitThisConsumer, cn: BoundClassResolver) {
    return cn();
  }

  classes(this: ExplicitThisConsumer, cn: BoundClassResolver) {
    return cn(this.extra);
  }
}
```

```html
<!-- Current: no diagnostic. Rendering calls classes with this === undefined. -->
<div (class)="active ? first : classes"></div>

<!-- Literal expansion: TS2684. The same unbound call would throw at runtime. -->
<div (attr.class)="$event.resolve((active ? first : classes)($event.resolver))"></div>

<!-- Valid control: the property-reference call keeps the component as this. -->
<div (class)="classes"></div>
```

This violates the audit's type/runtime premise and B2's equivalence requirement.
D7's assignability check is present, but it discards information needed to check
the actual invocation.

Evidence:

- `packages/compiler-cli/test/ngtsc/class_resolver_audit_spec.ts`,
  `A1 should reject a shorthand conditional that loses an explicit this receiver`.
  Expected diagnostic codes: `[2684]`. Actual: `[]`. The probe fails in all four
  filesystems under both compiler backends. The diagnostic context is
  `<div (class)="active ? first : classes"></div>`.
- The same file's
  `should reject the literal expansion when its conditional loses an explicit this receiver`
  passes with `[2684]` under both backends. Its
  `should accept a direct shorthand method with an explicit this receiver`
  passes with `[]`.
- `packages/core/test/acceptance/class_resolver/external_audit_spec.ts`,
  `A1 reproduces an unbound method failure in the shorthand` and
  `A1 reproduces an unbound method failure in the literal expansion`.
  Both observe `TypeError: Cannot read properties of undefined (reading 'extra')`.
  Both pass in ten randomized runs because these are runtime reproductions that
  assert the exception. The compiler probe asserts the desired rejection and is
  deliberately left failing.
- The same runtime file's
  `preserves a method receiver in shorthand and its literal expansion` passes
  before and after a signal update. This prevents a proposed fix from rejecting
  all method callbacks.

Execution path:

1. `packages/compiler/src/typecheck/ops/events.ts:375` builds the resolver handler.
2. `packages/compiler/src/typecheck/ops/events.ts:399` wraps `F` as
   `((cb: ClassCallback) => cb)(F)`. The wrapper's return type loses the explicit
   `this: ExplicitThisConsumer` constraint.
3. `packages/compiler/src/typecheck/ops/events.ts:403` invokes the wrapper's result,
   so TypeScript never checks the receiver requirement of the original call.
   The full form instead takes the ordinary expression path at line 386.
4. `packages/compiler/src/template/pipeline/src/ingest.ts:2032` retains the original
   callee expression. Line 2036 emits the parenthesized conditional call, which
   has no component receiver.
5. `packages/core/src/render3/instructions/class_resolver.ts:372` invokes the
   compiled handler during refresh. Accessing `this.extra` throws before
   `resolve()` receives a result.

Fix proposal: validate assignability to `ClassCallback` separately, then check the
original `(F)($event.resolver)` invocation with its original type and receiver.
Preserve contextual inference for arrow parameters and rejection of unbranded
results. Keep the direct-method control passing. Changing `ClassCallback` to ban
every explicit receiver would reject valid direct method bindings.

### Verification

All Bazel commands acquired `/tmp/angular-bazel.lock` through `mkdir`, ran
`pnpm bazel shutdown`, and released the lock afterward. No output base or worktree
was created. Counts below come from the test logs, including pending specs.

| Gate                                                                                                      | Result                                                                                        |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `//packages/core/test/acceptance/class_resolver:class_resolver --runs_per_test=10`                        | Pass: 117 specs per run, 0 failures, 10/10 runs. Includes ten new audit specs.                |
| `//packages/core/test/acceptance/class_resolver:auto_resolution --runs_per_test=10`                       | Pass: 15 specs per run, 0 failures, 10/10 runs.                                               |
| `//packages/core/test/acceptance/class_resolver:auto_external_audit --runs_per_test=10`                   | Pass: 3 new specs per run, 0 failures, 10/10 runs.                                            |
| `//packages/core/test/acceptance:acceptance`                                                              | Pass: 2713 specs, 0 failures, 2 pending.                                                      |
| `//packages/platform-server/test:test`                                                                    | Pass: 418 specs, 0 failures.                                                                  |
| `//packages/platform-server/test:class_resolver_auto_hydration_test --runs_per_test=10`                   | Pass: 5 specs per run, 0 failures, 10/10 runs.                                                |
| `//packages/compiler/test:test`                                                                           | Pass, cached: 430 specs, 0 failures, 14 pending.                                              |
| `//packages/core:core_api`, `//packages/core:core_errors`                                                 | Both pass.                                                                                    |
| `//packages/compiler-cli:error_code_api`, `//packages/compiler-cli:extended_template_diagnostic_name_api` | Both pass.                                                                                    |
| Eight `//packages/core/test/bundling/*:symbol_test` targets from the plan                                 | All pass, cached.                                                                             |
| Full `//packages/compiler-cli/test/ngtsc:ngtsc`, with `--local_test_jobs=1`                               | 7174 specs across four shards: 4 A1 failures, 20 pending; no other failures.                  |
| Full `//packages/compiler-cli/test/ngtsc:ngtsc_ngp`, with `--local_test_jobs=1`                           | 7174 specs across four shards: 4 A1 failures, 2754 pending; no other failures.                |
| Compiler audit filter, both backends                                                                      | TypeScript: 44 specs, 4 A1 failures. NGP: 44 specs, 4 A1 failures, 12 accepted pending cases. |
| `pnpm ts-circular-deps:check`                                                                             | Pass: 0 cycles. Tool also reports 218 unresolved imports.                                     |
| Prettier and `git diff --check`                                                                           | Pass on the audit files.                                                                      |

The two full compiler targets deliberately remain red for A1. The audit file has
eleven test definitions, repeated across four filesystems. Three TypeScript-only
smoke cases cover accepted preprocessor gaps: the exposed-output warning and the
two host declaration errors. They are pending under NGP, with
`NGP_RUN_KNOWN_FAILURES=1` available to run them. Their exclusions are local to the
audit file because the user prohibited edits to the central list under `src/`.
An initial run before these exclusions reproduced those known gaps; they are not
additional findings.

To rerun just the compiler probes, use the repository's Bazel lock procedure and:

```sh
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc //packages/compiler-cli/test/ngtsc:ngtsc_ngp --local_test_jobs=1 --test_arg='--filter=class resolver external audit' --test_output=errors
```

The remaining supplied baseline compiler typecheck, extended-diagnostic,
compliance, and preprocessor gates were not rerun by this audit. Their reported
baseline results are inputs, not independent proof from this run. Browser, AOT
performance, and cost measurements remain outside the requested audit.

## Code style

No new finding. The scoped public API additions have user-facing JSDoc and
experimental tags. The runtime uses an opaque result type and concentrates the
event's sealing and provenance checks in one place. The added probes use
standalone declarations and asynchronous stabilization without manual change
detection. Formatting and whitespace checks pass.

## Code structure

No new finding. The shared classifier, normalizer, hook module, and automatic
resolution module implement the intended decomposition. The new probes exercise
public boundaries without adding production exports or test seams.

The duplicated host declaration validation in
`packages/compiler/src/jit_compiler_facade.ts:969` and
`packages/compiler-cli/src/ngtsc/annotations/directive/src/shared.ts:2099`, with
related template validation at
`packages/compiler/src/render3/r3_template_transform.ts:1187`, remains the
maintenance debt already noted in the WP5 review. The declaration smoke tests
show parity in the cases exercised. This audit found no new divergence that
warrants another finding.
