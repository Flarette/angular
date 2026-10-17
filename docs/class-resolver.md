# Design: resolve an element's classes with a `(class)` binding

Status: prototype on branch `feat/class-resolver`. Not pushed.

Decisions confirmed on 2026-10-17:

- `ClassSources` is three fixed arrays of class names, `[component, directives, template]`, with
  directives flattened, no `static`, and no grouping per binding.
- A directive output named `class` keeps listener behavior at runtime, with a dev-mode warning, and
  full AOT compilation warns about it too.
- Components can resolve their own host classes with `host: {'(class)': …}`. A template `(class)`
  overrides it.
- The handler runs on every refresh of the view that declares the element.
- Hydration starts the first resolution from the classes the element has when it has no static
  classes.

The `(class)` binding lets a template decide the final classes of an element. Angular collects the
classes that the component, the other directives, and the template apply to the element. It groups
them by source in priority order and passes them to the handler as `$event`. The handler's return
value becomes the element's classes.

```html
<ui-button class="px-2" (class)="cn($event)">Save</ui-button>
```

The main use case is Tailwind CSS with `cn` (`clsx` plus `tailwind-merge`). Conflicting utilities
such as `px-2` and `px-4` should resolve by which source set them, not by stylesheet order.

The same binding also works in host metadata, so a component author can resolve their own host
element's classes once instead of asking every consumer to add `(class)`.

## Background

### How Angular combines classes today

An element's classes come from three kinds of sources:

| Source                   | Static               | Dynamic                                                    |
| ------------------------ | -------------------- | ---------------------------------------------------------- |
| Component on the element | `host: {class: '…'}` | `host: {'[class]': '…', '[class.x]': '…'}`, `@HostBinding` |
| Other directives         | `host: {class: '…'}` | same as the component                                      |
| Template                 | `class="…"`          | `[class]`, `[class.x]`, `class="a {{b}}"`                  |

Angular applies the union of all of them. When sources disagree about the same class name, the more
specific source wins: template over directives over component. Within one source, `[class.x]` wins
over `[class]`, which wins over the static value. A binding set to `undefined` defers to a lower
priority.

The union is the problem for utility CSS. `px-2` and `px-4` are different names, so both stay on the
element, and the rule that comes later in the stylesheet wins. Which source set the class doesn't
matter.

```ts
@Component({
  selector: 'ui-button',
  template: '<ng-content />',
  host: {class: 'px-4 py-2'},
})
export class UiButton {}
```

```html
<!-- The consumer asks for px-2. -->
<ui-button class="px-2">Save</ui-button>
```

```html
<!-- Rendered today: both paddings, and the stylesheet decides. -->
<ui-button class="px-4 py-2 px-2">Save</ui-button>
```

### When static classes are merged

The preliminary design describes `static` as resolved at compile time from all sources. Each
declaration's static classes are known at compile time: the template's are in `consts`, and each
directive's are in its `hostAttrs`. Which directives match an element is decided at runtime, in the
first creation pass of the template (`directiveHostFirstCreatePass`), because JIT, partial, and local
compilation don't know the matches. That pass merges all static classes into one string,
`tNode.classes`, which is written to the DOM when the element is created.

Per-source static classes are just as cheap at that point: read `hostAttrs` of each matched directive
and the element's own `attrs`. They're computed once per template, not on each change detection.

## Proposed API

### Syntax

The handler accepts three forms:

```html
<!-- 1. An expression that uses $event. -->
<ui-button class="px-2" (class)="cn($event)" />

<!-- 2. An arrow function. -->
<ui-button class="px-2" (class)="(sources) => cn(sources, size())" />

<!-- 3. A function reference. -->
<ui-button class="px-2" (class)="cn" />
```

All three compile to a listener-style handler. Angular calls it with the `ClassSources` as `$event`.
If the handler returns a function, as forms 2 and 3 do, Angular calls that function with the same
sources. Angular applies the final value the way it applies a `[class]` binding: a string, an array
of class names, a `Set`, or an object map.

Templates can't see imports, so the component exposes `cn`:

```ts
import {cn} from 'cn';

@Component({
  imports: [UiButton],
  template: `<ui-button class="px-2" (class)="cn($event)">Save</ui-button>`,
})
export class Toolbar {
  protected readonly cn = cn;
}
```

The preliminary form `({ static, dynamic }) => cn(static, ...dynamic)` can't work, for two reasons:

