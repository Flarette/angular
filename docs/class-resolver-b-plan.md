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
| D7  | Type checking checks a shorthand's `F` as `$event.resolve(((F) satisfies ClassCallback)!($event.resolver) as any)`, because a plain call doesn't reject `(cn) => 'x'` (measured). `satisfies` types arrow parameters and rejects a result that isn't `ResolvedClasses`, and it keeps `F`'s own type, so TypeScript checks the receiver of the call as it's emitted (A1). The non-null assertion keeps one diagnostic for a nullable `F`, and `as any` keeps `resolve()` from reporting a result that `satisfies` already rejected. Synthesized callees and calls are parenthesized.                                                                                                 |
| D8  | `minVersion` stays `"22.3.0"`: the prototype's semantics never shipped, so no linker with them exists outside this fork. The partial-declaration rule also recognizes `(attr.class)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D9  | Automatic resolution looks its setting up once per template instance, from the injector of the component that declares the template, and stores it in the instance. Instances where it's off skip their elements on refresh.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D10 | Automatic resolution remembers each element's last per-source strings and skips the resolver and the DOM diff when they haven't changed. Explicit resolvers still run on every refresh (R3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D11 | One normalization function serves extras, `resolve()`, and the plain merge (B5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D12 | The hooks are module-level function references in a small module: the refresh hook, which `change_detection.ts` imports, the binding registration hook, which `styling.ts` imports, and from WP6 the setup hook `_setUpClassResolution`, which element creation calls. `ɵɵclassResolver` and the automatic feature set them in one call, the way `enableLocateOrCreateElementNodeImpl()` switches hydration on (`packages/core/src/hydration/api.ts`).                                                                                                                                                                                                                              |
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
  - A shell may start without `node` and `pnpm` on `PATH`, and then the commit hook skips its
    checks. Start each command with `export PATH=/Users/geruch/.nvm/versions/node/v26.2.0/bin:$PATH`.
  - Bazel can fail with `uv_os_homedir returned ENOENT` after the server outlives a shell. Run
    `pnpm bazel shutdown` and retry.
  - A shell hook may compress `cat` output; `/bin/cat` prints files as they are.
  - The commit hook runs `ng-dev format staged`, which can reformat staged files, and validates
    the message shape in R12.
- Pre-existing failures in the gate targets: none. Measured by the WP0 agent on 2026-10-28, every
  gate target below passes after WP0's commit, including the eight
  `//packages/core/test/bundling/*:symbol_test` targets that failed before it. The resolver
  runtime reaches bundles only through two hooks, `_refreshClassResolvers` and
  `_registerClassResolverBinding`, in `packages/core/src/render3/instructions/class_resolver_hook.ts`.
  A bundling golden may hold those two hook symbols, never a resolver function.

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

Compiler regression targets (WP1 to WP5). Before WP4's commit, the `output_shadowed_by_class_resolver`
check is named `class_resolver_shadowed_by_output`:

```bash
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test //packages/compiler-cli/src/ngtsc/typecheck/test:test_ngp //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/output_shadowed_by_class_resolver:test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/output_shadowed_by_class_resolver:test_ngp //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/uninvoked_function_in_event_binding:test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/uninvoked_function_in_event_binding:test_ngp //packages/compiler/test:test
```

```bash
pnpm bazel test --local_test_jobs=1 //packages/compiler-cli/test/ngtsc:ngtsc //packages/compiler-cli/test/ngtsc:ngtsc_ngp
```

```bash
pnpm bazel test --test_arg=--filter=r3_view_compiler_class_resolver //packages/compiler-cli/test/compliance/full:full //packages/compiler-cli/test/compliance/linked:linked //packages/compiler-cli/test/compliance/declaration-only:declaration-only //packages/compiler-cli/test/compliance/codegen:codegen
```

The partial-declaration golden (`GOLDEN_PARTIAL.js`, which holds each declaration's `minVersion`)
and the Rust preprocessor's suite, which reads every compliance case:

```bash
pnpm bazel test //packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_class_resolver.golden_test //packages/compiler-cli/preprocessor/test:test
```

Regenerate the partial golden with
`pnpm bazel run //packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_class_resolver.golden`.

A golden that changes on purpose is accepted with its `.accept` target (`core_api`, `core_errors`,
a bundling `symbol_test`, or the compliance golden), and the WP report names it. A bundling golden
gains at most the hook symbols named in WP0 and WP6 (D12), and never a class-resolver function
(B13).

## Building blocks

### BB1: the classifier

One function in `packages/compiler` (D13) answers, for an event binding, whether it's a resolver
and in which form. Today seven places decide this separately:

| Place                                                                                          | Decides                                       |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `packages/compiler/src/template/pipeline/src/ingest.ts`, host listeners (around line 284)      | a host `(class)` is a resolver                |
| `packages/compiler/src/template/pipeline/src/ingest.ts`, template listeners (around line 1663) | a template `(class)` on an element resolves   |
| `packages/compiler/src/typecheck/ops/events.ts` (`isClassEvent`, line 44; containers at 181)   | how type checking types the binding           |
| `packages/compiler/src/render3/partial/component.ts` (around 304)                              | the template uses `(class)`, for `minVersion` |
| `packages/compiler/src/render3/partial/directive.ts` (around 171)                              | the host uses `(class)`, for `minVersion`     |
| `NG8111`'s check (`uninvoked_function_in_event_binding/index.ts`, around line 56)              | the exemption                                 |
| `NG8120`'s check (`output_shadowed_by_class_resolver/index.ts`; `NG8119` before WP4)           | which bindings it reports                     |

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

// Type-only brand, like `ɵINPUT_SIGNAL_BRAND_WRITE_TYPE`; no value at runtime.
export const ɵRESOLVED_CLASSES_BRAND: unique symbol;

export interface ResolvedClasses {
  readonly [ɵRESOLVED_CLASSES_BRAND]: true;
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
`packages/core/src/render3/instructions/class_resolver.ts`, one new small module for the hooks
(D12), and `packages/core/src/render3/instructions/styling.ts`, only to move
`registerClassResolverBinding` into `class_resolver.ts` and call it through a hook.

Before:

```ts
// change_detection.ts
import {refreshClassResolvers} from './class_resolver';
…
if (tView.classResolvers !== null && !isInCheckNoChangesPass) {
  refreshClassResolvers(tView, lView);
}
```

After: neither `change_detection.ts` nor `styling.ts` imports `class_resolver.ts`. Each calls a
module-level hook in the hook module. The function that first sets `tNode.classResolver` and
`tView.classResolvers` sets both hooks in one call, so the hooks are always set when change
detection or the styling first update pass needs them.

Acceptance:

- No class-resolver function is in any of the eight bundles. Red first: all eight symbol tests
  fail today.
- Measured by the WP0 agent on 2026-10-28: the refresh hook alone removes all 26 resolver symbols
  from six bundles and adds `_refreshClassResolvers` to all eight. `forms_reactive` and
  `forms_template_driven` also carry `registerClassResolverBinding`, which only `styling.ts` calls,
  so it moves behind the second hook. Accept only hook symbols, in the goldens where they're
  measured, and name each one per golden in the report. Don't aim for zero hook symbols: existing
  hooks such as `_retrieveHydrationInfoImpl` are in all eight goldens, and a reference carried on
  the `TView` would add a field to every `TView`.
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
- A compliance case for the emitted instruction and flags. WP1's two `(attr.class)` cases
  (`class_resolver_attr_class_element` and `class_resolver_attr_class_host`) expect a plain
  listener today; their expected output changes to the new instruction on purpose.

Commit: `feat(core): resolve classes through the class event`.

### WP3: the shorthand and the provider

Scope: the shorthand's compilation, `provideClassResolver`, B2's provenance check, B7 at
runtime, and moving every existing spec and golden to design B. B8's runtime error is WP5's.

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
    dev mode (B2). `NG0320`'s messages, which today name `(attr.class)`, name the binding's form.
  - Remove the `flags` of `0` path (D1), the listener fallback for an output named `class`, and
    `CLASS_RESOLVER_OUTPUT_CONFLICT` (B7, D4).
  - With the `0` path gone, the prototype's `toClassNames` goes too: every level reads names
    through the full form's normalizer (`readClassNames`, D11), which drops array, `Set`, and
    object-map names that contain a space.
- Move every spec that uses the prototype's `(class)` to design B: the class resolver spec, the
  hydration spec's two cases, and the eight `r3_view_compiler_class_resolver` compliance cases
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
- A lower host `(class)` whose callback resolves `['a b', 'c']`, below a template `(attr.class)`
  that calls `resolver()`: only `c` reaches the sources and the element. Today the spaced name
  passes up and the merge splits it into `a` and `b`.

Commit: `feat(core): add the class shorthand and class resolver provider`.

### WP4: type checking and diagnostics

Scope: `packages/compiler/src/typecheck/ops/events.ts`, the `NG8111` and `NG8119` checks, the
classifier (`packages/compiler/src/render3/r3_class_resolver.ts`), and their specs.
`packages/compiler/src/typecheck/host_bindings.ts` only if a red spec shows a need. For `NG8121`:
the out-of-band recorder's interface (`packages/compiler/src/typecheck/oob.ts`), its
implementation (`packages/compiler-cli/src/ngtsc/typecheck/src/oob.ts`), and `NoopOobRecorder`
(`packages/compiler-cli/src/ngtsc/typecheck/testing/index.ts`). For the new codes: `packages/compiler-cli/src/ngtsc/diagnostics/src/error_code.ts`,
`extended_template_diagnostic_name.ts`, the extended checks' registry
(`packages/compiler-cli/src/ngtsc/typecheck/extended/index.ts`), and the reference pages
`adev/src/content/reference/extended-diagnostics/NG8119.md` (renamed to `NG8120.md`) and
`overview.md`. Accept the goldens with `//packages/compiler-cli:error_code_api.accept` and
`//packages/compiler-cli:extended_template_diagnostic_name_api.accept`, and add both test targets
to this WP's gates.

- `(attr.class)`: `$event` is `ClassResolveEvent`, in templates and in host bindings.
- `(class)="F"`: `F` is checked as `ClassCallback` through a typed position (D7), so
  `(cn) => 'x'`, `(cn) => other()`, and `classes()` fail. `cn`'s parameter is inferred, not
  printed. Since WP2, `ResolvedClasses` carries a type-only brand, so the assignment rejects a
  plain string.
- Inside `F`, `$event` is the `ClassResolveEvent`: the compiler emits
  `$event.resolve((F)($event.resolver))` (WP3), and B2's "means exactly" keeps `$event` in scope.
  Type the call the way it's emitted, with `F` in parentheses. Until WP5 rejects a chain in
  `(class)`, the compiler runs the earlier expressions as statements and treats the last one as
  `F`; type-check it the same way.
- B7 in type checking: a directive output named `class` or `attr.class` never claims a resolver
  binding, neither in `TcbDirectiveOutputsOp` nor in the claimed-outputs set that
  `TcbUnclaimedOutputsOp` skips.
- `NG8111`: only a shorthand that resolves is exempt (B3).
- B7's warning moves from `NG8119` to `NG8120` (D4): a template `(class)` next to a directive
  output named `class` resolves, and the warning says the output isn't listened to. The same holds
  for `(attr.class)` next to an output named `attr.class`. Names: `ErrorCode`
  `OUTPUT_SHADOWED_BY_CLASS_RESOLVER = 8120`, `ExtendedTemplateDiagnosticName`
  `OUTPUT_SHADOWED_BY_CLASS_RESOLVER = 'outputShadowedByClassResolver'`, and the directories
  `checks/output_shadowed_by_class_resolver` and `test/checks/output_shadowed_by_class_resolver`.
  Delete the `8119` entry; the number belongs to the container fix (B8).
- B8's compile-time error `NG8121` (`ErrorCode` `CLASS_RESOLVER_ON_CONTAINER = 8121`) lives inside
  `TcbUnclaimedOutputsOp`, reported through an optional method on the out-of-band recorder, called
  as `oobRecorder.classResolverOnContainer?.(…)`. The method is optional because the Rust
  preprocessor implements the same interface and is out of scope (R10); under the preprocessor,
  `NG8121` doesn't fire, and its specs go into `ngp_known_failures.ts`. It fires for an `Element`
  target when `isNgContainer(name)`, and for a `Template` target only when `isNgTemplate(tagName)`:
  structural wrappers copy the inner element's outputs, so without that test a binding would be
  reported twice once the op runs for templates. Don't make the op run for `Template` nodes; the
  separate fix does that. The check must not assume that the target resolves to an element.
- The classifier returns `null` for every binding on a container, so `NG8121` can't find a
  resolver binding there without repeating the name checks or passing a false node kind. Extend it
  so a container binding still reports its form, separately from whether the node resolves.
  Existing callers keep their results.
- Move the existing type-checking specs to design B: `host_bindings_type_check_spec.ts` (5
  cases), `template_typecheck_spec.ts` (6), the `NG8119` check's specs (6, moving to `NG8120`),
  and the `NG8111` check's spec (1). Counts measured by the WP4 agent.

Tests, red first: `host_bindings_type_check_spec.ts` and `template_typecheck_spec.ts` cases for
each bullet; `NG8111` and the `NG8120` check's specs. Specs that the preprocessor fails go into
`ngp_known_failures.ts`.

Commit: `feat(compiler-cli): type-check the class event and its shorthand`.

### WP5: declaration rules

Scope: host metadata and decorator parsing in the AOT compiler
(`packages/compiler-cli/src/ngtsc/annotations/directive/src/shared.ts`, around line 787) and JIT
(`packages/compiler/src/jit_compiler_facade.ts`, around line 942), the template transform, the
template pipeline's ingest (`packages/compiler/src/template/pipeline/src/ingest.ts`) for container
emission, and the runtime's registration.

- B9: `@HostListener('class')` and `@HostListener('attr.class')` are compile errors that point to
  `host: {'(class)': …}`, in AOT and in JIT. Today both compilers key listeners by event name, so
  a later decorator silently replaces an earlier one or a `host` entry.
- B10: `(class)` and `(attr.class)` in one `host` object are a compile error. A second resolver
  for the same directive at runtime, which only inheritance can produce, throws `NG0323` in dev
  mode, on the first creation pass.
- B11: a second `(class)` or `(attr.class)` on one template element is a template parse error.
- B2's "one expression": a chain in a shorthand, `(class)="a; b"`, is a template parse error
  (`NG5002`) in templates and a host binding parse error (`NG5001`) in `host`. Since WP3 it
  compiles like a listener chain, the last expression being `F`.
- The specs and the compliance case that still declare a resolver with `@HostListener('class')`
  move to `host` (B9). A compliance case whose input becomes a compile error can't stay: the
  partial golden's generator compiles every case and stops on any error (WP4). Delete it and cover
  the error with `ngtsc` specs.
- B8 at runtime: a template `(class)` or `(attr.class)` on a container also emits
  `ɵɵclassResolver`. Where `ɵɵclassResolver` returns early for a node that isn't an element, report
  `NG0321` through `console.error` in dev mode. Ingest finds these bindings through the
  classifier's container result from WP4. Since WP4, an AOT compile with type checking reports
  `NG8121` for these bindings, so the emission is reached through JIT, the preprocessor, and
  `<ng-template>` until the container fix checks it. WP4 deleted the compliance case
  `class_resolver_ng_container`: the partial golden's generator type-checks every case and stops
  on any error. Cover the emission with JIT acceptance specs.

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
  In production the declaration is ignored and the subtree stays off; the root check that decides
  it is one memoized lookup per app, inside the feature's module.
- The resolver of an automatically resolved element is the one from the provider that decides its
  view's setting (the declaring component's `providers` and `viewProviders`, or the root), not
  the element's own injector. This departs from D5, which covers explicit registrations.
- Off instances behave exactly like an app without the feature. List every read of
  `tNode.classResolver` and `tView.classResolvers` and say what each does when the data exists but
  the instance is off.
- Bundling: all eight goldens gain exactly `_setUpClassResolution`, and nothing else.
- An element with an explicit resolver isn't resolved automatically as well.
- Memoize by per-source strings (D10).
- The feature's runtime stays out of bundles that don't call it (B13).
- `ClassResolverFeature` is a placeholder since WP3 (`{readonly ɵbrand: 'ClassResolverFeature'}`).
  Give it the shape that `provideClientHydration` and `provideRouter` features use, a kind and
  its providers (`ɵkind`, `ɵproviders`), with `withAutoResolution()` as its first kind.

Tests, red first:

- A component host, a directive-only element, and a plain element (not resolved).
- Opting out in a component, and back in below it.
- A routed component with host directives, created in code.
- The `NG0322` case, through a lazy route's providers.
- An element with an explicit `(class)` resolves once.
- A refresh with unchanged sources doesn't call the resolver; a changed source does.
- Hydration: an automatically resolved element hydrates without a class mismatch.
- Differential: the same template with the feature declared but turned off for its subtree, and
  with no feature at all, gives identical classes for static classes, `[class]`, `[class.x]`,
  host class bindings, a class input, and hydration.

The runtime turns on for the whole process at the first `withAutoResolution()` call, and component
definitions cache their `TView`. So the automatic-resolution specs, and their hydration spec, go in
their own Bazel targets (BUILD edits are in scope), and every target that calls
`withAutoResolution()` passes with `--runs_per_test=10`.

Commit: `feat(core): resolve classes automatically when the root opts in`.

### WP7: check a shorthand's receiver as it's called

From the external audit, finding A1. Scope: `tcbCreateClassResolverHandler` in
`packages/compiler/src/typecheck/ops/events.ts`, the class resolver specs in
`packages/compiler-cli/test/ngtsc/template_typecheck_spec.ts` and
`host_bindings_type_check_spec.ts`, and `ngp_known_failures.ts` if the preprocessor fails a new
spec (R10).

Type checking passes `F` through `((cb: ClassCallback) => cb)((F))` and calls the result.
`ClassCallback` declares no `this`, so a method that declares `this: T` loses that requirement,
and TypeScript never checks the call that runs. With `strictTemplates`:

```ts
class Cmp {
  active = false;
  extra = 'extra';
  first(this: Cmp, cn: BoundClassResolver) {
    return cn();
  }
  classes(this: Cmp, cn: BoundClassResolver) {
    return cn(this.extra);
  }
}
```

```html
<!-- Today: no diagnostic. At runtime, `classes` runs with `this` undefined and throws. -->
<div (class)="active ? first : classes"></div>

<!-- The literal expansion (B2): TS2684 today. -->
<div (attr.class)="$event.resolve((active ? first : classes)($event.resolver))"></div>

<!-- Valid, and must stay valid: a property read keeps its receiver. -->
<div (class)="classes"></div>
```

Emit the shorthand's call as D7 states:
`$event.resolve(((F) satisfies ClassCallback)!($event.resolver) as any)`. TypeScript treats `satisfies`,
`!`, and parentheses as transparent when it finds a call's receiver. Measured with `tsc` 6.0.3,
outside ngtsc:

| `F`                                                  | Today                    | With D7's shape                    |
| ---------------------------------------------------- | ------------------------ | ---------------------------------- |
| `active ? first : classes`, methods with `this: Cmp` | none                     | TS2684                             |
| `classes`, a method with `this: Cmp`                 | none                     | none                               |
| `active ? (cn) => cn('a') : (cn) => cn()`            | none                     | none, `cn` inferred in both        |
| `(cn) => 'x'`                                        | TS2322 at `'x'`          | TS2322 at `'x'`                    |
| `str`, a method that returns a string                | TS2345 (`ClassCallback`) | TS1360 (`satisfies`)               |
| `maybe?.cb`, `ClassCallback \| undefined`            | TS2345                   | TS1360                             |
| `(cn: number) => cn`, or `h(e: number)`              | TS2345                   | TS1360, and TS2345 at the argument |
| `classes()`, which returns a string                  | TS2345                   | TS1360 and TS2349                  |

Diagnostics, ruled by the orchestrator:

- Every diagnostic maps to the binding's `F` in the template (`getSourceCodeForDiagnostic`), or to
  the place inside `F` where it maps today. TypeScript reports TS1360 on the `satisfies` keyword,
  so it maps to the whole `F`, even where today's TS2345 mapped to a name inside `F`.
- The synthesized `$event.resolver` argument reports nothing: mark it to ignore diagnostics, so a
  wrong parameter type reports once, as today.
- The call's result is cast `as any`. `satisfies` already checks it, and without the cast an `F`
  that returns `void` also reports from `resolve()`, on the same token as TS2684.
- Existing specs keep their diagnostic counts. Messages change, from
  `Argument of type '…' is not assignable to parameter of type 'ClassCallback'` to
  `Type '…' does not satisfy the expected type 'ClassCallback'`, and a span widens to the whole
  `F` where TS1360 replaces a TS2345 that mapped inside it.
- One exception: an `F` that isn't callable at all, such as `classes()` that returns a string,
  also reports TS2349, `This expression is not callable`. Both messages are true, and the
  literal expansion reports TS2349, so the second diagnostic is accepted. Update that spec's
  expected list for it and for nothing else.

The audit's compiler probes are evidence:
`git show 2f8725ea5c:packages/compiler-cli/test/ngtsc/class_resolver_audit_spec.ts`. Read them,
don't add that file.

Tests, red first, in `template_typecheck_spec.ts`'s `class resolver bindings` block, each with
the diagnostic codes and the source code each diagnostic maps to:

- `(class)="active ? first : classes"`, methods with `this: TestCmp`: one TS2684 at the
  conditional. Red today.
- The same in a host binding, `host: {'(class)': 'active ? first : classes'}`, in
  `host_bindings_type_check_spec.ts`: one TS2684. Red today.
- Controls, green before and after: the literal expansion gives one TS2684; `(class)="classes"`
  with `this: TestCmp` gives none; `(class)="active ? (cn) => cn('a') : (cn) => cn(42)"` gives
  one error at `42`, so `cn` is inferred in both branches; `(class)="active ? plainA : plainB"`,
  methods without `this`, gives none.
- Every existing spec stays green, with the message changes the rules above allow.

Gates: the compiler regression targets.

Commit: `fix(compiler-cli): check this in class shorthands`.

### WP8: keep the audit's probes that cover untested cases

From the external audit triage. Test files only: the specs and `BUILD.bazel` under
`packages/core/test/acceptance/class_resolver/`, the class resolver specs under
`packages/compiler-cli/test/ngtsc/`, and `ngp_known_failures.ts` (R10).

The audit wrote probes that pass but that no existing spec covers in the same way. Its branch goes
away when the round finishes. The probes are evidence; read them, don't add their files:

```bash
git show 2f8725ea5c:packages/core/test/acceptance/class_resolver/external_audit_spec.ts
```

```bash
git show 2f8725ea5c:packages/core/test/acceptance/class_resolver/auto_external_audit_spec.ts
```

```bash
git show 2f8725ea5c:packages/compiler-cli/test/ngtsc/class_resolver_audit_spec.ts
```

For each probe, find the existing spec that pins the same behavior. Port the probe only if none
does, into the spec file that owns the behavior, in the style of its neighbors. An automatic
resolution probe goes in the `auto_resolution` target, never next to explicit-only specs. Don't
port:

- `A1 reproduces an unbound method failure in the shorthand` and `… in the literal expansion`.
  They expect the `TypeError`, and JIT doesn't type-check, so they would pin the crash after WP7.
- The A1 compiler probes; WP7 owns them.

The report lists every probe with one line each: ported, and where; or skipped, and the spec that
already covers it.

Gates: the runtime regression targets, `//packages/core/test/acceptance/class_resolver:auto_resolution`
with `--runs_per_test=10`, and the full ngtsc targets from the compiler regression targets.

Commit: `test: keep class resolver probes from the audit`.

## After the work packages

- M1, by the orchestrator: measure Angular's own cost per element and refresh (collecting,
  normalizing, and diffing classes), for an explicit `(class)` and for automatic resolution, with
  the resolver stubbed out, and for an app that declares the feature with a subtree turned off
  (expando slots, refresh-loop entries, and binding registration on off views). The numbers go
  into the proposal's notes for maintainers.
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

### 2026-10-28: execution starts

The owner agreed to start with the defaults as written. WP0 is dispatched first.

### 2026-10-28: WP0 also moves the binding registration out of `styling.ts`

The WP0 agent measured that the refresh hook alone leaves `registerClassResolverBinding` in
`forms_reactive` and `forms_template_driven`. It's private to `styling.ts`, so no in-scope edit can
remove it. The plan's "removes all 26" was measured on three bundles only. The orchestrator ruled:
WP0's scope gains `styling.ts`, the function moves to `class_resolver.ts` behind a second
module-level hook (D12), and one setter call sets both hooks where `tNode.classResolver` is first
set. Waiving B13 for the two forms bundles was rejected, because B13 is an owner ruling. A single
holder object was rejected, because it departs from the codebase's hook idiom to save one symbol in
two goldens. The plan's claim that `_locateOrCreateElementNode` is only in the hydration golden was
wrong; it's in six.

### 2026-10-28: the classifier reports its form on containers from WP4 on

Codex's WP1 review found that the classifier returns `null` for any binding on a container, so
`NG8121` (WP4) and the container emission for `NG0321` (WP5) couldn't tell a resolver binding from
an ordinary event there. WP4 extends the classifier to keep the form on containers, separately from
whether the node resolves, and WP5's scope gains the pipeline's ingest for the emission.

### 2026-10-28: `ResolvedClasses` carries a type-only brand

The WP2 agent measured that an empty `ResolvedClasses` interface accepts any value: `(cn) => 'x'`
is assignable to `ClassCallback`, and `resolve(42)` compiles. B2's type-checking rule couldn't
hold. The orchestrator ruled: `ResolvedClasses` carries a `ɵ`-prefixed `unique symbol` brand, the
way `ɵINPUT_SIGNAL_BRAND_WRITE_TYPE` brands signal inputs, and the internal class declares it
without a runtime value. From the same review: the full form's normalization drops names that
contain a space, as `[class]` does, while the shorthand keeps its behavior until WP3 (D1). Strict
template checking of `(attr.class)` stays in WP4; Codex agreed that the gap is planned.

### 2026-10-28: how `NG8121` is reported, and the names of the new codes

The WP4 agent found that a type-check op can report an NG-coded diagnostic only through the
out-of-band recorder or the DOM schema checker, and that the Rust preprocessor implements both
interfaces. A required method would break the preprocessor's build, which R10 keeps out of scope.
The orchestrator ruled: `NG8121` goes through an optional recorder method, so the preprocessor
build is unchanged and `NG8121` is TypeScript-only, matching the owner's note on the preprocessor
in the proposal. The new codes get names that describe B7 and B8 (D6):
`OUTPUT_SHADOWED_BY_CLASS_RESOLVER = 8120` (`outputShadowedByClassResolver`) and
`CLASS_RESOLVER_ON_CONTAINER = 8121`. `NG8120` also covers `(attr.class)` next to an output named
`attr.class`, as B7 does. The `host_bindings.ts` path in WP4's scope was stale, and the spec counts
were wrong; both are corrected.

### 2026-10-29: WP6's design

The WP6 agent's design note was ruled by the orchestrator. `withAutoResolution()` turns the runtime
on for the process when it's called, because a component's providers never run an environment
initializer. The root is the injector with scope `'root'`; lazy-route injectors don't count. A
declaration below a root without the feature throws `NG0322` in dev mode and is ignored in
production, because acting on it would bring back the load-order-dependent setup that B14's
root-only rule prevents. Element creation calls a third hook, `_setUpClassResolution`, so every
golden gains that symbol: it's a hook reference, not a resolver function, as with WP0's second
hook. The per-view setting lives in a `WeakMap` keyed by component and root views plus per-element
slots, with no `LViewFlags` change. An automatically resolved element uses its view's resolver,
which departs from D5. Two requirements were added: off instances must behave exactly like an app without the feature (a differential spec and a list of every read site), and the automatic-resolution specs run in their own Bazel targets, because the runtime turns on for the whole process.

### 2026-10-29: templates compiled before `withAutoResolution()` (owner ruling)

Codex's WP6 review found that a template compiled before the first `withAutoResolution()` call
never gets automatic resolution, because definitions cache their template data. It affects several
apps in one process and shared components that `TestBed` doesn't track. The owner ruled: keep the
limitation and document it, with a minimal implementation and no warning, because the feature
would ship in a major version where such test breakage may be acceptable, and maintainers make the
final call. The proposal's notes for maintainers list the options: a dev-mode warning, dropping
the cached template data for future instances, and lazy setup. Codex withdrew its finding that a
directive's own provider skips `NG0322`: the check applies when a provider would turn automatic
resolution on for a view.

### 2026-10-31: external audit triage

The audit, [`class-resolver-b-audit-report.md`](class-resolver-b-audit-report.md) (branch
`codex/class-resolver-b-audit-1`, commit `2f8725ea5c`), has one finding.

A1, major: a shorthand whose `F` loses its receiver compiles, though the literal expansion is
rejected with TS2684 and both throw at runtime. Triage: a bug against B2, with a local cause. D7's
wrapper returns a `ClassCallback`, which declares no `this`, so TypeScript checks a different call
from the one the compiler emits. The emitted code, the runtime, and TypeScript are right. The fix
is WP7, with D7 edited in place. The orchestrator measured three shapes with `tsc`:

- The audit's proposal, an assignability check and then the original call, writes `F` twice, so
  every error inside `F` would be reported twice.
- Constraining only the call's result to `ResolvedClasses` loses arrow inference inside a
  conditional (TS7006).
- `((F) satisfies ClassCallback)!(…)` keeps inference, the receiver, and the brand. A nullable `F`
  still reports once. An `F` that isn't callable now reports twice, TS1360 and TS2349; the
  orchestrator accepts that, because both are true and the literal expansion reports TS2349.

The audit's other probes pass, and several cover cases no spec covers, such as templates moved
across an opt-out boundary. WP8 keeps those, deduplicated against the existing specs. It drops
the two runtime probes that expect A1's `TypeError`, because JIT doesn't type-check and they would
pin the crash. The superseded WP5 `minVersion` note leaves `docs/DEFERRED.md`, as the audit noted.

### 2026-10-31: where WP7's diagnostics map

The WP7 agent measured two conflicts between D7's shape and the rule that existing spans don't
change. TypeScript reports TS1360 on the `satisfies` keyword, so ngtsc maps it to the whole `F`.
No emission shape maps it inside `F`, where today's TS2345 pointed for a safe read and a call
(`classes` became `choice?.classes` and `classes()`). The orchestrator ruled to accept the whole
`F`, instead of choosing a span by expression kind. And without a cast, an `F` that returns `void`
also reported from `resolve()`, on the same token as TS2684, so an ignore marker couldn't drop
only that error. Ruled: the call's result is cast `as any`, because `satisfies` already checks it.
D7 and WP7 are edited to match.

## Reviews

- WP0 (`adcbf79418`, fixup `d7f4b0254c`): orchestrator 9.00, Codex 9.00 before the fixup.
  - One scope question, ruled by the orchestrator: `styling.ts` joins WP0 (see Errata).
  - The bundles lose every resolver function and gain only hook symbols: `_refreshClassResolvers`
    in all eight goldens, `_registerClassResolverBinding` in the two forms goldens.
  - The fixup sets the hooks before `tNode.classResolver`, so the order the commit message states
    holds. Behavior doesn't change.
  - Codex traced every writer of `tNode.classResolver` and `tView.classResolvers`, TView retries
    after a failed first pass, `TestBed`, SSR, and `checkNoChanges`, and found no path that reads
    a hook while it's `null`.
  - A JIT app still carries the runtime, as it carries every instruction through the JIT
    environment. B13 is measured on AOT bundles.
  - For a refactoring round: the binding hook's signature is written out twice in the hook module,
    and three comments restate the same invariant, more than the existing hooks carry.
- WP1 (`39fbbbd924`): orchestrator 9.50, Codex 9.00. No fixup.
  - Every caller keeps its result; the only change is that a partial declaration with
    `(attr.class)` in its template or host needs 22.3.0. Codex reproduced `14.0.0` before and
    `22.3.0` after, in memory, for both new cases.
  - The partial golden test and the preprocessor suite weren't in the ladder; the agent ran the
    first on its own, and both pass. Both are in the ladder now, with the golden's regenerate
    command. BB1's paths for the two partial-declaration files are corrected.
  - For WP4 and WP5: the classifier returns `null` on containers, so the container diagnostics
    need it to keep the form there. Both entries now say so.
  - For a refactoring round: the commented-out reservation returns `'reserved'`, which isn't in
    `ClassResolverForm`; `NG8111` passes `'element'` for every binding until WP4 gives it the node.
- WP2 (`03e122e536`, fixup `2f835cea22`): orchestrator 9.00 after the fixup, Codex 6.00 before
  and 9.00 after.
  - The agent asked whether `ResolvedClasses` should stay an empty interface; measured, it accepts
    any value, so B2's type check couldn't hold. Ruled: a type-only brand (see Errata). The brand
    adds one member to `core_api` and nothing to any bundle.
  - Codex's blocker, strict template checking of `(attr.class)`, is WP4's by the plan; Codex
    agreed after one round.
  - Fixed: the full form now drops spaced names from arrays, `Set`s, and object maps, as `[class]`
    does; a reentrant `resolve()` from a getter is counted, so dev mode throws `NG0320` and
    production keeps the call that starts last.
  - Added specs: production mode (toggling `ngDevMode`, which the agent first thought untestable),
    a throwing handler, directive-host extras, refresh with a new event each time, and a host
    shorthand below a template `(attr.class)`.
  - Deferred to WP3: a lower shorthand can still pass a spaced name up through the sources. WP3's
    entry now has the spec.
  - For a refactoring round: `toClassNames` and `readClassNames` coexist until WP3 removes the
    prototype's path; the NG0320 messages name `(attr.class)` even when WP3's shorthand calls
    `resolve()`.
- WP3 (`fe184c06fb`, fixup `53f9f62fc3`): orchestrator 9.25, Codex 8.00 before the fixup and 9.00
  after.
  - The agent ruled nothing itself and asked four questions. Ruled: the `ClassResolverFeature`
    placeholder stays until WP6 gives it the `{ɵkind, ɵproviders}` shape; a chain in `(class)`
    becomes a compile error in WP5 (Codex agreed after one round); `$event` stays in scope inside
    `F`; WP5 moves the `@HostListener('class')` specs to `host`. Both entries say so.
  - The `includeViewProviders` override is accepted: only the component's own host registration
    sees the component's `viewProviders`, as directive construction does. Measured: without it,
    two specs resolve a template registration with the component's view resolver.
  - Fixed: under `legacyOptionalChaining`, `(class)="choice?.classes"` moved the call into the
    safe read. The compiler now parenthesizes `F`; two compliance cases compare the shorthand with
    its literal expansion in a template and a host.
  - Deferred upstream (`docs/DEFERRED.md`): with native optional chaining in JIT, `(a?.b)(c)` runs
    as `a?.b(c)` in any template.
  - For a refactoring round: `ɵɵclassResolver`'s `flags` is typed `number` because the compiler's
    literal doesn't type-check against the const enum; NG8119's message is stale until WP4 moves it
    to `NG8120`.
- WP4 (`b09e021db9`, fixup `b60c86b5f3`): orchestrator 9.00, Codex 7.00 before the fixup and 9.00
  after.
  - Three questions, ruled: `NG8121` goes through an optional recorder method, so the preprocessor
    is untouched and `NG8121` is TypeScript-only; the codes are `OUTPUT_SHADOWED_BY_CLASS_RESOLVER`
    (8120) and `CLASS_RESOLVER_ON_CONTAINER` (8121); the `class_resolver_ng_container` compliance
    case is deleted, because the partial golden's generator type-checks every case.
  - Codex's blocker, dropped errors for `(class)="(cn) => () => cn()"` and
    `$event.resolve(cn => cn())`, is an upstream bug: the `/*D:ignore*/` marker on template arrow
    parameters drops any error that starts there, also for `(click)="takes((x) => () => x)"`.
    Recorded in `docs/DEFERRED.md` for a separate upstream fix; Codex agreed.
  - Fixed: a resolver binding on a container gets its own handler with `$event: any` and never
    reaches the element path; a host test that passed with the claim exclusion reverted now fails
    then.
  - Untested until the container fix schedules the unclaimed check for templates: `NG8121`'s and
    `NG8111`'s `<ng-template>` branches.
  - For a refactoring round: errors inside `F` point at the property name, as existing mappings
    do; `<ng-container>` handlers lose `Event` inference next to `NG8121`.
- WP5 (`4640a37898`, fixup `bb8e57efff`): orchestrator 9.00, Codex 8.00 before the fixup and 9.00
  after.
  - Rules in AOT and JIT: `@HostListener('class')` and `('attr.class')` are `NG5001`; both forms
    in one `host` object are `NG5001`; a second resolver on one element and a chain in `(class)`
    are `NG5002`; an inherited second resolver throws `NG0323` in dev mode; containers emit
    `ɵɵclassResolver` and log `NG0321`. The `@HostListener`-and-`host` compliance case is deleted;
    an ngtsc spec rejects that combination once.
  - The agent asked whether the partial `minVersion` rule must count container bindings. Ruled
    yes, and Codex found the same gap: `<ng-template>` and `<ng-container>` resolvers declared
    14.0.0. Fixed, with a compliance case for `<ng-template>` and ngtsc specs for
    `<ng-container>`.
  - Fixed: `NG8111` told users to call a method for a shorthand on a container, where nothing runs;
    it now leaves containers to `NG8121` and `NG0321`.
  - Codex showed that type checking still runs after a template parse error, so WP4's chain
    handling isn't dead; its spec is restored.
  - For a refactoring round: no caller passes `'container'` to `getClassResolverForm` any more;
    the AOT and JIT messages for the host rules are duplicated in two files; `NG0321` logs once
    per view creation.
- WP6 (`37ea2bc5f1`, fixups `904336333e` and `7fa0a9ae62`): orchestrator 9.00, Codex 6.00 before
  the fixups, 8.00 after the first, and 9.00 after the second.
  - Design note ruled before code (see Errata): a third hook, production ignoring a declaration
    below the root, a resolver per view, and two added requirements (off instances equal plain
    Angular, separate test targets).
  - Codex's blocker on templates compiled before `withAutoResolution()` went to the owner, who
    ruled to keep the limitation and document it; the proposal lists the options.
  - Fixed: a hydrated root host wasn't seeded, because `wasLastNodeCreated()` was stale when
    `ComponentFactory` created it; the read of the host's hydration info moved before the host's
    directives, for every app. That fix let a component created in a constructor overwrite the
    flag; `ComponentFactory.create` now restores it.
  - Added specs: production ignoring a below-root declaration, root plus lazy route, an explicit
    host registration with automatic resolution on, exact call counts, and constructor reentrancy.
  - Deferred (`docs/DEFERRED.md`): `createEmbeddedView` in a constructor still overwrites the flag,
    as before this round.
  - For a refactoring round: the production rule for a below-root declaration has one spec, for a
    lazy route; component-level declarations in production aren't tested.
