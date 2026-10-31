# Rounds

## 2026-10-17 to 2026-10-26: several resolvers, partial compilation, and the audit fixes for `(class)`

### Why

The first `(class)` prototype let exactly one resolver win on each element. Each registration
replaced the previous one, so a library component's resolver, and any state class it added,
vanished as soon as a consumer wrote their own `(class)`. Among directives, the winner depended on
the order of the consuming component's `imports`, which consumers rarely think about. An output
named `class` on any directive turned every resolver into a listener, the component's own included.
And a library compiled in partial mode could meet an older linker that would compile `(class)` as a
plain listener, so its classes would silently stop resolving. These had to be settled before
anything else built on the binding.

### What it decided

- Every resolver on an element runs, from the lowest to the highest priority, and each one receives
  the previous result folded back into `ClassSources` by origin. A class that a resolver adds ranks in
  that resolver's own source. Delegation through `$event.inherited()` was dropped: naming another
  directive's resolver depends on match order that consumers can't see, and the fold keeps every
  resolver's logic by default with one plain tuple type, so no warning about replaced resolvers is
  needed.
- A host `(class)` always resolves on an element. Only a template `(class)` next to a directive output
  named `class` falls back to listening. Measured upstream behavior backs this: a directive input
  takes a property binding's name without an error, so the output takes the binding too, with the
  `NG0319` and `NG8119` warnings that upstream lacks.
- A partial declaration that uses `(class)` requires a `22.3.0` linker, and the blocks rule can't
  lower that.
- The external audit found that type checking still treated a host `(class)` next to a `class`
  output as a listener, and that `<ng-container>` inside `<svg>` was classified as an element. The
  same namespace bug was in `NG8119`. Both were fixed, so the compiler classifies `(class)` as the
  runtime runs it.
- A directive's host `(class)` on `<ng-container>` or `<ng-template>` now does nothing. As a listener,
  its handler received a sibling's output value while typed as `ClassSources`, and threw. Upstream
  host bindings on containers do nothing either, so no new warning was added.
- The audit's finding that `NG8111` exempts too many `(class)` bindings wasn't fixed here, because
  the next design narrows it to the shorthand, where type checking backs it.

### What it set up next