- The template expression parser accepts only identifier parameters in arrow functions
  (`ArrowFunctionParameter = ArrowFunctionIdentifierParameter`). Destructuring fails with
  `Unexpected token '=>'`.
- `static` is a reserved word in strict mode. `({static}) => 0` is a `SyntaxError` in an ES module.

Spread in call arguments works: `cn(...$event, extra)` parses.

### The `ClassSources` payload

```ts
export type ClassSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
];
```

Angular builds the payload with these rules:

1. It always has three slots, ordered from the lowest to the highest priority. A missing source is an
   empty array.
1. The component slot includes the component's host directives. Angular matches them before the
   component (`resolveHostDirectives`), so they already rank below it.
1. All other directives share one slot, in the order Angular matched them, which is how the runtime
   ranks them today. That order comes from the component's dependency list, so authors rarely
   control it, and the payload doesn't try to tell directives apart.
1. Within a slot, static classes come first, then `[class]`, then `[class.x]`.
1. Each class name appears at most once. It's reported under the source, and at the position, of
   the highest-priority binding that has an opinion about it. A binding set to `false`, `null`, `''`,
   or `0` removes the class from every lower-priority source, as it does today. `undefined` defers.

### Worked example

Initial declarations:

```ts
@Component({
  selector: 'ui-button',
  template: '<ng-content />',
  host: {
    class: 'inline-flex px-4 py-2 rounded-md',
    '[class.opacity-50]': 'disabled()',
  },
})
export class UiButton {
  readonly disabled = input(false);
}

@Directive({selector: '[uiElevated]', host: {class: 'shadow-sm rounded-lg'}})
export class UiElevated {}
```

```html
<ui-button
  uiElevated
  class="px-2"
  [class.rounded-md]="false"
  [disabled]="true"
  (class)="cn($event)"
>
  Save
</ui-button>
```

1. Creation. Angular writes the merged static classes, the same as without `(class)`:

   ```html
   <ui-button class="inline-flex px-4 py-2 rounded-md shadow-sm rounded-lg px-2"></ui-button>
   ```

1. First refresh. The template's `[class.rounded-md]` binding records `false`, and the component's
   host binding records `opacity-50: true`. Neither touches the DOM.

1. Resolution, after the host bindings. Each source contributes:

   - Component: static `inline-flex px-4 py-2 rounded-md`, then `opacity-50` from its binding.
   - Directives: static `shadow-sm rounded-lg`.
   - Template: static `px-2`. Its `[class.rounded-md]="false"` turns off `rounded-md`, which
     removes it from the component slot.

   ```ts
   $event = [['inline-flex', 'px-4', 'py-2', 'opacity-50'], ['shadow-sm', 'rounded-lg'], ['px-2']];
   ```

1. The handler returns `cn($event)`. With `clsx@2.1.1` and `tailwind-merge@3.7.0` that's:

   ```ts
   'inline-flex py-2 opacity-50 shadow-sm rounded-lg px-2';
   ```

1. Angular applies the difference from step 1: it removes `px-4` and `rounded-md`, and adds
   `opacity-50`.

   ```html
   <ui-button class="inline-flex py-2 shadow-sm rounded-lg px-2 opacity-50"></ui-button>
   ```

### Why per-source arrays instead of `{static, dynamic}`

In the preliminary shape, a component's dynamic class outranks the template's static class, because
all static classes come first. Results from running the real `clsx` and `tailwind-merge`:

```ts
// {static, dynamic}: the template's static px-4 comes before the component's dynamic px-2.
cn('px-4', [['px-2', 'py-1']]);
// 'px-2 py-1': the template loses.
```

```ts
// Per-source arrays: the template comes last.
cn([['px-2', 'py-1'], [], ['px-4']]);
// 'py-1 px-4'
```

The payload must be arrays, not an object with named keys. `clsx` treats an object as a dictionary of
class names:

```ts
cn({component: ['px-2'], template: ['px-4']});
// 'component template'
```

Nesting depth doesn't matter. `clsx` (`toVal`) and `tailwind-merge` (`toValue`) both flatten arrays
recursively, so `cn($event)`, `cn(...$event)`, and `cn([[$event]])` return the same string. Two levels
(source, then class) are enough, and the spread is optional.

## The requested edge cases

### 1. Directives that already have an output named `class`

Today `(class)="handler($event)"` subscribes to any directive output named `class`. It also adds a
DOM listener for a `class` event.

