# Class resolver external audit

## Completeness against the plan

Audited implementation: `a391deb995`. Audit branch:
`codex/feat/class-resolver-decisions-audit-1`. The primary comparison is
`f28ecff43d...a391deb995`; dependent prototype code from
`ce30bb0889..f28ecff43d` is secondary scope. The brief is
[`class-resolver-audit-prompt.md`](class-resolver-audit-prompt.md).

The runtime probes pass. Compiler probes reproduce three correctness findings:
one major and two minor. Standards review adds one nit. No blocker was found.
The compiler probes deliberately retain their failing contract assertions as
audit evidence. This branch does not repair production code.

| Plan item                | Assessment and evidence                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP1; R2, R7; D1, D2, D10 | Runtime registration, host resolution beside outputs, template listener fallback, and container listeners are implemented. A1 shows that host type checking was not updated to match R7. A2 identifies a secondary-scope container classification error.                                                               |
| WP2; R5, R6; D3–D8       | Every registration runs and folds by origin. Independent probes cover duplicate template registrations, fresh tuples and arrays, inherited host listeners, and instance isolation during embedded-view movement and recreation. No fold defect was reproduced.                                                         |
| WP3                      | Withdrawn as required. No replacement warning or delegation API was added.                                                                                                                                                                                                                                             |
| WP4; R9; D9              | All 40 partial-version probe executions pass: nested `@if`, `@for` empty, `@switch`, deferred content and auxiliary blocks, and an explicit template containing an element resolver require `22.3.0`; ordinary container/template listeners keep `14.0.0`. Existing compliance cases cover host resolvers with blocks. |
| R1, R3, R4               | The identity-resolver probe agrees with native same-name precedence across 25 observed states. A signal read only by a lower host resolver updates moved embedded views. Existing signal-write and hydration tests remain the primary owners for those contracts.                                                      |
| R8, R10, R11             | No app-wide control was added. The implementation diff does not change the Rust preprocessor. TypeScript compliance tests remain present.                                                                                                                                                                              |
| R12, R13                 | Audit commits use the required hook format. Bazel invocations are serial and use the copied worker caps.                                                                                                                                                                                                               |

Probe files:

- Runtime: `packages/core/test/acceptance/class_resolver/class_resolver_audit_spec.ts`.
  The target runs 54 specs, 0 failures: 43 existing specs and 11 new probes.
- Compiler: `packages/compiler-cli/test/ngtsc/class_resolver_audit_spec.ts`.
  The filtered target runs 80 specs, 24 failures, 56 passes. Twenty cases run
  against OS/X, Windows, Unix, and native file systems. A1 accounts for eight
  failures, A2 for four, and A3 for twelve.

Reproduce the probes from this worktree, one command at a time:

```sh
pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc '--test_arg=--filter=external compiler audit' --local_test_jobs=1
pnpm bazel shutdown
```

Additional regression gates pass with the committed probes and unchanged
production source:

| Target                                                                                           | Result                            |
| ------------------------------------------------------------------------------------------------ | --------------------------------- |
| `//packages/core/test/acceptance:acceptance`                                                     | 2713 specs, 0 failures, 2 pending |
| `//packages/platform-server/test:test`                                                           | 413 specs, 0 failures             |
| `//packages/compiler/test:test`                                                                  | 430 specs, 0 failures, 14 pending |
| `//packages/core:core_api`                                                                       | 1 check passed                    |
| `//packages/core:core_errors`                                                                    | 1 check passed                    |
| `//packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_class_resolver.golden_test` | 1 check passed                    |
| `//packages/compiler-cli/test/compliance/full:full`                                              | 8 cases, 0 failures               |
| `//packages/compiler-cli/test/compliance/linked:linked`                                          | 8 cases, 0 failures               |
| `//packages/compiler-cli/test/compliance/declaration-only:declaration-only`                      | 8 cases, 0 failures               |
| `//packages/compiler-cli/test/compliance/codegen:codegen`                                        | 8 cases, 0 failures               |
| `//packages/compiler-cli/test/compliance/full:full_ngp`                                          | 8 cases, 0 failures               |
| `//packages/compiler-cli/test/compliance/codegen:codegen_ngp`                                    | 8 cases, 0 failures               |
| `//packages/compiler-cli/test/compliance/declaration-only:declaration-only_ngp`                  | 8 cases, 0 failures               |
| `//packages/compiler-cli/preprocessor/test:test`                                                 | 8 cases, 0 failures               |

The eight compliance and preprocessor targets use
`--test_arg=--filter=r3_view_compiler_class_resolver`. This includes the
eighth host-with-blocks case that was not remeasured on `ngp` in the supplied
baseline. The final handoff records the final audit commit and verification
at that commit.

The circular-dependency gate returned **0 cycles**, with **218 unresolved
imports** reported by the checker. The stock `pnpm ts-circular-deps:check`
command did not complete on this long worktree path: its absolute file glob
exhausted the default 4 GB Node heap. The completed run used Node `24.21.0`,
a 6 GB heap cap, and a temporary short symlink to this same worktree. An
independent file-system enumeration confirmed that the short glob selects
exactly the same **5524 physical TypeScript files**. No repository file or
dependency analyzer was changed for this workaround.

