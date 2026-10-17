# Implementation plan: decisions of 2026-10-17 for the `(class)` resolver

Working document. It's removed when the work merges. The design is in
[`proposal.md`](../proposal.md); this plan says how to build it.

## Protocol

- The orchestrator dispatches one work package (WP) at a time to a fresh agent (`model: "opus"`),
  in the background, without isolation. The agent works only in the worktree named under
  [Environment](#environment).
- The dispatch prompt is the agent's whole context: the worktree path, this plan's Protocol,
  Conventions register, Environment, and Building blocks sections, and the agent's WP entry,
  pasted exactly. `proposal.md`, `docs/class-resolver.md`, and the other WP entries are
  off-limits; they would answer design questions that belong to the orchestrator.
- First action: `git status --short` in the worktree must print nothing. Note `HEAD`.
- Scope is the agent's WP entry only. Unrelated findings become one-line notes in
  `docs/DEFERRED.md`. Docs are the orchestrator's.
- A scope boundary is a design fork. If the WP can't be done without touching a file, API, error
  code, or behavior outside its entry or on the [out-of-scope list](#out-of-scope-ask-before-touching),
  stop and ask. Don't work around the boundary, and don't implement past it expecting approval.
- Ask, don't invent. On an ambiguity, a gate that stays red for outside reasons, a suspected
  design gap, or a needed scope crossing, write `## QUESTIONS` with the question and the two
  answers considered, end the turn, and wait. A scope question also states why the change is
  needed, the evidence (a failing probe or the code path), and the in-scope alternative that was
  tried or rejected.
- Edit file by file. Match the surrounding comment density and idiom.
- Commit once per WP, after the [gate ladder](#gate-ladder) is green, with the message given in
  the entry. Commit locally only. Never amend, rebase, or push.
- Report: files changed (one line each), gate outputs with exact counts, deviations and why,
  questions if blocked, and a risk self-assessment. Measured numbers only. Then wait.
- The orchestrator checks each question's premises against the code and this plan. A real design
  gap changes the plan first. Each ruling is appended under [Errata](#errata), and the register is
  edited in place. The same agent then resumes through `SendMessage`. A disagreement that survives
  one round goes to the owner with both positions.
- An agent that wrote code never reviews it.

## Conventions register

None of these is a bug or a gap. Don't fix them, soften them, or add alternatives.

### Owner rulings

| ID  | Ruling                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `ClassSources` is `[component, directives, template]`, each a `string[]`, ordered by source. Within a source, static classes come first, then `[class]`, then `[class.x]`. Same-name conflicts follow Angular's existing rules.                                                    |
| R2  | Components and directives can declare a host resolver with `host: {'(class)': …}` or `@HostListener('class')`. The template's `(class)` ranks above all of them.                                                                                                                   |
| R3  | The handler runs on every refresh of the view that declares the element. It runs while the view renders, so signal reads are tracked and a signal write throws `NG0600`.                                                                                                           |
| R4  | Hydration seeds the first resolution from the element's `class` attribute only when the element has no static classes.                                                                                                                                                             |
| R5  | One resolver runs per element: the highest-priority registration. `$event.inherited()` runs the registration it replaced; `$event.inherited(Directive)` runs a named directive's registration. The method isn't named `next`.                                                      |
| R6  | Dev mode warns with `NG0320` when a directive's or component's resolver never runs because another directive's resolver replaced it without delegating. A template that replaces a resolver stays silent, and so does a component that replaces its own host directive's resolver. |
| R7  | Host-level `(class)` always resolves. Only the template's `(class)` on an element with a directive output named `class` falls back to a listener, with `NG0319` in dev mode.                                                                                                       |
| R8  | No app-wide controls in core. App-wide default resolvers are open for comments in the proposal, not part of this work.                                                                                                                                                             |
| R9  | A partial declaration declares `minVersion: "22.3.0"` when its template has `(class)` on an element, or its host has a `class` listener.                                                                                                                                           |
| R10 | Nothing under `packages/compiler-cli/preprocessor/` changes.                                                                                                                                                                                                                       |
| R11 | Compliance tests target the TypeScript compiler.                                                                                                                                                                                                                                   |
| R12 | Commit messages follow the repository hook: `type(scope): lowercase summary`, a blank line, and a body wrapped at 72 characters that says what and why.                                                                                                                            |
| R13 | One Bazel server at a time, with the caps in `.bazelrc.user`. Run `pnpm bazel shutdown` after each gate ladder.                                                                                                                                                                    |

### Orchestrator defaults

Listed for the owner at review.

| ID  | Default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Registration order is priority order: the component's host directives, the component, other directives in match order, then the template. The runtime records it in first-creation order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D2  | A registration's owner is `getCurrentDirectiveIndex()` when `ɵɵclassResolver` runs: the directive's index in host-binding creation mode, `-1` in template code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D3  | `inherited(Directive)` must name a registration that ranks below the caller; the highest such registration of that type runs. Otherwise it throws `NG0321`. This rules out cycles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D4  | `inherited()` from the lowest registration returns the sources flattened in order: `[...component, ...directives, ...template]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D5  | `inherited()` normalizes the replaced resolver's result to `string[]`, keeping its order: a returned function is called with the same payload first; a string splits on whitespace; an array keeps its non-empty entries as strings; a `Set` keeps insertion order; an object map keeps the keys with truthy values; `null` and `undefined` give `[]`. Exact duplicates keep their first position.                                                                                                                                                                                                                                                                                                                                   |
| D6  | Error codes: `CLASS_RESOLVER_SHADOWED = 320` (warning) and `INHERITED_CLASS_RESOLVER_NOT_FOUND = 321` (error). Positive, because neither has a guide page on angular.dev.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D7  | `NG0320` rule: in dev mode, during the first update pass of the element's `TView`, after the element resolves, find the lowest registration that ran. If its owner is a directive, warn once for each registration below it, except a registration owned by one of the component's host directives when the component has a registration too. The component's host directives are the directives at indices `tNode.directiveStart` to `tNode.directiveStart + tNode.componentOffset - 1`. If the lowest that ran is the template, don't warn. The message is `The class resolver of <Name> on <<tag>> never runs, because the class resolver of <Name> replaces it without calling $event.inherited().`, with directive class names. |
| D8  | The payload is a plain array with a non-enumerable `inherited` property, one array per registration level. The three source arrays are shared between levels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D9  | A component's `minVersion` is raised to `22.3.0` after the existing blocks rule (`17.0.0`), so the blocks rule can't lower it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D10 | A registration on a node that isn't an element (`<ng-container>` or `<ng-template>`) falls back to `listenerInternal` without `NG0319`, as the template's `(class)` on `<ng-container>` compiles to a listener. It isn't a registration for D1 to D7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Environment

- Main checkout: `/Users/geruch/repos/angular-cn`, branch `feat/class-resolver`.
- Base: `feat/class-resolver` at the commit that adds this plan.
- Worktree: `/Users/geruch/repos/angular-cn-wt/class-resolver-decisions`, branch
  `feat/class-resolver-decisions`. The orchestrator creates it before the first dispatch:

  ```bash
  git worktree add -b feat/class-resolver-decisions /Users/geruch/repos/angular-cn-wt/class-resolver-decisions feat/class-resolver
  ```

  ```bash
  cp /Users/geruch/repos/angular-cn/.bazelrc.user /Users/geruch/repos/angular-cn-wt/class-resolver-decisions/
  ```

  ```bash
  pnpm --dir /Users/geruch/repos/angular-cn-wt/class-resolver-decisions install --frozen-lockfile
  ```

- Machine: a 16 GB Mac that also runs the owner's dev server. `.bazelrc.user` is git-ignored and
  caps jobs and workers; a worktree only has it if it's copied in. The main checkout's Bazel server
  is shut down before each dispatch. The worktree's first build is cold, in a new output base of
  about 6 to 8 GB; 33 GiB were free on 2026-10-17.
- Known tool problems:
  - Bazel can fail with `uv_os_homedir returned ENOENT` after the server outlives a shell. Run
    `pnpm bazel shutdown` and retry.
  - A shell hook may compress `cat` output; `/bin/cat` prints files as they are.
  - The commit hook runs `ng-dev format staged`, which can reformat staged files, and validates
    the message shape in R12.
- Pre-existing failures in the gate targets: none known.
  - Measured on 2026-10-17 at the base content: `class_resolver` 25 of 25 specs pass; the
    `r3_view_compiler_class_resolver` cases pass in `full`, `linked`, `declaration-only`, and
    `codegen`, and its golden test passes.
  - Measured at `eecc331074`, with only tests and docs changed since: the runtime acceptance suite,
    `platform-server` tests, `core_api`, `core_errors`, `ngtsc`, and the circular dependency check
    pass.

### Gate ladder

Run from the worktree, in order, before each commit. Each WP entry adds its own targets.

1. `pnpm prettier --write` on every changed file.
1. The WP's targeted tests.
1. The WP's regression targets.
1. `pnpm bazel shutdown`.

Runtime WPs (WP1 to WP3) use these regression targets:

```bash
pnpm bazel test //packages/core/test/acceptance:acceptance //packages/platform-server/test:test //packages/core:core_api //packages/core:core_errors
```

```bash
pnpm ts-circular-deps:check
```

A golden that changes on purpose is accepted with `pnpm bazel run //packages/core:core_api.accept`
or `pnpm bazel run //packages/core:core_errors.accept`, and the WP report names it.

## Building blocks

### B1: the registration list

Every `ɵɵclassResolver` call on an element that resolves becomes a registration, in priority order
(D1). `TClassResolver` records the owners once per template; each `LView` holds the handlers.

Before, in `packages/core/src/render3/interfaces/class_resolver.ts`:

```ts
export interface TClassResolver {
  /**
   * Index of the per-instance state in the `LView`:
   * - `index`: the `ClassResolverFn` registered by `ɵɵclassResolver`.
   * - `index + 1`: `KeyValueArray` of the classes applied by the previous resolution. ...
   */
  index: number;

  /** One segment per directive followed by the template's, from the lowest to the highest priority. */
  segments: TClassSourceSegment[];
}
```

After:

```ts
export interface TClassResolver {
  /**
   * Index of the per-instance state in the `LView`:
   * - `index`: the `ClassResolverFn`s registered by `ɵɵclassResolver`, in the order of `owners`.
   * - `index + 1`: `KeyValueArray` of the classes applied by the previous resolution. ...
   */
  index: number;

  /**
   * Owner of each registered resolver, from the lowest to the highest priority: the index of the
   * `DirectiveDef` in `TView.data`, or `-1` for the template.
   */
  owners: number[];

  /** One segment per directive followed by the template's, from the lowest to the highest priority. */
  segments: TClassSourceSegment[];
}
```

### B2: the owner of a registration

`getCurrentDirectiveIndex()` from `packages/core/src/render3/state.ts` returns `-1` in template
code and the directive's index while `invokeDirectivesHostBindings` runs its host bindings in
creation mode (D2).

### B3: error codes

In `packages/core/src/errors.ts`, next to `CLASS_RESOLVER_OUTPUT_CONFLICT = -319` (D6):

```ts
  CLASS_RESOLVER_SHADOWED = 320,
  INHERITED_CLASS_RESOLVER_NOT_FOUND = 321,
```

WP2 adds `INHERITED_CLASS_RESOLVER_NOT_FOUND`, and WP3 adds `CLASS_RESOLVER_SHADOWED`.

## Work packages

### WP1: keep every registration, and resolve host-level `(class)` next to `class` outputs

Scope:

- `packages/core/src/render3/interfaces/class_resolver.ts`: B1.
- `packages/core/src/render3/instructions/class_resolver.ts`: `ɵɵclassResolver`,
  `classResolverFirstCreatePass`, and `refreshClassResolvers`.
- `packages/core/test/acceptance/class_resolver/class_resolver_spec.ts`: the specs named below.

Behavior (R5 without delegation, R7):

- Every `ɵɵclassResolver` call appends a registration (B1). The owner comes from B2.
- A registration from template code (owner `-1`) on an element with a directive output named
  `class` (`tNode.outputs?.['class']` or `tNode.hostDirectiveOutputs?.['class']`) falls back to
  `listenerInternal`, as all registrations did before. `NG0319` is logged for it in dev mode, once,
  in the first creation pass.
- Host registrations always resolve, whatever outputs the element has.
- `refreshClassResolvers` runs only the last registration. Observable behavior for elements
  without a `class` output doesn't change.
- Hydration seeding stays as it is, and runs at most once per instance.

Before, in `ɵɵclassResolver`:

```ts
if (tView.firstCreatePass && tNode.classResolver === null) {
  classResolverFirstCreatePass(tView, lView, tNode);
}
const tClassResolver = tNode.classResolver;
if (tClassResolver === null) {
  listenerInternal(tView, lView, lView[RENDERER], tNode, 'class', resolverFn);
  return ɵɵclassResolver;
}
lView[tClassResolver.index] = resolverFn;
```

After, in shape:

```ts
const owner = getCurrentDirectiveIndex();
if (owner === -1 && hasClassOutput(tNode)) {
  // dev mode, first creation pass: NG0319
  listenerInternal(tView, lView, lView[RENDERER], tNode, 'class', resolverFn);
  return ɵɵclassResolver;
}
if (tView.firstCreatePass) {
  // create the TClassResolver at the first registration, then record the owner
}
const tClassResolver = tNode.classResolver!;
((lView[tClassResolver.index] ??= []) as ClassResolverFn[]).push(resolverFn);
```

Tests:

- Red first: rename the spec "turns every resolver into a listener when a directive has an output
  named class" to "keeps host resolvers next to a directive output named class", and change its
  assertions. Before the emit, the component's host resolver has run with `ClassSources` and the
  element's classes are resolved. On the emit, only the template handler receives `'sent'`.
  `NG0319` is logged once.
- New: a host directive exposing an output under the alias `class` next to a component's host
  resolver. The component's resolver runs.
- Every other spec in `class_resolver_spec.ts` stays green, unchanged.

Gates: the gate ladder, with targeted tests:

```bash
pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver
```

Commit: `fix(core): keep host class resolvers next to class outputs`

### WP2: `$event.inherited()`

Scope:

- `packages/core/src/render3/interfaces/class_resolver.ts`: the public `ClassSources` type.
- `packages/core/src/render3/instructions/class_resolver.ts`: payload construction, delegation,
  and normalization.
- `packages/core/src/errors.ts`: `INHERITED_CLASS_RESOLVER_NOT_FOUND` (B3).
- `goldens/public-api/core/index.api.md` and `goldens/public-api/core/errors.api.md`, through the
  accept targets.
- `packages/core/test/acceptance/class_resolver/class_resolver_spec.ts`: new specs.
- `packages/compiler-cli/test/ngtsc/template_typecheck_spec.ts`: one new spec in
  `strictOutputEventTypes and (class) bindings`.

Before, the public type:

```ts
export type ClassSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
];
```

After:

```ts
export type ClassSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
] & {
  /**
   * Runs the class resolver that this one replaced on the element, with the same sources, and
   * returns the class names it resolved. Without one, returns the class names the element would
   * have without resolution.
   *
   * @param directive Runs this directive's resolver on the element instead. It must rank below
   *     the caller.
   */
  inherited(directive?: Type<unknown>): string[];
};
```

Behavior (R5, D3, D4, D5, D8):

- `refreshClassResolvers` runs the last registration with its payload, as before.
- Each payload is a new plain array of the three shared source arrays, with `inherited` defined as
  a non-enumerable property.
- `inherited()` runs the registration one level lower with that level's payload, unwraps a
  returned function, and normalizes the result. At the lowest level, it returns the flattened
  sources.
- `inherited(Directive)` runs the highest registration below the caller whose owner's
  `DirectiveDef.type` is `Directive`, or throws `RuntimeError(INHERITED_CLASS_RESOLVER_NOT_FOUND)`.
  Dev message: `<Name> doesn't declare a class resolver on <<tag>> that ranks below this one.`
- Lower payloads are built only when `inherited` asks for them.

Tests, all red before the change:

- A component's host resolver adds a class; the template's resolver returns
  `[...$event.inherited(), 'extra']`. The element has both classes.
- The only resolver calls `$event.inherited()`. It returns the flattened sources.
- `Tooltip` and `Ring` declare host resolvers, and `Ring` ranks higher. The template calls
  `$event.inherited(Tooltip)`. `Tooltip`'s resolver runs, and `Ring`'s doesn't.
- `$event.inherited(Unrelated)` reports `NG0321` through the `ErrorHandler`.
- Table-driven: the replaced resolver returns a string, an array, a `Set`, an object map, and a
  function that returns an array. `inherited()` returns the class names in order each time.
- ngtsc: `<div (class)="resolve($event.inherited())"></div>` with `resolve(value: number)` reports
  `Argument of type 'string[]' is not assignable to parameter of type 'number'.`
- The existing spec "passes the classes of each source in priority order", which compares `$event`
  with `toEqual`, stays green. That shows `inherited` isn't enumerable.

Gates: the gate ladder, with targeted tests:

```bash
pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver
```

```bash
pnpm bazel test '--test_arg=--filter=strictOutputEventTypes and \(class\) bindings' //packages/compiler-cli/test/ngtsc:ngtsc
```

Check only: the new ngtsc spec also runs on the `ngp` backend. Run it there and report the result.
If it fails, stop and ask. The fix would be a pending entry in
`packages/compiler-cli/src/ngtsc/file_system/testing/src/ngp_known_failures.ts`, never a change
under `packages/compiler-cli/preprocessor/` (R10).

```bash
pnpm bazel test '--test_arg=--filter=strictOutputEventTypes and \(class\) bindings' //packages/compiler-cli/test/ngtsc:ngtsc_ngp
```

Commit: `feat(core): let a class resolver run the one it replaced`

### WP3: `NG0320` when a resolver never runs

Scope:

- `packages/core/src/render3/instructions/class_resolver.ts`: track which registrations ran during
  the first resolution, and warn.
- `packages/core/src/errors.ts`: `CLASS_RESOLVER_SHADOWED` (B3).
- `goldens/public-api/core/errors.api.md`, through the accept target.
- `packages/core/test/acceptance/class_resolver/class_resolver_spec.ts`: new specs, and
  `console.warn` assertions in the existing specs that now warn.

Behavior (R6, D7): tracking and warning happen only in dev mode and only while
`tView.firstUpdatePass` is true, so each element warns at most once. `refreshView` calls
`refreshClassResolvers` before it sets `tView.firstUpdatePass = false`
(`packages/core/src/render3/instructions/change_detection.ts`, lines 307 and 347 at the base), so
the flag is still true during the first resolution.

Tests:

- Red first: `<ui-button tooltip ring />`, where `Supplied` (the host directive of `UiButton`),
  `UiButton`, `Tooltip`, and `Ring` declare resolvers and `Ring` doesn't delegate. Two `NG0320`
  warnings, for `UiButton` and `Tooltip`, each naming `Ring`. `Supplied` doesn't warn, because its
  component `UiButton` declares a resolver.
- No warning when the template's resolver replaces the others.
- No warning when a component's resolver replaces its own host directive's resolver.
- A warning naming `Ring` when a component's host directive declares a resolver, the component
  doesn't, and `Ring` replaces it.
- No warning when every directive resolver above the lowest calls `inherited()`.
- No second warning after another change detection.
- The existing specs "runs only the resolver of the directive matched last" and "matches
  directives in the order of the imports" gain `console.warn` assertions for the warnings they now
  cause. "runs the component's @HostListener resolver, not its host-object or host directive's"
  gains an assertion that nothing warns.

Gates: the gate ladder, with targeted tests:

```bash
pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver
```

Commit: `feat(core): warn when a class resolver never runs`

### WP4: `minVersion: "22.3.0"` for `(class)` in partial declarations

Scope:

- `packages/compiler/src/render3/partial/directive.ts`: `getMinimumVersionForPartialOutput`.
- `packages/compiler/src/render3/partial/component.ts`: the component's `minVersion`.
- `packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_class_resolver/`: one new
  case and a regenerated `GOLDEN_PARTIAL.js`.

Behavior (R9, D9):

- Directives and components whose `meta.host.listeners` has the key `class` declare `22.3.0`.
- Components whose template has an element, other than `<ng-container>`, with a `(class)` output
  binding (`ParsedEventType.Regular`, no target) declare `22.3.0`. `<ng-template>` doesn't count.
  This matches the condition in `ingest.ts` that flags a class resolver.
- The component rule runs after the blocks rule.

`22.3.0` doesn't lock out the fork's own prerelease linkers. `getRange` in
`packages/compiler-cli/linker/src/file_linker/partial_linkers/partial_linker_selector.ts` strips
prereleases from both the declaration's `>=minVersion` and the linker's `<=version`, so a
`22.3.0-next.2` linker's range `<=22.3.0` intersects `>=22.3.0`. The existing spec "should return
the linker that matches the name and version, ignoring pre-releases" covers that stripping.

Before, in a regenerated golden for `class_resolver_element.ts`:

```js
static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "0.0.0-PLACEHOLDER", type: MyComponent, ...
```

After:

```js
static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "22.3.0", version: "0.0.0-PLACEHOLDER", type: MyComponent, ...
```

Tests:

- New case `class_resolver_with_blocks.ts`: a component whose template is
  `@if (show) { <div (class)="cn($event)"></div> }`. Its partial declaration has `22.3.0`, not
  `17.0.0`. Add its `_template.js` and `_isolated.golden.d.ts` files and a `TEST_CASES.json`
  entry, following the existing cases in the directory.
- In the regenerated `GOLDEN_PARTIAL.js`, every case with `(class)` on an element or host has
  `22.3.0`, and `class_resolver_ng_container.ts` keeps `14.0.0`.
- No other `GOLDEN_PARTIAL.js` changes.

Gates: the gate ladder, with these targeted tests in place of the runtime regression targets:

```bash
pnpm bazel run //packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_class_resolver.golden
```

```bash
pnpm bazel test //packages/compiler-cli/test/compliance/test_cases/...
```

```bash
pnpm bazel test --test_arg=--filter=r3_view_compiler_class_resolver //packages/compiler-cli/test/compliance/full:full //packages/compiler-cli/test/compliance/linked:linked //packages/compiler-cli/test/compliance/declaration-only:declaration-only //packages/compiler-cli/test/compliance/codegen:codegen
```

```bash
pnpm bazel test //packages/compiler/test:test
```

Check only: the compliance cases also run on the `ngp` backend and in the preprocessor's own
compliance suite. Run them and report the result. If one fails, stop and ask. The fix would be a
pending entry in `packages/compiler-cli/src/ngtsc/file_system/testing/src/ngp_known_failures.ts`,
never a change under `packages/compiler-cli/preprocessor/` (R10).

```bash
pnpm bazel test --test_arg=--filter=r3_view_compiler_class_resolver //packages/compiler-cli/test/compliance/full:full_ngp //packages/compiler-cli/test/compliance/codegen:codegen_ngp //packages/compiler-cli/test/compliance/declaration-only:declaration-only_ngp //packages/compiler-cli/preprocessor/test:test
```

Commit: `fix(compiler): require 22.3.0 to link class resolvers`

## Out of scope: ask before touching

- Anything under `packages/compiler-cli/preprocessor/` (R10).
- The template pipeline (`packages/compiler/src/template/pipeline/`) and type-check block
  generation (`packages/compiler/src/typecheck/`). WP2 adds a spec, not code.
- The extended diagnostics `NG8119` and `NG8111`.
- Hydration seeding in `ɵɵclassResolver`.
- The order or shape of `ClassSources` other than WP2's `inherited` (R1).
- Goldens other than `core_api`, `core_errors`, and WP4's `GOLDEN_PARTIAL.js`.
- Expectations of existing specs other than those a WP entry names.
- `proposal.md`, `docs/class-resolver.md`, and this plan.
- Git history and remotes.

## Errata

- 2026-10-17, owner: D7 and R6 exempt a component that replaces its own host directive's
  resolver, as the template is exempt, because the component author chose that host directive.
  WP3's tests change to match: the `<ui-button tooltip ring />` spec expects two warnings, not
  three.
- 2026-10-17, WP1 review: D10 added. A directive's host `(class)` on `<ng-container>` resolved
  against a comment node and threw in `applyStyling`, without a `class` output before WP1 and next
  to one after it. A registration on a node that isn't an element now falls back to a listener.
- 2026-10-17, WP1 review: `NG0319` is logged once per template registration that falls back, so
  two `(class)` bindings on one element warn twice. WP1's "once" means once per registration. No
  change.
- 2026-10-17, WP1 review: an output named `class` sets `TNodeFlags.hasClassInput`
  (`setShadowStylingInputFlags` in `packages/core/src/render3/view/directives.ts`), so the
  element's template `[class]` binding goes to directive inputs and is dropped, with or without a
  resolver. Upstream behavior, present at the base, and out of scope here. Noted in
  `docs/DEFERRED.md`; the owner decides whether to fix it.