| Option                                    | Behavior                                                                                                                                     | Trade-off                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fall back (prototype)                     | If a matched directive has a `class` output, the binding keeps listener semantics. Dev mode logs `NG0319`, and full AOT warns with `NG8119`. | Nothing breaks: the handler compiles the same way as a listener, so the old semantics are exact. The same syntax means two things, depending on which directives match. |
| Error and migrate                         | Report a compile-time diagnostic in AOT and a runtime error otherwise.                                                                       | Unambiguous. Breaking, and a consumer can't rename an output that a third-party library declares.                                                                       |
| Different name, such as `(class.resolve)` | No collision.                                                                                                                                | Loses the short form. `(class.x)` already reads like a modifier, as in `(keydown.enter)`.                                                                               |

The compiler can't always see the conflict. JIT, partial, and local compilation don't know which
directives match, so the runtime makes the final call. In full AOT, the type checker does know, and
it already types a claimed `(class)` as the directive's output. That matches the runtime fallback.
Full AOT compilation also reports it as the extended diagnostic `classResolverShadowedByOutput`
(`NG8119`), a warning by default.

What still breaks: a custom element that dispatches a DOM event named `class`. `(class)` on it no
longer adds a DOM listener. `@HostListener('class')` now declares a host resolver instead of a
listener.

### 2. `[(class)]` two-way binding

`[(x)]` is shorthand for `[x]` plus `(xChange)`. So `[(class)]="value"` means
`[class]="value" (classChange)="value = $event"`. It never touches `(class)`, so the two can coexist.

`[(class)]` has a real use today. A directive can declare `model('', {alias: 'class'})`, which creates
a `class` input and a `classChange` output, and consumers bind to it with `[(class)]`.

Naming the resolver `(classChange)` would create the collision this question tries to avoid.
`[(class)]="value"` would turn its assignment `value = $event` into a resolver. It would store the
`ClassSources` array in `value` and apply that array as classes.

There's no good use case for two-way binding of the resolved string. Writing it back into the value
that feeds `[class]` loops within one change detection: resolve, assign, `[class]` changes, resolve
again. In dev mode that throws `NG0100`. The only non-looping need is observing the final classes,
for example to mirror them on an overlay panel. That's a read-only event, and `afterRenderEffect` can
read `element.className` today.

Recommendation: keep `(class)`. Don't reserve `[(class)]` or `(classChange)`.

### 3. Static classes concatenated ahead of time

Yes, a resolver should change this, and the prototype does so without losing the precomputation:

- The payload drops `static`. Every source reports its static classes in its own slot.
- Per-source static classes are computed once per template, in the first creation pass. Treating
  every source as dynamic costs nothing extra per change detection for static classes.
- The merged `tNode.classes` string is still written when the element is created. Directive
  constructors see the same `classList` as today. The first resolution diffs against it in the same
  synchronous pass, before the browser paints.

## Other edge cases

| Case                                                                             | Prototype behavior                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A higher-priority binding turns a class off                                      | The class is absent from every slot, as today.                                                                                                                                                                                                                                                                                                                                                                        |
| A higher-priority binding turns a class on again                                 | The class moves to that binding's slot and position. `<ui-button class="px-4" [class.px-2]="true">` over a host `px-2` gives `[[], [], ['px-4', 'px-2']]`.                                                                                                                                                                                                                                                            |
| Classes added outside bindings: `Renderer2.addClass`, `NgClass`, animations, CDK | They stay on the element, because Angular applies a diff and touches only the classes it applied. They aren't in `$event`, so `cn` can't resolve conflicts with them. Prefer `[class]` over `[ngClass]` on these elements.                                                                                                                                                                                            |
| Order inside one `[class]` value                                                 | Not preserved. Angular normalizes a `[class]` value into a sorted key-value array, so conflicts inside one binding resolve alphabetically.                                                                                                                                                                                                                                                                            |
| The handler returns nested arrays                                                | Applied like `[class]`, which doesn't flatten: `[['a', 'b']]` becomes the class `a,b`. Return `cn(…)` or a flat array.                                                                                                                                                                                                                                                                                                |
| A directive with `input({alias: 'class'})`, the pattern spartan-ng uses          | The template's `[class]` feeds that input, so it isn't a source. The template's static `class` is still a source; it's also on the DOM today. Covered by a spec.                                                                                                                                                                                                                                                      |
| `<ng-container>` and `<ng-template>`                                             | `(class)` stays a listener, because there's no element to style.                                                                                                                                                                                                                                                                                                                                                      |
| Embedded views (`@if`, `@for`)                                                   | Each view resolves its own elements after its host bindings. The handler reads that view's context, such as the `@for` item.                                                                                                                                                                                                                                                                                          |
| State that the handler reads                                                     | The handler runs on every refresh of the view that declares the element, after host bindings. Signals read inside it are tracked, so a change schedules a refresh.                                                                                                                                                                                                                                                    |
| Template and host `(class)` on one element                                       | The template's handler wins. Between host handlers, the later directive wins.                                                                                                                                                                                                                                                                                                                                         |
| Dev-mode `checkNoChanges` pass                                                   | Skipped. The prototype doesn't verify that the handler is stable.                                                                                                                                                                                                                                                                                                                                                     |
| Server rendering and hydration                                                   | Handled. Hydration rewrites a claimed element's `class` attribute to its static classes, and the first resolution starts from them, so classes that only the server resolved are removed. An element without static classes keeps the server's attribute, so its first resolution starts from the classes it has. That also removes classes a directive's constructor added to such an element. Covered by two specs. |
| Performance                                                                      | No cost for elements without `(class)`: one null check per class binding update and one per view refresh. Per handler, per refresh: one `Map` over the element's classes, one call, and one sorted diff. `tailwind-merge` caches results by input string.                                                                                                                                                             |