While triaging the audit, the owner moved `(class)` to a new design, recorded in
[`proposal.md`](../proposal.md#next-the-resolve-class-event). The classes go through
`$event.resolve()` instead of the handler's return value. A callback shorthand,
`(class)="(cn) => cn('shadow-lg')"`, compiles to the full form, `(attr.class)`, and must return the
opaque `ResolvedClasses` that the bound resolver creates. `provideClassResolver()` supplies the
resolver, with Angular's plain merge as the default. The reasons: an event binding keeps its void
contract, the result is type-checked, a later statement can't silently replace the classes, `NG8111`
exempts only the shorthand, and a component's default classes rank below the consumer's. A measured
simulation showed that a host appending its default after the sources drops the consumer's
conflicting class. The design gets its own implementation round.

Two upstream problems surfaced along the way and went to separate sessions, each to triage and
prototype fixes: an output named `class` drops the element's `[class]` binding, and bindings on
`<ng-container>` and `<ng-template>` that do nothing raise no error.

## 2026-10-26 to 2026-10-31: the `resolve()` class event

### Why

In the first prototype, a `(class)` handler returned the classes. That broke the void contract of
an event binding: the return value wasn't type-checked, and a later statement in the handler could
replace the classes silently. `NG8111` had to exempt every `(class)` binding, because type
checking couldn't tell a resolver from a handler. Every app bundle also carried the resolver
runtime, about 26 symbols, because change detection imported it unconditionally. And the owner
expected that people and coding agents would forget a per-element `(class)`, so conflicting classes
from a component, its directives, and its consumer would stay unresolved.

### What it decided

- Classes go through `$event.resolve()`. The full form, `(attr.class)`, receives a
  `ClassResolveEvent` with the sources, a bound resolver, and `resolve()`. The shorthand
  `(class)="F"` means exactly `(attr.class)="$event.resolve((F)($event.resolver))"`, so `$event`
  stays in scope inside `F`. A handler that doesn't call `resolve()` keeps the sources. A repeated,
  late, or reentrant call throws `NG0320` in dev mode. Production ignores a late call, and the last
  call to start wins.
- A shorthand must return the opaque `ResolvedClasses` that its own resolver creates. A type-only
  brand enforces it at compile time, and a dev-mode provenance check enforces it at runtime.
- The resolver contract is fixed, `(...classes: string[]) => string`, with no declaration merging,
  because a library that augments the type differently from its app fails with TS2717. Angular
  normalizes every source and extra to a string first, reading extras the way production reads
  `[class]` and dropping names that contain a space. `twMerge`, shadcn's `cn`, and `clsx` all fit.
  Without a provider, Angular applies its plain merge.
- `(class)` and `(attr.class)` always resolve. A directive output with the same name is shadowed,
  and `NG8120` warns at compile time, instead of the first prototype's runtime fallback to a
  listener.
- One way to declare a resolver: `host` or the template. `@HostListener('class')` and
  `@HostListener('attr.class')` are errors, because a decorator always calls its method and so
  can't pass the shorthand's callback. A directive and a template element each get one resolver,
  a chain in a shorthand is an error, and an inherited second resolver throws `NG0323` in dev
  mode, because declaration files carry no host bindings.
- `(class)` on `<ng-container>` and `<ng-template>` gets its own diagnostics, `NG8121` at compile
  time and `NG0321` at runtime, in case the generic check for bindings that do nothing on
  containers never lands upstream. Other `(attr.*)` names stay ordinary listeners. The reservation
  is a commented-out check.
- The runtime sits behind three module-level hooks that the first `ɵɵclassResolver` call or
  `withAutoResolution()` sets, so an app that doesn't use the feature carries only the hook
  symbols. The eight bundling symbol tests guard this.
- Automatic resolution, `provideClassResolver(resolver, withAutoResolution())`, resolves every
  element that a component or directive matches. It's declared at the root only. Its data is built
  per template in the first creation pass while providers belong to instances, so a lower
  declaration would make the result depend on load order. Below a root without the feature,
  `NG0322` throws in dev mode, and production ignores the declaration. A component turns it off by
  providing the resolver without the feature, and back on below. An explicit `(class)` replaces it
  on its element. It skips the resolver when no source's string changed. A template compiled before
  the first `withAutoResolution()` call never gets automatic resolution. The owner accepted that
  limitation and documented it, because the feature would ship in a major version and maintainers
  make the final call.
- Angular's own cost was measured in JIT dev mode: an explicit `(class)` adds about 2.2 µs per
  element at creation and 1.5 µs per refresh, automatic resolution about 1.1 µs and 0.26 µs, and a
  subtree with it turned off nearly nothing. The proposal's notes for maintainers hold the numbers.
- The external audit found one defect. Type checking passed a shorthand's callback through a
  `ClassCallback` parameter, which dropped a method's `this`, so `(class)="active ? first : classes"`
  compiled and crashed. The shorthand is now checked as the call that runs, together with its
  result, and nothing is suppressed. Suppression had hidden the only error of some overloaded
  methods, so the owner chose exact checking. A wrong callback can report up to three errors, all
  on the callback, and a callback without parameters is rejected, as the written-out form is. A
  follow-up kept the generated checks out of the template symbol search, so hover and
  go-to-definition still find the callback. The audit's probes that covered untested cases moved
  into the specs.

### What it set up next

`(class)` is a special case of resolving any attribute, which the proposal's request for comments
sketches as a provider keyed by attribute. The scope may grow and the work may resume, so the
round's plan, audit prompt and report, and memory notes stay in place for now.
[`docs/DEFERRED.md`](DEFERRED.md) holds the follow-ups. Among them: two rejection specs to add once
the arrow-parameter fix lands upstream, the embedded-view hydration flag, legacy optional chaining
dropping a receiver, and two preprocessor gaps. Removing duplicate type-checking errors after the
fact is an option in the proposal's notes for maintainers.

Several upstream problems went to separate sessions. Errors at template arrow-function parameters
were dropped, and that fix is open as PR #71734. Bindings on containers that do nothing raise no
error, and `<ng-container>` inside `<svg>` skips `NG5002`.
