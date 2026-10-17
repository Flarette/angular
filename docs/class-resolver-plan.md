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

| ID  | Ruling                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `ClassSources` is `[component, directives, template]`, each a `string[]`, ordered by source. Within a source, static classes come first, then `[class]`, then `[class.x]`. Same-name conflicts follow Angular's existing rules.                                                                                       |
| R2  | Components and directives can declare a host resolver with `host: {'(class)': …}` or `@HostListener('class')`. The template's `(class)` ranks above all of them.                                                                                                                                                      |
| R3  | The handler runs on every refresh of the view that declares the element. It runs while the view renders, so signal reads are tracked and a signal write throws `NG0600`.                                                                                                                                              |
| R4  | Hydration seeds the first resolution from the element's `class` attribute only when the element has no static classes.                                                                                                                                                                                                |
| R5  | Every registration runs on each refresh, from the lowest to the highest priority (D1). The lowest receives the collected sources; each later one receives the previous result folded back into `ClassSources` (D8). The highest registration's result becomes the element's classes. There's no `$event.inherited()`. |
| R6  | No warning about replaced resolvers: every resolver runs, so none is shadowed. There's no `NG0320` or `NG0321`.                                                                                                                                                                                                       |
| R7  | Host-level `(class)` always resolves. Only the template's `(class)` on an element with a directive output named `class` falls back to a listener, with `NG0319` in dev mode.                                                                                                                                          |
| R8  | No app-wide controls in core. App-wide default resolvers are open for comments in the proposal, not part of this work.                                                                                                                                                                                                |
| R9  | A partial declaration declares `minVersion: "22.3.0"` when its template has `(class)` on an element, or its host has a `class` listener.                                                                                                                                                                              |
| R10 | Nothing under `packages/compiler-cli/preprocessor/` changes.                                                                                                                                                                                                                                                          |
| R11 | Compliance tests target the TypeScript compiler.                                                                                                                                                                                                                                                                      |
| R12 | Commit messages follow the repository hook: `type(scope): lowercase summary`, a blank line, and a body wrapped at 72 characters that says what and why.                                                                                                                                                               |
| R13 | One Bazel server at a time, with the caps in `.bazelrc.user`. Run `pnpm bazel shutdown` after each gate ladder.                                                                                                                                                                                                       |

### Orchestrator defaults

Listed for the owner at review.

