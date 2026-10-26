# `(class)` bindings

Status: experimental, on the `feat/class-resolver` branch of the Flarette/angular fork. The design,
the decisions behind it, and the next steps are in [`proposal.md`](../proposal.md).

A `(class)` binding computes an element's classes from the classes that every source applies to it.
Angular collects the classes from the component on the element, from the other directives, and from
the template. It groups them by source in priority order and passes them to your handler as
`$event`. The value that the handler returns becomes the element's classes.

```html
<ui-button class="px-2" (class)="cn($event)">Save</ui-button>
```

The typical use is Tailwind CSS with a `cn` helper (`clsx` plus `tailwind-merge`). Conflicting
utilities such as `px-2` and `px-4` then resolve by the source that set them, not by the order of
rules in the stylesheet.

## Write a handler

A `(class)` handler takes one of three forms:

```html
<!-- An expression that uses $event. -->
<ui-button class="px-2" (class)="cn($event)" />

<!-- An arrow function. -->
<ui-button class="px-2" (class)="(sources) => cn(sources, size())" />

<!-- A function reference. -->
<ui-button class="px-2" (class)="cn" />
```

If the handler returns a function, as the last two forms do, Angular calls that function with the
same sources.

Templates can't see imports, so expose the helper as a field:

```ts
import {cn} from './cn';

@Component({
  imports: [UiButton],
  template: `<ui-button class="px-2" (class)="cn($event)">Save</ui-button>`,
})
export class Toolbar {
  protected readonly cn = cn;
}
```

Angular applies the result the way it applies a `[class]` binding: a string, an array of class
names, a `Set`, or an object map whose truthy keys are the classes.

- `null`, `undefined`, or `''` removes every class that the binding manages.
- A nested array isn't flattened: `[['a', 'b']]` becomes the class `a,b`. Return `cn(…)` or a flat
  array.
- Any other type, such as a number, throws `Unsupported styling type` in dev mode.

## Resolve a component's own host element

A component can resolve the classes of its host element, so its consumers don't need a `(class)`
binding:

```ts
import {cn} from './cn';

@Component({
  selector: 'ui-button',
  host: {class: 'px-4 py-2', '(class)': 'cn($event)'},
  template: '<ng-content />',
})
export class UiButton {
  protected readonly cn = cn;
}
```

`@HostListener('class', ['$event'])` on a method declares the same resolver. A class keeps one host
listener per event name, so a `@HostListener('class')` replaces a `host: {'(class)': …}` on the same
class. Directives and host directives can declare host resolvers the same way.

## The `ClassSources` payload

```ts
export type ClassSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
];
```

Angular builds the payload with these rules:

1. It always has three slots, ordered from the lowest to the highest priority. A missing source is
   an empty array.
1. The component slot includes the component's host directives, which Angular matches before the
   component.
1. All other directives share one slot, in the order Angular matched them. That order follows the
   consuming component's `imports`.
1. Within a slot, static classes come first, then `[class]`, then `[class.name]`.
1. Each class name appears once, under the source and at the position of the highest-priority
   binding that has an opinion about it. A binding set to `false`, `null`, `''`, or `0` removes the
   class from every lower-priority source. `undefined` defers to a lower priority.

`cn($event)` works without spreading, because `clsx` and `tailwind-merge` flatten nested arrays. A
plain array literal is a valid `ClassSources`, so a unit test can call a resolver method with
`[['px-4'], [], ['px-2']]`.

## Several resolvers on one element

Every resolver on an element runs, from the lowest to the highest priority: the component's host
directives, the component, the other directives in match order, then the template.

- The lowest resolver receives the sources as Angular collected them.
- Angular reads the result of each resolver below the highest as class names. It calls a returned
  function with the same payload, splits a string on whitespace, takes the entries of an array or a
  `Set` and the truthy keys of an object map, and drops empty names and repeated ones. Any other value
  gives no classes.
- It then folds those names back into `ClassSources` for the next resolver:
  - A class keeps the source it had in the payload.
  - A class that the payload didn't have goes to the resolver's own source: `component` for the
    component and its host directives, `directives` for other directives, and `template` for the
    template.
  - A class that the result leaves out is gone for the resolvers above it.