For reproduction, create a short symlink and a temporary configuration with
the following path substitutions. Set `realRoot` to the audit worktree and
`aliasRoot` to its short symlink:

```js
const path = require('node:path');
const realRoot = '/path/to/audit/worktree';
const aliasRoot = '/tmp/cr-audit/root'; // A symlink to realRoot.
const original = require(path.join(realRoot, 'packages/circular-deps-test.conf.cjs'));

module.exports = {
  ...original,
  baseDir: aliasRoot,
  glob: path.join(aliasRoot, '{packages,adev}/**/*.ts'),
  resolveModule(specifier) {
    const resolved = original.resolveModule(specifier);
    return resolved === null ? null : path.join(aliasRoot, path.relative(realRoot, resolved));
  },
};
```

With the pinned Node version selected, run
`NODE_OPTIONS=--max-old-space-size=6144 pnpm --silent ng-dev ts-circular-deps check --config /path/to/temporary/config.cjs`.
This is a tooling limitation; the stock command is not reported as passing.

The function-reference probes also measure a deferred behavior. A number-only
function reference compiles, then throws `TypeError: value.toFixed is not a
function` when runtime passes `ClassSources`. An explicit call rejects that
parameter type. The reference is the handler's returned value; validating its
signature falls within deferred return-type checking. It is not a finding.
The accepted lower/final normalization difference, class-output `[class]` drop,
partial-version over-declaration, and other exclusions are not findings.

## Correctness

### A1 major: Host resolver type checking still subscribes to class outputs

R7 requires host `(class)` to resolve beside a `class` output. The proposal
also says: "The host's `$event: ClassSources` type stays true." Runtime honors
that rule, but strict host type checking infers the output's `string` type.
Valid host resolvers fail compilation. This is a primary-scope integration gap:
WP1 changed runtime behavior while the type checker retained listener behavior.

```ts
@Component({template: '', host: {'(class)': 'resolve($event)'}})
class ResolvingHost {
  @Output('class') changed = new EventEmitter<string>();
  resolve(sources: ClassSources) {
    return '';
  }
}
// Runtime: resolve receives the three source arrays during rendering.
// Current compiler: string is not assignable to ClassSources.
// Required compiler behavior: accept this resolver.
```

Evidence:

- Compiler probe: `should type a host resolver beside its own output as
ClassSources`, and the corresponding `host directive alias` case, in
  `packages/compiler-cli/test/ngtsc/class_resolver_audit_spec.ts:27`.
  Each expects no diagnostic. Both produce
  `Argument of type 'string' is not assignable to parameter of type 'ClassSources'.`
  All eight file-system executions fail for that reason.
- Runtime smoke: `should give a host resolver ClassSources beside its own
output`, and the `host directive alias` case, in
  `packages/core/test/acceptance/class_resolver/class_resolver_audit_spec.ts`.
  Both pass: the handler receives `[['host'], [], ['user']]`, classes are
  `['host', 'user']`, and no warning is emitted.

Execution path:
`packages/compiler/src/typecheck/ops/scope.ts:702` queues directive-output
checking, and `:710` records claimed outputs.
`packages/compiler/src/typecheck/ops/events.ts:68` checks the host expression
against the output subscription. At `:148`, the unclaimed-output operation
skips it before reaching the `ClassSources` branch at `:165`.
Runtime `packages/core/src/render3/instructions/class_resolver.ts:68` only
falls back for owner `-1`, so host registrations continue to resolution.

Fix proposal: exclude regular, untargeted host `class` bindings from
directive-output subscription checking and claiming. Check them once as
resolvers with `ClassSources`. Keep template output subscription checking.
This also applies to exposed host-directive outputs; it does not concern the
deferred NG8119 alias diagnostic.

### A2 minor: An SVG ng-container is typed as an element resolver

D10 requires `(class)` on `ng-container` to remain a listener. Inside SVG,
the parser records its name as `:svg:ng-container`. Code generation removes
the namespace before recognizing the container, but type checking compares
the original name to the literal `ng-container`. A valid listener is rejected.
This defect is in secondary-scope prototype code.

```html
<svg>
  <ng-container (class)="accept($event)"></ng-container>
  <!-- accept(event: Event); this is a container listener. -->
  <!-- Current type checker supplies ClassSources; expected type is Event. -->
</svg>
```

Evidence: `should retain Event typing for an SVG ng-container class listener`
in `packages/compiler-cli/test/ngtsc/class_resolver_audit_spec.ts` expects no
diagnostic. All four executions produce
`Argument of type 'ClassSources' is not assignable to parameter of type 'Event'.`

