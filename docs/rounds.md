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