- The highest resolver's result becomes the element's classes.

Example: a library button adds a state class in its own resolver.

```ts
@Component({
  selector: 'ui-button',
  host: {class: 'inline-flex h-9 px-4 bg-primary', '(class)': 'resolve($event)'},
  template: '<ng-content />',
})
export class UiButton {
  readonly disabled = input(false);

  protected resolve(sources: ClassSources) {
    return cn(sources, this.disabled() && 'bg-muted');
  }
}
```

```html
<ui-button [disabled]="true" class="px-2 bg-red-600" (class)="cn($event, 'shadow-lg')" />
```

With `clsx` 2.1.1 and `tailwind-merge` 3.7.0:

```text
collected:       [['inline-flex', 'h-9', 'px-4', 'bg-primary'], [], ['px-2', 'bg-red-600']]
UiButton's cn:   inline-flex h-9 px-2 bg-muted
folded:          [['inline-flex', 'h-9', 'bg-muted'], [], ['px-2']]
consumer's cn:   inline-flex h-9 bg-muted px-2 shadow-lg
```

A lower resolver beats a higher source only by removing that source's class, as `cn` removed
`bg-red-600` here. A class that a lower resolver appends without removing anything ranks in that
resolver's own source, below the template.

To drop a class that a lower resolver added, filter `$event` in your own handler, for example with a
helper that removes a class name from each source.

## When handlers run

Angular calls the handlers on every refresh of the view that declares the element, after the view's
host bindings and before its child components. It then applies the difference between the classes
it applied last time and the new result. Classes that something else added, for example
`Renderer2.addClass` or an animation, stay on the element.

Angular calls the handler while it renders the view, like a template expression:

- Signals that the handler reads are tracked, so a change to them schedules a refresh.
- Writing a signal in the handler throws `NG0600`.
- Writing a plain field that the element's own bindings read leaves the element out of date. An
  `OnPush` view, the default, doesn't report it. Dev mode reports it as `NG0100` in an `Eager` view,
  and `provideCheckNoChangesConfig({exhaustive: true})` reports it in any view.

In an embedded view, such as an `@if` or `@for` block, each view resolves its own elements, and the
handler reads that view's context, such as the `@for` item.

Write the handler as a function of its sources and the state it reads.

## Directive outputs named `class`

A template `(class)` binding next to a directive output named `class` listens to that output, as it
did before `(class)` resolved classes. The output can be the directive's own or one that a host
directive exposes under the alias `class`.

- Dev mode logs `NG0319` once for each such binding, when Angular first creates the template.
- Full AOT compilation reports the extended diagnostic `NG8119`.
- Type checking gives `$event` the output's type.

A host `(class)` always resolves its element's classes, even next to an output named `class`.

An output named `class` also makes Angular drop the element's template `[class]` binding, with or
without a `(class)` binding. The element's static `class` and its `[class.name]` bindings stay. Rename
the output to avoid both problems.

## `<ng-container>` and `<ng-template>`

These elements have no classes:

- A template `(class)` on them is an ordinary event binding. It listens to a directive output named
  `class`, and Angular logs no `NG0319`.
- A directive's host `(class)` does nothing on them, like the directive's other host bindings.

A `(class)` binding with a target, such as `(window:class)` or `(document:class)`, is an ordinary
listener on any element.

## Server rendering and hydration

When hydration claims an element with a `(class)` binding:

- If the element has static classes, hydration rewrites its `class` attribute to them, and the first
  resolution starts from them. Classes that only the server resolved are removed.
- If the element has no static classes, the first resolution starts from the classes the element has
  and removes the ones that no longer resolve. That also removes classes that a directive's
  constructor added.

## Type checking

With `strictTemplates`, or `strictOutputEventTypes` on its own:

- A `(class)` binding that resolves types `$event` as `ClassSources`, in a template and in host
  bindings. With the option off, `$event` is `any`.