Execution path:
`packages/compiler/src/ml_parser/parser.ts:1008` inherits the SVG namespace;
`packages/compiler/src/render3/r3_template_transform.ts:249` preserves the
element name. `packages/compiler/src/template/pipeline/src/ingest.ts:347`
splits that name and `:1663` correctly excludes the container from resolver
emission. `packages/compiler/src/typecheck/ops/events.ts:166` compares the
unsplit name and selects resolver typing instead.

Fix proposal: use the existing namespace-aware `isNgContainer` helper from
`packages/compiler/src/ml_parser/tags.ts:46` for the type-check predicate.
The partial-version visitor already uses it. Preserve listener typing and
emission for containers in every namespace.

### A3 minor: NG8111 is suppressed for ordinary class listeners

R7 and D10 preserve ordinary listeners for template output conflicts and
containers. Such listeners do not call functions returned by their expressions.
The NG8111 exemption checks only the event name, type, and target, so it also
suppresses the warning in those ordinary listeners. This lets an uninvoked
handler silently do nothing even when NG8111 is configured as an error.
This defect is in secondary-scope prototype code.

```html
<ng-template classEmitter (class)="handler"></ng-template>
<!-- classEmitter exposes a class output. Emitting it never calls handler. -->
<!-- Current diagnostics: none. Expected: NG8111; write handler() to call it. -->
```

Evidence:

- Compiler table: `should report an uninvoked function on an ordinary class
listener at ng-container`, `ng-template`, and `output`, in
  `packages/compiler-cli/test/ngtsc/class_resolver_audit_spec.ts`.
  Every execution reports `Expected [ ] to contain -998111`: twelve failures.
  NG8119 is explicitly suppressed to isolate NG8111 in the output case.
- Controls in the same file pass: `should enable NG8111 for an ordinary click
listener` produces `-998111`, and `should keep function references valid
for an element resolver` produces no diagnostics.
- Runtime table: `should leave function references uninvoked on ordinary
div class listeners`, and its `ng-container` and `ng-template` cases, in
  `packages/core/test/acceptance/class_resolver/class_resolver_audit_spec.ts`.
  All pass. One emitted output calls the explicit `called()` expression
  once and calls the function-reference expression zero times. This confirms
  delivery and isolates the missing invocation.

Execution path:
`packages/compiler-cli/src/ngtsc/typecheck/extended/checks/uninvoked_function_in_event_binding/index.ts:56`
returns before inspecting the expression for every regular, untargeted
`class` event. Container templates emit listeners through
`packages/compiler/src/template/pipeline/src/phases/reify.ts:341`, then
`packages/core/src/render3/instructions/listener.ts:33` calls
`listenerInternal` at `:122`. For an element with a template output conflict,
`packages/core/src/render3/instructions/class_resolver.ts:79` calls
`listenerInternal` instead. Neither path uses the returned-function
invocation at `class_resolver.ts:213`.

Fix proposal: exempt only bindings that actually resolve classes. Include
the owning node's namespace-aware container classification and template
output claims in that decision. Keep NG8111 for ordinary listeners and keep
function references valid for actual resolvers.

## Code style

### A4 nit: New emission tests omit the required stability wait

`AGENTS.md`, Testing, requires Act, Wait, Assert with
`await fixture.whenStable()` after an action. The new host-binding output
tests emit and immediately assert. Their callbacks currently mutate plain
arrays synchronously, so this is a documented convention violation, not a
reproduced runtime failure.

```ts
emitter.classEvent.emit('sent'); // EventEmitter delivers synchronously here.
expect(received).toEqual(['sent']); // Current test.

emitter.classEvent.emit('sent');
await fixture.whenStable(); // Required wait before assertions in this repository.
expect(received).toEqual(['sent']);
```

Evidence: `keeps subscribing a host binding to the output on <ng-container>`
and `<ng-template>` in
`packages/core/test/acceptance/class_resolver/class_resolver_spec.ts:466`
pass in the 54-spec, zero-failure target. Source inspection at `:483` shows
the emission and at `:485` the immediate assertion. The independent ordinary
listener probes described under A3 include the wait and also pass.

Execution path: the test emits at
`packages/core/test/acceptance/class_resolver/class_resolver_spec.ts:483`,
its `record` callback appends at `:473`, and the assertion runs at `:485`.
The revised host-resolver/output test also omits the wait at `:827`.

Fix proposal: add `await fixture.whenStable()` after those emissions and
before their assertions. No production change is required.

## Code structure

No independent structural finding was established. The runtime separates
collection, handler invocation, normalization, folding, and application into
helpers. `classSourceOf` shares source attribution between segment creation
and folding. Lower-only normalization and final application remain separate
as D5 requires.

Compiler classification is repeated across ingestion, type checking, partial
version detection, and extended diagnostics. A2 and A3 demonstrate concrete
disagreements rather than a hypothetical maintenance concern. Their fixes
should share the applicable classification rules and reuse `isNgContainer`;
this report does not count that recommendation as an additional finding.

The independent review axes produced three specification/correctness findings
(worst severity: major) and one standards finding (severity: nit).