## Alternatives

| Design                                                                                     | Who opts in           | Sees every source                                           | Ergonomics            | Risk                                                                                        | Typing                               |
| ------------------------------------------------------------------------------------------ | --------------------- | ----------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| A. Template `(class)` (prototype)                                                          | Consumer, per element | Yes                                                         | Repeated at every use | `class` outputs (handled by fallback)                                                       | `$event: ClassSources`               |
| B. Host `(class)` (prototype)                                                              | Component author      | Yes                                                         | Once per component    | Host listeners for a DOM `class` event                                                      | `$event: ClassSources`               |
| C. `[class]="fn"`: give function values a meaning                                          | Consumer              | Only if `[class]` stops being a source on that element      | No new syntax         | Function values throw in dev mode and are ignored in production today, so the space is free | Needs a special case                 |
| D. `provideClassResolver(cn)` through dependency injection                                 | App or subtree        | Yes                                                         | No template changes   | Changes every element below, including third-party components                               | Not applicable                       |
| E. Component option, such as `classResolver: cn`                                           | Component author      | Yes                                                         | Once per component    | None                                                                                        | A static function, no instance state |
| F. Userland: `input({alias: 'class'})` plus host `[class]` computed with `cn` (spartan-ng) | Component author      | No: template `[class.x]` and other directives are invisible | Works today           | Host static classes still conflict, so authors avoid them                                   | Normal input                         |

Recommendation: A and B together, as prototyped. They share one mechanism and one syntax. B covers
the shadcn case without boilerplate for consumers, and A gives a consumer an override. D is the
strongest alternative for apps that use Tailwind everywhere, but it's global and hard to reason about
locally.

## Prototype

### Compiler

- Ingestion flags `(class)` on an element, other than `<ng-container>`, and `(class)` in host
  bindings, as class resolvers: [`ingest.ts`](../packages/compiler/src/template/pipeline/src/ingest.ts).
  The flag lives on `ListenerOp`, so every listener phase still applies: `$event`, view restoration,
  naming, and returning the last expression.
- Reification emits `ɵɵclassResolver(handlerFn)` instead of `ɵɵlistener('class', handlerFn)`:
  [`reify.ts`](../packages/compiler/src/template/pipeline/src/phases/reify.ts).
- Type checking types `$event` as `ClassSources` in templates and in host bindings when
  `strictOutputEventTypes` is on, and as `any` otherwise:
  [`events.ts`](../packages/compiler/src/typecheck/ops/events.ts). A `(class)` binding that a
  directive output claims keeps the output's type, which matches the runtime fallback.

Generated code for `<div class="p-2" [class.px-4]="wide" (class)="cn($event, extra)">`:

```js
if (rf & 1) {
  ɵɵelementStart(0, 'div', 0);
  ɵɵclassResolver(function App_div_class_0_listener($event) {
    return ctx.cn($event, ctx.extra);
  });
  ɵɵelementEnd();
}
if (rf & 2) {
  ɵɵclassProp('px-4', ctx.wide);
}
```

