# Deferred findings

- An output named `class` sets `TNodeFlags.hasClassInput` in `setShadowStylingInputFlags`
  (`packages/core/src/render3/view/directives.ts`), so a template `[class]` binding on that
  element is routed to directive inputs and dropped. Found in the WP1 review; upstream behavior.
  Owner, 2026-10-17: document it in the proposal and fix it later in a separate upstream PR.
  Owner, 2026-10-26: triaged and prototyped in the background session `class output drops class`
  (`92c78ec9`), worktree `/Users/geruch/repos/angular-cn-wt/class-output-drops-class`.
- WP4: the blocks rule in `packages/compiler/src/render3/partial/component.ts` sets `minVersion` to `17.0.0` unconditionally, so a component with blocks and signal inputs (`17.1.0`) or signal queries (`17.2.0`) declares `17.0.0` (upstream behavior; WP4 only guards `22.3.0`).
- A warning for `(class)` on `<ng-container>` or `<ng-template>`, where it never resolves
  classes. Owner, 2026-10-26: not in this round, because upstream diagnoses no class binding and no
  `(click)` on containers. The upstream-wide version, an error for every binding on a container
  that does nothing, is triaged and prototyped in the background session `container no-op
bindings` (`5099d6e3`), worktree `/Users/geruch/repos/angular-cn-wt/container-no-op-bindings`.
- Upstream: an event binding next to a directive output with the same name listens to both, but
  the type-check block types `$event` only as the output's type. Measured for `(click)` next to a
  `click` output on 2026-10-17; a targeted host `(document:class)` next to a `class` output has
  the same gap (`listener.ts` registers the global listener and also subscribes to outputs). From
  Codex's WP5 review.
- Upstream: event bindings on `<ng-template>` that no directive claims aren't type-checked at
  all. `appendOutputsOfElementLikeNode` in `packages/compiler/src/typecheck/ops/scope.ts` queues
  `TcbUnclaimedOutputsOp` only for `Element` and `HostElement`. From Codex's WP5 review; relevant
  to the background session `container no-op bindings`.
- Upstream: in JIT with native optional chaining, a template's `(a?.b)(c)` runs as `a?.b(c)`.
  Measured in WP3's fixup: `(attr.class)="$event.resolve((choice?.classes)($event.resolver))"`
  with `choice = null` resolves instead of throwing, and `(class)="choice?.classes"` matches it.
  From the code: `checkTargetParens` in `strip_nonrequired_parentheses.ts` drops the callee's
  parentheses, and the JIT emitter doesn't restore them. AOT output isn't measured.
- Upstream: a TypeScript error that starts at an arrow parameter in a template is dropped, because
  the type-check emitter marks every arrow parameter `/*D:ignore*/`
  (`packages/compiler/src/typecheck/expression.ts` around line 386, from upstream `87a422358b`).
  `(click)="takes((x) => () => x)"` compiles although TypeScript rejects it; so do
  `(class)="(cn) => () => cn()"` and `(attr.class)="$event.resolve(cn => cn())"`. TS7006, TS6133,
  and TS6199 are already filtered in `diagnostics.ts`, so removing or narrowing the marker is the
  likely fix. From Codex's WP4 review; to be fixed as a separate upstream PR.
- WP5: `ClassResolverPresenceVisitor` in `packages/compiler/src/render3/partial/component.ts` doesn't count `(class)` or `(attr.class)` on `<ng-container>` or `<ng-template>`, which now compile to `ɵɵclassResolver`, so such a template keeps its older `minVersion` and an older linker compiles the binding as a listener.