- A host `(class)` is checked as a resolver, even next to the host's own output named `class` or a
  host directive output aliased as `class`.
- A template `(class)` next to a directive output named `class` gives `$event` the output's type.
- A `(class)` on `<ng-container>`, in any namespace, is typed like any other event binding there.

The handler's return value isn't type-checked.

## Extended diagnostics

- `classResolverShadowedByOutput` (`NG8119`), a warning by default, reports a template `(class)` on
  an element, other than `<ng-container>`, next to a directive output named `class`. It names the
  directive that declares the output.
- `uninvokedFunctionInEventBinding` (`NG8111`) doesn't report a `(class)` binding without a target,
  so `(class)="cn"` and `(class)="(sources) => cn(sources)"` are valid.

The `ngp` compiler backend doesn't run these extended diagnostics.

## Libraries compiled in partial mode

A partial declaration declares `minVersion: "22.3.0"` when its template has a `(class)` binding on an
element other than `<ng-container>`, or when its host has a `class` listener. An older linker, which
would compile `(class)` as a plain listener, rejects the declaration.

## Error conditions

| Code or message            | When                                                                     | Effect                                                            |
| -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `NG0319`                   | A template `(class)` sits next to a directive output named `class`.      | Dev-mode warning. The binding listens to the output.              |
| `NG8119`                   | The same, found by full AOT compilation.                                 | Compile-time warning by default.                                  |
| `NG0600`                   | A handler writes a signal.                                               | Throws.                                                           |
| `NG0100`                   | A handler writes a plain field that the element's bindings read.         | Reported in an `Eager` view, or with exhaustive `checkNoChanges`. |
| `Unsupported styling type` | The highest resolver returns a value that `[class]` doesn't accept.      | Throws in dev mode.                                               |
| TypeScript errors          | A handler's parameter doesn't accept `ClassSources`, or the output type. | Compile-time error with `strictTemplates`.                        |

## Limitations

- Classes added outside bindings, for example by `Renderer2.addClass`, `NgClass`, or animations,
  aren't in `$event`, so a resolver can't resolve conflicts with them. Prefer `[class]` over
  `[ngClass]` on these elements.
- Angular normalizes a `[class]` value into a list sorted by class name, so conflicts inside one
  `[class]` value resolve alphabetically.
- A directive with an input aliased as `class`, as spartan-ng uses, receives the template's `[class]`
  binding, so that binding isn't a source. The template's static `class` still is.
- The `checkNoChanges` pass doesn't run the handlers, so it doesn't verify that they're stable.
- Every resolver on an element runs on every refresh. The cost isn't measured.
- Root components with a host `(class)`, language service support, and a `(style)` counterpart
  aren't covered.

## Tests

```bash
pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver
```

```bash
pnpm bazel test //packages/platform-server/test:test
```

```bash
pnpm bazel test --local_test_jobs=1 //packages/compiler-cli/test/ngtsc:ngtsc
```

```bash
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/class_resolver_shadowed_by_output:test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/uninvoked_function_in_event_binding:test
```

```bash
pnpm bazel test --test_arg=--filter=r3_view_compiler_class_resolver //packages/compiler-cli/test/compliance/full:full //packages/compiler-cli/test/compliance/linked:linked //packages/compiler-cli/test/compliance/declaration-only:declaration-only //packages/compiler-cli/test/compliance/codegen:codegen
```

- Runtime: [`class_resolver.ts`](../packages/core/src/render3/instructions/class_resolver.ts) and
  [`class_resolver_spec.ts`](../packages/core/test/acceptance/class_resolver/class_resolver_spec.ts).
- Hydration:
  [`class_resolver_hydration_spec.ts`](../packages/platform-server/test/class_resolver_hydration_spec.ts).
- Compiler: the `isClassResolver` flag in
  [`ingest.ts`](../packages/compiler/src/template/pipeline/src/ingest.ts), type checking in
  [`events.ts`](../packages/compiler/src/typecheck/ops/events.ts), and the compliance cases in
  [`r3_view_compiler_class_resolver`](../packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_class_resolver).