A production version might replace the `ListenerOp` flag with a dedicated op kind.

Two extended diagnostics change:

- The new `classResolverShadowedByOutput` (`NG8119`) warns when a directive output named `class`
  claims a `(class)` binding: [`index.ts`](../packages/compiler-cli/src/ngtsc/typecheck/extended/checks/class_resolver_shadowed_by_output/index.ts).
- `uninvokedFunctionInEventBinding` (`NG8111`) no longer flags `(class)="cn"` or an arrow function in
  `(class)`, because Angular calls a returned function there.

### Runtime

- [`class_resolver.ts`](../packages/core/src/render3/instructions/class_resolver.ts) holds the
  instruction, the per-source bookkeeping, and the resolution step.
- On the first creation pass, `ɵɵclassResolver` builds a `TClassResolver` with one segment per
  matched directive plus the template, each with its static classes. It allocates two `LView` slots,
  one for the handler and one for the classes it last applied.
- On the first update pass, each class binding on such an element records its binding index in its
  segment: [`styling.ts`](../packages/core/src/render3/instructions/styling.ts). After that, class
  bindings on the element store their values but don't write to the DOM.
- `refreshView` calls `refreshClassResolvers` right after host bindings and before child components:
  [`change_detection.ts`](../packages/core/src/render3/instructions/change_detection.ts).

### Tests

[`class_resolver_spec.ts`](../packages/core/test/acceptance/class_resolver/class_resolver_spec.ts) runs
16 specs through TestBed and the JIT compiler, with a stand-in `cn`. Each spec owns one rule.
Mutating each rule fails the spec that owns it. These mutation runs predate the 16th spec, which
covers an input named `class`.

| Mutation                                                      | Failing specs |
| ------------------------------------------------------------- | ------------- |
| Ignore the static classes written at creation                 | 11            |
| Keep a re-asserted class at its first position                | 1             |
| Let class bindings write to the DOM                           | 1             |
| Put the component's host directives with the other directives | 1             |
| Resolve before host bindings                                  | 2             |
| Don't call a returned function                                | 2             |

[`template_typecheck_spec.ts`](../packages/compiler-cli/test/ngtsc/template_typecheck_spec.ts) checks
the `$event` type with and without `strictOutputEventTypes`.
[`host_bindings_type_check_spec.ts`](../packages/compiler-cli/test/ngtsc/host_bindings_type_check_spec.ts)
checks it in host bindings; without the fix, it fails with `Argument of type 'Event'`.
The `class_resolver_shadowed_by_output` and `uninvoked_function_in_event_binding` specs under
`packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks` cover both diagnostics.
[`class_resolver_hydration_spec.ts`](../packages/platform-server/test/class_resolver_hydration_spec.ts)
renders on the server and hydrates, with and without static classes.

Run the runtime tests with:

```bash
pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver
```

### Regression runs

These existing suites pass with the change:

- `//packages/core/test/acceptance:acceptance`, the full runtime acceptance suite.
- `//packages/core/test:test`, `//packages/core/test/render3:render3`, and
  `//packages/core/test/render3/ivy:ivy`.
- `//packages/compiler/test:test` and `//packages/compiler/test/render3:test`.
- `//packages/compiler-cli/test/compliance/full:full`. No existing golden output changed.
- `//packages/compiler-cli/test/ngtsc:ngtsc`, and the new type checking specs on the fork's `ngp`
  backend (`ngtsc_ngp`).
- `//packages/core:core_api` and `//packages/core:core_errors`, after accepting the new
  `ClassSources` type and the `CLASS_RESOLVER_OUTPUT_CONFLICT` code.
- `pnpm ts-circular-deps:check`: no cycles.

## Not done

- Golden compliance tests for AOT and partial (linker) output.
- Code generation on the fork's `ngp` backend. Its type checking passes the new specs, and it
  reuses `@angular/compiler` for code generation, but the `ngp` compliance suites weren't run.
- Root components (a bootstrapped host with a host `(class)` binding) and `@HostListener('class')`.
- Checking the handler's return type.
- `classResolverShadowedByOutput` on the `ngp` backend. That backend's test harness doesn't report
  the directives on an element yet, so the spec is listed in `ngp_known_failures.ts`, like other
  checks that need that lookup.
- Language service support for `$event` in `(class)`.
- Verifying handler stability in the `checkNoChanges` pass.
- A `(style)` counterpart.
- Documentation on angular.dev.
