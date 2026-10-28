# Implementation plan: the `resolve()` class event (design B)

Working document. It's removed when the work merges. The design is in
[`proposal.md`](../proposal.md), section "Next: the `resolve()` class event" and the decisions dated
2026-10-26 and 2026-10-28. This plan says how to build it.

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
- Tests come first. Each WP entry names the specs that must fail before the change. Run them red,
  note the failure, then implement.
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

Carried over from the merged prototype:

| ID  | Ruling                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | `ClassSources` is `[component, directives, template]`, each a readonly `string[]`, ordered by source. Within a source, static classes come first, then `[class]`, then `[class.x]`. Same-name conflicts follow Angular's existing rules.                                                   |
| R3  | An explicit resolver runs on every refresh of the view that declares the element, while the view renders, so signal reads are tracked and a signal write throws `NG0600`.                                                                                                                  |
| R4  | Hydration seeds the first resolution from the element's `class` attribute only when the element has no static classes.                                                                                                                                                                     |
| R5  | Every registration on an element runs on each refresh, from the lowest to the highest priority: the component's host directives, the component, other directives in match order, then the template. Each later one receives the previous result folded back into `ClassSources` by origin. |
| R10 | Nothing under `packages/compiler-cli/preprocessor/` changes. Specs that the Rust preprocessor fails go into `packages/compiler-cli/src/ngtsc/file_system/testing/src/ngp_known_failures.ts`.                                                                                               |
| R11 | Compliance tests target the TypeScript compiler.                                                                                                                                                                                                                                           |
| R12 | Commit messages follow the repository hook: `type(scope): lowercase summary`, a blank line, and a body wrapped at 72 characters that says what and why. No attribution lines.                                                                                                              |
| R13 | One Bazel server at a time on the machine, with the caps in `.bazelrc.user` and the Bazel lock under [Environment](#environment). Run `pnpm bazel shutdown` after each gate ladder.                                                                                                        |

Design B, decided on 2026-10-26 and 2026-10-28:

| ID  | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | The full form is `(attr.class)`. `$event` is a `ClassResolveEvent`: `sources: ClassSources`, `resolver(...extras): ResolvedClasses`, and `resolve(classes): void`. If the handler doesn't call `resolve()`, the payload passes through unchanged. A repeated call, or one after the handler returns, throws in dev mode; in production a late call is ignored and the last call during the handler wins. `resolve()` takes a `ClassBindingValue` or a `ResolvedClasses`, never a function. The handler's return value is ignored.                                                                                                                        |
| B2  | The shorthand `(class)="F"` means exactly `(attr.class)="$event.resolve((F)($event.resolver))"`. `F` is one expression whose value is `(cn: BoundClassResolver) => ResolvedClasses`: an arrow function or a reference to a field. `ResolvedClasses` is opaque, like `SafeValue`, and only a bound resolver creates one. Type checking rejects any other result. In dev mode, a shorthand result that isn't a `ResolvedClasses` from its own event throws, with the same code as B1's misuse. Production skips that check.                                                                                                                                |
| B3  | `NG8111` exempts only a shorthand `(class)` that resolves. It reports `(attr.class)` like any other event binding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B4  | `provideClassResolver(resolver: ClassResolver, ...features: ClassResolverFeature[]): Provider`, where `ClassResolver` is `(...classes: string[]) => string`. Angular normalizes the sources and the extras to strings first, then calls the resolver with one space-joined string per source, in priority order, with the extras at the end of the caller's string. The resolver is looked up through the element's injector, so a library scopes its own with `viewProviders`. Without a registration, the resolver is the plain merge: flatten the sources in order, drop empty and repeated names (keeping the first position), and join with spaces. |
| B5  | Extras and `resolve()` read a value the way `[class]` does in production. A string splits on whitespace, an array or a `Set` lists names, an object map keeps the keys whose values are truthy, and a top-level `null`, `undefined`, `false`, or `''` adds nothing. The type is `ClassBindingValue`: `string \| readonly string[] \| ReadonlySet<string> \| {readonly [className: string]: unknown} \| null \| undefined \| false`.                                                                                                                                                                                                                      |
| B6  | Extras rank at the end of the caller's own source: the source the fold gives a class that the registration's owner adds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B7  | `(class)` always resolves, in templates and in host bindings, even next to a directive output named `class`, which it shadows: the output's emissions never reach the binding. The same holds for `(attr.class)` and an output named `attr.class`. The runtime listener fallback and `NG0319` go. An extended diagnostic warns at compile time.                                                                                                                                                                                                                                                                                                          |
| B8  | `(class)` and `(attr.class)` on `<ng-container>` or `<ng-template>` resolve nothing. They get this feature's own diagnostics: at compile time inside the existing check for unclaimed events, which type checking runs for `<ng-container>` today and for explicit `<ng-template>` once a separate fix lands; and in dev mode at runtime, where `ɵɵclassResolver` registers nothing on a node that isn't an element. Error codes give way to the separate container fix where they collide (`NG0319`, `NG8031`, `NG8119`).                                                                                                                               |
| B9  | `@HostListener` can't declare a resolver. `@HostListener('class')` and `@HostListener('attr.class')` are compile errors that point to `host: {'(class)': …}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| B10 | A directive has at most one resolver, including one inherited from a base class. `(class)` and `(attr.class)` in one `host` object are a compile error. A second resolver from a base class is a dev-mode error at runtime.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| B11 | A second `(class)` or `(attr.class)` on one template element is a compile error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B12 | Other `(attr.*)` names stay ordinary event bindings. The classifier holds the reservation of the whole namespace as a commented-out check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| B13 | The resolver runtime is tree-shakable: an app without a `(class)` binding or automatic resolution doesn't carry it. The eight bundling symbol tests are gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| B14 | Automatic resolution: `withAutoResolution()` (a placeholder name) resolves every element that a component or directive matches, including components created in code with their host directives, without a `(class)` binding. An element with an explicit resolver gets only that one. Only root providers can declare the feature; dev mode reports an error when a provider below the root uses it while the root doesn't. Below the root, a component turns it off by providing the resolver without the feature and back on by providing it with the feature; nested templates inherit the setting.                                                  |
| B15 | `cn(...extras)` and `[class]` are both allowed next to each other. Nothing bans `[class]` next to `(class)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B16 | The resolver contract is fixed. No declaration merging and no generic parameters for the extras' type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Orchestrator defaults

Listed for the owner at review.

| ID  | Default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | One instruction, `ɵɵclassResolver(handlerFn, flags)`. `flags` is a bit mask: `ClassResolverFlags.FullForm` means the handler receives a `ClassResolveEvent`, and `ClassResolverFlags.Shorthand` turns on B2's provenance check. Until WP3, `flags` of `0` keeps the prototype's behavior, where the return value applies, so every commit stays green. WP3 removes that path.                                                                                                                                                                                                                                                                                                       |
| D2  | A registration gets a new event object on each refresh. `resolver` and `resolve` are closures over that refresh; when the handler returns, the event is sealed, and a later call is the late call in B1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D3  | `ResolvedClasses` is an instance of an internal class that holds the class names and the event that created it. `toString()` returns the names joined with spaces.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D4  | Error codes. Runtime: `NG0320` misuse of `resolve()` or a foreign shorthand result (B1, B2; throws in dev mode); `NG0321` a resolver on a container (B8; `console.error` in dev mode, like `NG0303`); `NG0322` automatic resolution below a root that doesn't declare it (B14; throws in dev mode); `NG0323` a second resolver inherited by one directive (B10; throws in dev mode). Compile time: `NG8120` replaces `NG8119` for B7's warning; `NG8121` a resolver on a container (B8). B9, B10 and B11 reuse `HOST_BINDING_PARSE_ERROR` (`NG5001`) for host metadata and the template parse error (`NG5002`) for templates. `CLASS_RESOLVER_OUTPUT_CONFLICT` (`-319`) is removed. |
| D5  | The resolver is looked up once per registration when the element is created, from the element's injector as the registration's owner would inject it. Absent a provider, the plain merge applies. The token is internal; `provideClassResolver` is the only public way to set it.                                                                                                                                                                                                                                                                                                                                                                                                   |
| D6  | Public names: `ClassResolveEvent`, `ClassBindingValue`, `ResolvedClasses`, `BoundClassResolver`, `ClassCallback`, `ClassResolver`, `ClassResolverFeature`, `provideClassResolver`, and `withAutoResolution`. All carry `@experimental 22.3`, like `ClassSources`.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D7  | Type checking checks a shorthand's `F` by assigning it to a `ClassCallback`-typed position before the call, because a plain call doesn't reject `(cn) => 'x'` (measured). Synthesized callees and calls are parenthesized.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D8  | `minVersion` stays `"22.3.0"`: the prototype's semantics never shipped, so no linker with them exists outside this fork. The partial-declaration rule also recognizes `(attr.class)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D9  | Automatic resolution looks its setting up once per template instance, from the injector of the component that declares the template, and stores it in the instance. Instances where it's off skip their elements on refresh.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D10 | Automatic resolution remembers each element's last per-source strings and skips the resolver and the DOM diff when they haven't changed. Explicit resolvers still run on every refresh (R3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D11 | One normalization function serves extras, `resolve()`, and the plain merge (B5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D12 | The refresh hook is a module-level function reference in a small module that `change_detection.ts` imports. `ɵɵclassResolver` and the automatic feature set it, the way `enableLocateOrCreateElementNodeImpl()` switches hydration on (`packages/core/src/hydration/api.ts`).                                                                                                                                                                                                                                                                                                                                                                                                       |
| D13 | The shared classifier lives in `packages/compiler` and is exported for `compiler-cli`. It answers, for an event binding, whether it's a resolver and which form it is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Environment

- Main checkout: `/Users/geruch/repos/angular-cn`, branch `feat/class-resolver`.
- Base: `feat/class-resolver` at the commit that adds this plan.
- Worktree: `/Users/geruch/repos/angular-cn-wt/class-resolver-b`, branch `feat/class-resolver-b`.
  The orchestrator creates it before the first dispatch:

  ```bash
  git worktree add -b feat/class-resolver-b /Users/geruch/repos/angular-cn-wt/class-resolver-b feat/class-resolver
  ```

  ```bash
  cp /Users/geruch/repos/angular-cn/.bazelrc.user /Users/geruch/repos/angular-cn-wt/class-resolver-b/
  ```

  ```bash
  pnpm --dir /Users/geruch/repos/angular-cn-wt/class-resolver-b install --frozen-lockfile
  ```

- Machine: a 16 GB Mac that also runs the owner's dev server. `.bazelrc.user` is git-ignored and
  caps jobs and workers; a worktree only has it if it's copied in. The worktree's first build is
  cold, in a new output base of about 6 to 8 GB; 32 GiB were free on 2026-10-28.
- Bazel lock: other sessions on this machine run Bazel in their own worktrees. Before each Bazel
  command, `mkdir /tmp/angular-bazel.lock` must succeed; it fails while another session holds the
  lock, so wait in the background and retry. After the command, run `pnpm bazel shutdown`, then
  `rmdir /tmp/angular-bazel.lock`. If the lock is older than 90 minutes and no Bazel server process
  runs, remove it.
- In zsh, write `"${T}:test"`, not `$T:test`: `:t` is a modifier and mangles the target.
- The Bazel output symlink is `dist/bin`, not `bazel-bin`.
- Known tool problems:
  - Bazel can fail with `uv_os_homedir returned ENOENT` after the server outlives a shell. Run
    `pnpm bazel shutdown` and retry.
  - A shell hook may compress `cat` output; `/bin/cat` prints files as they are.
  - The commit hook runs `ng-dev format staged`, which can reformat staged files, and validates
    the message shape in R12.
- Pre-existing failures in the gate targets:
  - All eight `//packages/core/test/bundling/*:symbol_test` targets fail, because
    `change_detection.ts` imports the resolver runtime unconditionally. Measured on 2026-10-28:
    `standalone_bootstrap` has 26 symbols missing from its golden, among them
    `refreshClassResolvers`, `collectClassSources`, `toStylingKeyValueArray`, `classStringParser`,
    and `SafeValueImpl`. WP0 fixes them; they're gates from WP0 on.
  - Everything else: no code changed since round 1's last gated commit (`git diff --stat
7132fa8d43 HEAD -- packages goldens tools` is empty), where every gate target below passed.
    WP0's agent re-runs the full ladder before its edits, because the worktree is new, and
    reports any failure as a list.

### Gate ladder

Run from the worktree, in order, before each commit. Each WP entry adds its own targets.

1. `pnpm prettier --write` on every changed file.
1. The WP's targeted tests.
1. The WP's regression targets.
1. `pnpm bazel shutdown`.

Runtime regression targets (WP0, WP2, WP3, WP5, and WP6):

```bash
pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver //packages/core/test/acceptance:acceptance //packages/platform-server/test:test //packages/core:core_api //packages/core:core_errors
```

```bash
pnpm bazel test //packages/core/test/bundling/animations-standalone:symbol_test //packages/core/test/bundling/create_component:symbol_test //packages/core/test/bundling/defer:symbol_test //packages/core/test/bundling/forms_reactive:symbol_test //packages/core/test/bundling/forms_template_driven:symbol_test //packages/core/test/bundling/hydration:symbol_test //packages/core/test/bundling/router:symbol_test //packages/core/test/bundling/standalone_bootstrap:symbol_test
```

```bash
pnpm ts-circular-deps:check
```

Compiler regression targets (WP1 to WP5):

```bash
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test //packages/compiler-cli/src/ngtsc/typecheck/test:test_ngp //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/class_resolver_shadowed_by_output:test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/class_resolver_shadowed_by_output:test_ngp //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/uninvoked_function_in_event_binding:test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/uninvoked_function_in_event_binding:test_ngp //packages/compiler/test:test
```

```bash
pnpm bazel test --local_test_jobs=1 //packages/compiler-cli/test/ngtsc:ngtsc //packages/compiler-cli/test/ngtsc:ngtsc_ngp
```

```bash
pnpm bazel test --test_arg=--filter=r3_view_compiler_class_resolver //packages/compiler-cli/test/compliance/full:full //packages/compiler-cli/test/compliance/linked:linked //packages/compiler-cli/test/compliance/declaration-only:declaration-only //packages/compiler-cli/test/compliance/codegen:codegen
```

A golden that changes on purpose is accepted with its `.accept` target (`core_api`, `core_errors`,
a bundling `symbol_test`, or the compliance golden), and the WP report names it. A bundling golden
gains at most the hook symbols named in WP0, and never a class-resolver function (B13).

## Building blocks

### BB1: the classifier

One function in `packages/compiler` (D13) answers, for an event binding, whether it's a resolver
and in which form. Today seven places decide this separately:

| Place                                                                                          | Decides                                       |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `packages/compiler/src/template/pipeline/src/ingest.ts`, host listeners (around line 284)      | a host `(class)` is a resolver                |
| `packages/compiler/src/template/pipeline/src/ingest.ts`, template listeners (around line 1663) | a template `(class)` on an element resolves   |
| `packages/compiler/src/typecheck/ops/events.ts` (`isClassEvent`, line 44; containers at 181)   | how type checking types the binding           |
| `packages/compiler-cli/src/ngtsc/annotations/component/src/partial/component.ts` (around 304)  | the template uses `(class)`, for `minVersion` |
| `packages/compiler-cli/src/ngtsc/annotations/directive/src/partial/directive.ts` (around 171)  | the host uses `(class)`, for `minVersion`     |
| `NG8111`'s check (`uninvoked_function_in_event_binding/index.ts`, around line 56)              | the exemption                                 |
| `NG8119`'s check (`class_resolver_shadowed_by_output/index.ts`, around line 38)                | which bindings it reports                     |

Containers are recognized with `isNgContainer()` and `isNgTemplate()` from
`packages/compiler/src/ml_parser/tags.ts`, never by comparing the raw tag name: inside `<svg>`
the parser names the element `:svg:ng-container`.

### BB2: the event and its result (runtime)

```ts
export type ClassBindingValue =
  | string
  | readonly string[]
  | ReadonlySet<string>
  | {readonly [className: string]: unknown}
  | null
  | undefined
  | false;

export interface ResolvedClasses {
  /* opaque */
}

export type BoundClassResolver = (...extras: ClassBindingValue[]) => ResolvedClasses;

export type ClassCallback = (cn: BoundClassResolver) => ResolvedClasses;

export interface ClassResolveEvent {
  readonly sources: ClassSources;
  resolver(...extras: ClassBindingValue[]): ResolvedClasses;
  resolve(classes: ClassBindingValue | ResolvedClasses): void;
}

export type ClassResolver = (...classes: string[]) => string;
```

How one registration resolves on one refresh:

```text
sources        the payload for this registration (R5)
event          {sources, resolver, resolve}, new for this refresh (D2)
handler(event) the compiled binding
  resolver('shadow-lg')
    extras     normalized (D11), appended to the owner's source (B6)
    calls      ClassResolver(component string, directives string, template string)
    returns    a ResolvedClasses tied to this event (D3)
  resolve(x)   records x; a second call or a call after the handler returns is NG0320 (B1)
after          sealed; no resolve() → the payload passes through (B1)
next level     the recorded classes, normalized and folded by origin (R5)
```

### BB3: error codes

Use the codes in D4 and no others. Each new code gets a `core_errors` or `error_code.api.md`
golden entry in the WP that adds it.

### BB4: test conventions

- Runtime specs live in `packages/core/test/acceptance/class_resolver/class_resolver_spec.ts`.
  They're zoneless: act, `await fixture.whenStable()`, assert. Its `cn` stand-in lets a later
  class replace an earlier one with the same prefix; from WP3 on, specs register it with
  `provideClassResolver(cn)` where they need conflict resolution.
- Compiler specs that a Rust-preprocessor run fails go into `ngp_known_failures.ts` (R10).
- A spec that's added red first is named in the report with its failure message.

## Work packages

### WP0: tree-shake the resolver runtime

Scope: `packages/core/src/render3/instructions/change_detection.ts`,
`packages/core/src/render3/instructions/class_resolver.ts`, and one new small module for the hook
(D12).

Before:

```ts
// change_detection.ts
import {refreshClassResolvers} from './class_resolver';
…
if (tView.classResolvers !== null && !isInCheckNoChangesPass) {
  refreshClassResolvers(tView, lView);
}
```

After: `change_detection.ts` has no import from `class_resolver.ts`. It calls the hook, which only
`ɵɵclassResolver` sets, on its first call. `tView.classResolvers` is non-null only after
`ɵɵclassResolver` ran, so the hook is always set when change detection needs it.

Acceptance:

- No class-resolver function is in any of the eight bundles. Red first: all eight symbol tests
  fail today.
- Measured with a prototype on 2026-10-28: a hook initialized to `null` in `change_detection.ts`,
  set by `ɵɵclassResolver`, removes all 26 resolver symbols, and each golden gains one symbol,
  `_refreshClassResolvers` (`standalone_bootstrap`, `hydration`, and `create_component`). Aim for
  no new symbol: hydration's `_locateOrCreateElementNode` starts as a working default function and
  appears only in the hydration golden, and a function reference carried on the `TView` adds no
  module-level symbol. If a hook symbol remains, accept only that symbol in the goldens and name it
  in the report.
- The class resolver, acceptance, and `platform-server` targets pass unchanged.
- `pnpm ts-circular-deps:check` passes.

Before editing, run the whole gate ladder, runtime and compiler targets, and report its failures
as the baseline list.

Commit: `refactor(core): load the class resolver runtime on first use`.

### WP1: one classifier

Scope: BB1's seven places and the new classifier module. Behavior doesn't change, except that
the partial-declaration rule (D8) also recognizes `(attr.class)`.

- The classifier takes what each caller has: the event name, the parsed event type, the target,
  and whether the node is a host, an element, or a container. It returns `null`, `shorthand`
  (`class`), or `fullForm` (`attr.class`).
- Every place in BB1 calls it. The pipeline's checks keep their current results for `(class)`.
- Next to the `attr.class` check, the classifier holds B12's reservation as commented-out code:
  a check that would treat every `attr.*` event name as reserved.

Acceptance:

- The class resolver target and all compiler and runtime regression targets pass, with no golden
  changes.
- A partial declaration whose host or template uses `(attr.class)` declares
  `minVersion: "22.3.0"`. Red first: a compliance case in `r3_view_compiler_class_resolver` with
  `(attr.class)` in a template and in a host.

Commit: `refactor(compiler): classify class resolvers in one place`.

### WP2: the full form, `(attr.class)`

Scope: compiler emission for `(attr.class)` and the runtime event. `(class)` keeps the
prototype's behavior in this WP (D1).

Consumer API, before:

```html
<!-- An ordinary listener for a DOM event named "attr.class": never fires. -->
<ui-button (attr.class)="$event.resolve($event.resolver('shadow-lg'))" />
```

After:

```html
<!-- Resolves. Extras rank at the end of the template source. -->
<ui-button (attr.class)="$event.resolve($event.resolver('shadow-lg'))" />
<!-- Passes the payload through. -->
<ui-button (attr.class)="track($event.sources)" />
<!-- Replaces every class, on purpose. -->
<ui-button (attr.class)="$event.resolve(['only'])" />
```

- Compiler: the pipeline emits `ɵɵclassResolver(handlerFn, ClassResolverFlags.FullForm)` for a
  template or host `(attr.class)` on an element. The handler is an ordinary listener body with
  `$event`; its return value is dropped. `ClassResolverFlags` is shared by the compiler and the
  runtime the way other instruction flags are.
- Runtime: a registration with `FullForm` receives a `ClassResolveEvent` (BB2). Implement
  `resolver` with the plain merge (B4) only; WP3 adds the provider. Implement B1's pass-through,
  sealing, and `NG0320` (dev throws; production ignores late calls, and the last call wins).
  Implement B5's normalization once (D11) and use it for extras and `resolve()`.
- Public API: export BB2's types from `@angular/core`, `@experimental 22.3`. Accept the
  `core_api` golden.

Tests, red first (JIT acceptance specs in the class resolver spec file):

- Each of the three bindings above, on a component with host classes and a consumer class.
- Extras rank at the end of the caller's source, from a template and from a component's host.
- `resolve()` with each `ClassBindingValue` shape, including a top-level `false`, which adds
  nothing and doesn't throw.
- A repeated `resolve()` and one after the handler returns: `NG0320` in dev mode.
- A compliance case for the emitted instruction and flags.

Commit: `feat(core): resolve classes through the class event`.

### WP3: the shorthand and the provider

Scope: the shorthand's compilation, `provideClassResolver`, B2's provenance check, B7 at
runtime, B8's runtime error, and moving every existing spec and golden to design B.

Consumer API, before (the prototype):

```html
<ui-button class="bg-red-600" (class)="cn($event)" />
```

After:

```ts
bootstrapApplication(App, {providers: [provideClassResolver(twMerge)]});
```

```html
<ui-button class="bg-red-600" (class)="(cn) => cn('shadow-lg')" />
```

```ts
@Component({
  selector: 'ui-button',
  host: {class: 'inline-flex px-4', '(class)': 'classes'},
  template: '<ng-content />',
})
export class UiButton {
  readonly variant = input<'default' | 'muted'>('default');
  protected readonly classes = (cn: BoundClassResolver) =>
    cn(this.variant() === 'muted' && 'bg-muted');
}
```

- Compiler: a template or host `(class)="F"` compiles to the handler
  `$event.resolve((F)($event.resolver))`, emitted with `FullForm | Shorthand` (B2).
- Runtime:
  - `provideClassResolver(resolver, ...features)` returns a `Provider` (B4, D5). `features` is
    accepted and unused until WP6.
  - The bound resolver calls the provided `ClassResolver` with one string per source (B4);
    without a provider, the plain merge.
  - With `Shorthand`, a result that isn't a `ResolvedClasses` from this event throws `NG0320` in
    dev mode (B2).
  - Remove the `flags` of `0` path (D1), the listener fallback for an output named `class`, and
    `CLASS_RESOLVER_OUTPUT_CONFLICT` (B7, D4).
- Move every spec that uses the prototype's `(class)` to design B: the class resolver spec, the
  hydration spec's three cases, and the eight `r3_view_compiler_class_resolver` compliance cases
  with their golden. Keep each spec's intent; where a spec tested the return value itself,
  rewrite it against `resolve()`. The type-checking specs stay on the prototype's design until
  WP4 moves them.

Tests, red first:

- The two bindings above, with and without `provideClassResolver`.
- `viewProviders` scoping: a component that provides a resolver in `viewProviders` resolves its
  template's elements with it, and content projected into it with the outer one. Report what
  `includeViewProviders` does for the component's own host element; that's D5's open edge.
- A shorthand callback that returns `ResolvedClasses` from another element's event: `NG0320`.
- An output named `class` next to `(class)`: the binding resolves, and the output's emissions
  don't reach it.

Commit: `feat(core): add the class shorthand and class resolver provider`.

### WP4: type checking and diagnostics

Scope: `packages/compiler/src/typecheck/ops/events.ts`,
`packages/compiler-cli/src/ngtsc/typecheck/host_bindings.ts` (around lines 376 to 392), the
`NG8111` and `NG8119` checks, and their specs.

- `(attr.class)`: `$event` is `ClassResolveEvent`, in templates and in host bindings.
- `(class)="F"`: `F` is checked as `ClassCallback` through a typed position (D7), so
  `(cn) => 'x'`, `(cn) => other()`, and `classes()` fail. `cn`'s parameter is inferred, not
  printed.
- B7 in type checking: a directive output named `class` or `attr.class` never claims a resolver
  binding, neither in `TcbDirectiveOutputsOp` nor in the claimed-outputs set that
  `TcbUnclaimedOutputsOp` skips.
- `NG8111`: only a shorthand that resolves is exempt (B3).
- B7's warning moves from `NG8119` to `NG8120` (D4): a template `(class)` next to a directive
  output named `class` resolves, and the warning says the output isn't listened to. Move the
  check's directory and specs with it.
- B8's compile-time error `NG8121` lives inside `TcbUnclaimedOutputsOp`. It fires for an `Element`
  target when `isNgContainer(name)`, and for a `Template` target only when `isNgTemplate(tagName)`:
  structural wrappers copy the inner element's outputs, so without that test a binding would be
  reported twice once the op runs for templates. Don't make the op run for `Template` nodes; the
  separate fix does that. The check must not assume that the target resolves to an element.
- Move the existing type-checking specs to design B: `host_bindings_type_check_spec.ts` (10
  cases), `template_typecheck_spec.ts` (7), the `NG8119` check's specs (9, moving to `NG8120`),
  and the `NG8111` check's specs (3).

Tests, red first: `host_bindings_type_check_spec.ts` and `template_typecheck_spec.ts` cases for
each bullet; `NG8111` and the `NG8120` check's specs. Specs that the preprocessor fails go into
`ngp_known_failures.ts`.

Commit: `feat(compiler-cli): type-check the class event and its shorthand`.

### WP5: declaration rules

Scope: host metadata and decorator parsing in the AOT compiler
(`packages/compiler-cli/src/ngtsc/annotations/directive/src/shared.ts`, around line 787) and JIT
(`packages/compiler/src/jit_compiler_facade.ts`, around line 942), the template transform, and the
runtime's registration.

- B9: `@HostListener('class')` and `@HostListener('attr.class')` are compile errors that point to
  `host: {'(class)': …}`, in AOT and in JIT. Today both compilers key listeners by event name, so
  a later decorator silently replaces an earlier one or a `host` entry.
- B10: `(class)` and `(attr.class)` in one `host` object are a compile error. A second resolver
  for the same directive at runtime, which only inheritance can produce, throws `NG0323` in dev
  mode, on the first creation pass.
- B11: a second `(class)` or `(attr.class)` on one template element is a template parse error.
- B8 at runtime: a template `(class)` or `(attr.class)` on a container also emits
  `ɵɵclassResolver`. Where `ɵɵclassResolver` returns early for a node that isn't an element, report
  `NG0321` through `console.error` in dev mode.

Tests, red first: each rule in AOT (`ngtsc` specs) and JIT (acceptance specs), plus a base class
and a subclass that each declare a resolver. Today the base and subclass both run, base first
(measured), and two `@HostListener('class')` keep only the last (measured). A host and a template
`(class)` on `<ng-container>` and on `<ng-template>`: `NG0321` in the console, and nothing
resolves.

Commit: `feat(compiler): allow one class resolver per element and directive`.

### WP6: automatic resolution

Scope: `withAutoResolution()`, the setup in the first creation pass, components created in code,
and memoization.

Stop before writing code. First write a design note under `## QUESTIONS` and end the turn:
how the runtime knows a provider is in the root providers, how the setup reaches a component
created through `createComponent` and through bootstrap, where the per-instance setting is
stored, and what each costs on elements where the feature is off. Wait for the orchestrator's go,
which may change this entry.

Consumer API:

```ts
bootstrapApplication(App, {
  providers: [provideClassResolver(twMerge, withAutoResolution())],
});
```

```ts
@Component({
  selector: 'legacy-table',
  providers: [provideClassResolver(twMerge)], // this template and nested ones: off
})
export class LegacyTable {}
```

- With the feature declared in the root providers, every element that a component or directive
  matches gets resolver data in its template's first creation pass, including the host of a
  component created in code and its host directives (B14).
- The setting is looked up once per template instance (D9). Below the root, providing the
  resolver without the feature turns it off, and with the feature turns it back on.
- A provider below the root that uses the feature while the root doesn't: `NG0322` in dev mode.
- An element with an explicit resolver isn't resolved automatically as well.
- Memoize by per-source strings (D10).
- The feature's runtime stays out of bundles that don't call it (B13).

Tests, red first:

- A component host, a directive-only element, and a plain element (not resolved).
- Opting out in a component, and back in below it.
- A routed component with host directives, created in code.
- The `NG0322` case, through a lazy route's providers.
- An element with an explicit `(class)` resolves once.
- A refresh with unchanged sources doesn't call the resolver; a changed source does.
- Hydration: an automatically resolved element hydrates without a class mismatch.

Commit: `feat(core): resolve classes automatically when the root opts in`.

## After the work packages

- M1, by the orchestrator: measure Angular's own cost per element and refresh (collecting,
  normalizing, and diffing classes), for an explicit `(class)` and for automatic resolution, with
  the resolver stubbed out. The numbers go into the proposal's notes for maintainers.
- Then the comment cleanup, the external audit, and the triage, as in round 1.

## Out of scope: ask before touching

- Anything under `packages/compiler-cli/preprocessor/` (R10).
- The generic check for bindings that do nothing on containers, and the type-checking fix for
  `<ng-template>`. Both belong to `fix/container-no-op-bindings`.
- `[class]`'s dev-mode assertion on a top-level `false`.
- Resolving attributes other than `class`, a `(style)` counterpart, and reserving `(attr.*)`
  beyond the commented-out check (B12).
- A second automatic-resolution flag for elements without a component or directive.
- Setting up automatic-resolution data lazily.
- A shorthand for `@HostListener`.
- Language service support.
- `proposal.md`, `docs/class-resolver.md`, and this plan. Docs are the orchestrator's.

## Errata

None yet.