| ID  | Default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Registration order is priority order: the component's host directives, the component, other directives in match order, then the template. The runtime records it in first-creation order.                                                                                                                                                                                                                                                                                                                |
| D2  | A registration's owner is `getCurrentDirectiveIndex()` when `ɵɵclassResolver` runs: the directive's index in host-binding creation mode, `-1` in template code.                                                                                                                                                                                                                                                                                                                                          |
| D3  | No API names another directive's resolver.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D4  | The lowest registration receives the sources as `collectClassSources` returns them.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D5  | Before it's folded, a result is normalized to `string[]`, keeping its order: a returned function is called once with the same payload first; a string splits on whitespace; an array, a `Set`, and the keys of an object map with truthy values keep their entries as strings and drop empty ones; `null`, `undefined`, and any other value give `[]`. Exact duplicates keep their first position. The highest registration's result isn't normalized; it's applied as before.                           |
| D6  | No new error codes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D7  | No `NG0320` rule (R6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D8  | Fold by origin: each class of a normalized result goes to the source it had in that registration's payload, in the result's order. A class the payload didn't have goes to the owner's source: `component` for the component and its host directives, `directives` for other directives (the rule `classResolverFirstCreatePass` uses for segments), `template` for the template. A class the result leaves out is gone for later registrations. Each registration gets a new tuple of three new arrays. |
| D9  | A component's `minVersion` is raised to `22.3.0` after the existing blocks rule (`17.0.0`), so the blocks rule can't lower it.                                                                                                                                                                                                                                                                                                                                                                           |
| D10 | A registration on a node that isn't an element (`<ng-container>` or `<ng-template>`) falls back to `listenerInternal` without `NG0319`, as the template's `(class)` on `<ng-container>` compiles to a listener. It isn't a registration for D1 to D7.                                                                                                                                                                                                                                                    |

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

Runtime WPs (WP1 and WP2) use these regression targets:

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

No new error codes (R6, D6).

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

### WP2: run every registration and fold its result

Scope:

- `packages/core/src/render3/instructions/class_resolver.ts`: `refreshClassResolvers`, and new
  helpers for normalizing (D5) and folding (D8) a result.
- `packages/core/test/acceptance/class_resolver/class_resolver_spec.ts`: the specs named below.

Behavior (R5, D4, D5, D8):

- `refreshClassResolvers` collects the sources once per element, then runs its registrations from
  the lowest to the highest, each with its own payload.
- Below the highest, each result is unwrapped (a returned function is called once with the same
  payload), normalized (D5), and folded (D8) into the next registration's payload.
- The highest registration's result is unwrapped and applied as before.
- An element with one registration behaves as before.
- `ClassSources`, `ClassResolverFn`, `packages/core/src/errors.ts`, and the public API goldens
  don't change.

Example, with the spec fixtures in "with several resolvers on one element", where each resolver
returns `[...sources.flat(), 'by-<name>']`, and `<ui-button tooltip ring class="tpl" (class)="resolve($event)" />`
imports `[UiButton, Tooltip, Ring]`:

```text
collected:            [['cmp'], ['ring'], ['tpl']]
after supplied:       [['cmp', 'by-supplied'], ['ring'], ['tpl']]
after cmp-listener:   [['cmp', 'by-supplied', 'by-cmp-listener'], ['ring'], ['tpl']]
after tooltip:        [['cmp', 'by-supplied', 'by-cmp-listener'], ['ring', 'by-tooltip'], ['tpl']]
after ring:           [['cmp', 'by-supplied', 'by-cmp-listener'], ['ring', 'by-tooltip', 'by-ring'], ['tpl']]
template receives the last line and returns it flattened plus 'by-template'.
```

This is the orchestrator's prediction from the fixtures; the specs measure it.

Tests, red first:

- Rewrite in "with several resolvers on one element"; these expectations change on purpose:
  - "runs only the template resolver" becomes "runs every resolver from the lowest to the
    highest priority". `ranResolvers()` is `['supplied', 'cmp-listener', 'tooltip', 'ring',
'template']`, the template's `$event` is the last payload in the example, and the element has
    every `by-` class next to `cmp`, `ring`, and `tpl`.
  - "runs only the resolver of the directive matched last" becomes "runs directive resolvers in
    match order": `['supplied', 'cmp-listener', 'tooltip', 'ring']`.
  - "matches directives in the order of the imports": `['supplied', 'cmp-listener', 'ring',
'tooltip']`.
  - "runs the component's @HostListener resolver, not its host-object or host directive's"
    becomes "runs the component's host directive resolver, then its @HostListener resolver":
    `['supplied', 'cmp-listener']`.
- Rewrite in "in host bindings": "gives precedence to the template (class) binding" becomes
  "passes the component's resolved classes to the template (class) binding". The template's
  `$event` is `[['py-1'], [], ['px-4']]`, and the classes are `['px-4', 'py-1']`.
- New:
  - A lower resolver leaves out a template class and appends one: the next payload doesn't have
    the left-out class and has the appended one at the end of the owner's source.
  - An appended class ranks at its owner's source: a component resolver returns
    `[...sources.flat(), 'bg-muted']` with host class `bg-primary` and template class
    `bg-red-600`; the template's `$event` is `[['bg-primary', 'bg-muted'], [], ['bg-red-600']]`.
  - Table-driven (D5): the lower resolver returns `'a  b'`, `['a', '', 'b']`,
    `new Set(['a', 'b'])`, `{a: true, x: false, b: 1}`, `() => ['a', 'b']`, `null`, and `42`. The
    next payload, flattened, is `['a', 'b']` for the first five and `[]` for the last two.
- Every other spec in `class_resolver_spec.ts` stays green, unchanged.

Gates: the gate ladder, with targeted tests:

```bash
pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver
```

Commit: `feat(core): run every class resolver on an element in order`

### WP3: withdrawn

Withdrawn on 2026-10-17 with R6: every resolver runs, so no warning is needed.

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
  generation (`packages/compiler/src/typecheck/`).
- The extended diagnostics `NG8119` and `NG8111`.
- Hydration seeding in `ɵɵclassResolver`.
- The order or shape of `ClassSources` (R1).
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
- 2026-10-17, owner: the upstream `[class]` drop next to an output named `class` stays as it is.
  `proposal.md` documents it under "Directive outputs named `class`", and the fix goes to a separate
  upstream pull request. No WP changes.
- 2026-10-17, owner, on WP2's question about the `inherited` type: every resolver runs, lowest
  first, and each receives the previous result folded back by origin (R5, D8). `inherited()`,
  `inherited(Directive)`, `NG0320`, and `NG0321` are dropped (R6, D3, D6, D7); a directive argument
  would depend on match order, which the consumer can't see. WP2 is re-scoped, WP3 is withdrawn,
  WP4 is unchanged. No escape hatch for full replacement: a consumer filters `$event`. The WP2
  agent's normalization becomes D5, including its two refinements (`Set` and object-map entries
  are converted like array entries; other values give `[]`).

## Reviews

- WP1 (`d9fd7f974e`, fixup `8cf37b05c8`): orchestrator 9.25, Codex 9.50 after the fixup.
  - The renamed spec's fixture changed beyond its assertions, so the resolution is observable.
    Disclosed; no fixup.
  - `classResolverFirstCreatePass` now also records owners for later registrations; the name
    covers only its first job. A refactoring round could rename it.
  - The fixup's specs cover `<ng-container>` but not `<ng-template>`, which takes the same branch.
- WP2 (`16bff0c067`, fixup `b656a58a56`), re-scoped to the fold: orchestrator 9.25, Codex 9.30
  before the fixup.
  - The fixup adds duplicate rows and a spec that the returned function runs once with the same
    payload, uses `for...of` in `toClassNames`, and updates the `ɵɵclassResolver` and
    `ClassSources` JSDoc for the fold.
  - `classSourceOf` is a helper the entry didn't name; it keeps the segment rule and the fold's
    owner rule in one place.
  - D5's normalization differs from the final application on purpose: a number from a lower
    resolver gives `[]`, while the highest resolver's number throws in dev mode; an array entry
    with a space stays one entry until a later resolver joins it.
- WP4 (`9b5058acbc`): orchestrator 9.50, Codex 9.75.
  - No spec covers a host `(class)` together with blocks; the same final rule handles it.
  - The template rule also flags foreign components, which the template pipeline skips. That can
    only over-declare `22.3.0`. Selectorless components aren't ingested yet, so none is missed.
  - The `docs/DEFERRED.md` note about the blocks rule lowering `17.1.0` and `17.2.0` is allowed by
    the Protocol.
- Comment cleanup (`47d9ec20eb`, fixup `a718e63f8d`): Codex 8.50 before the fixup. Product code
  is identical with comments stripped. The fixup makes the emission spec run on `<ng-template>`
  too, because the first `<ng-template>` spec never emitted. The sweep's claim that the `-1`
  branch of `classSourceOf` is dead is wrong: two template `(class)` bindings on one element
  reach it. `63619a7871` narrows the `ɵɵclassResolver` JSDoc for containers.
