# Proposal: resolve an element's classes with a `(class)` binding

Status: prototype on the `feat/class-resolver` branch of the Flarette/angular fork. Not pushed. The
decisions dated 2026-10-17 about several resolvers on one element and about partial compilation
aren't implemented yet. Implementation notes, the worked example, and the test inventory are in
[`docs/class-resolver.md`](docs/class-resolver.md).

## Summary

A `(class)` binding lets a template, or a component's host metadata, decide the final classes of an
element. Angular collects the classes that the component, the other directives, and the template
apply to the element. It groups them by source in priority order and passes them to the handler as
`$event`. The handler's return value becomes the element's classes.

```html
<ui-button class="px-2" (class)="cn($event)">Save</ui-button>
```

The main use case is Tailwind CSS with the `cn` helper from shadcn (`clsx` plus `tailwind-merge`).
Conflicting utilities such as `px-2` and `px-4` then resolve by which source set them, not by the
order of rules in the stylesheet.

## Decisions

| Date       | Decision                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-17 | `$event` is `ClassSources`: three arrays of class names, `[component, directives, template]`. Directives share one slot. There's no `static` field and no split between static and bound classes. Reconfirmed after [Should bound classes always win over static ones?](#should-bound-classes-always-win-over-static-ones).                      |
| 2026-10-17 | A component can resolve its own host element's classes with `host: {'(class)': …}` or `@HostListener('class')`. A template `(class)` replaces it.                                                                                                                                                                                                |
| 2026-10-17 | The handler runs on every refresh of the view that declares the element.                                                                                                                                                                                                                                                                         |
| 2026-10-17 | Hydration starts the first resolution from the element's current classes when the element has no static classes.                                                                                                                                                                                                                                 |
| 2026-10-17 | One resolver runs per element, chosen by priority. It can run the resolver it replaced with `$event.inherited()`, or a named directive's resolver with `$event.inherited(Directive)`. See [Delegation](#delegation-with-eventinherited).                                                                                                         |
| 2026-10-17 | Dev mode warns with `NG0320` when a directive's or component's resolver never runs because another directive's resolver replaced it without delegating. A template that replaces a resolver, and a component that replaces its own host directive's, stay silent. See [Warning when a resolver never runs](#warning-when-a-resolver-never-runs). |
| 2026-10-17 | Host-level `(class)` always resolves. Only a template `(class)` next to a directive output named `class` falls back to a listener, with the dev-mode warning `NG0319` and the extended diagnostic `NG8119`. See [Directive outputs named `class`](#directive-outputs-named-class).                                                               |
| 2026-10-17 | No app-wide controls in core for now. App-wide default resolvers are open for comments; see [Request for comments](#request-for-comments).                                                                                                                                                                                                       |
| 2026-10-17 | A partial declaration whose template or host uses `(class)` declares `minVersion: "22.3.0"`. See [Libraries compiled in partial mode](#libraries-compiled-in-partial-mode).                                                                                                                                                                      |
| 2026-10-17 | The Rust compiler preprocessor (`packages/compiler-cli/preprocessor`) doesn't change, because it doesn't accept external contributions.                                                                                                                                                                                                          |
| 2026-10-17 | Compliance (golden) tests target the TypeScript compiler.                                                                                                                                                                                                                                                                                        |

No open questions remain for the prototype. The [Request for comments](#request-for-comments) asks
about the directions after it.

## Motivation

An element's classes come from three kinds of sources:

- The component on the element, through its host metadata.
- Other directives on the element, through their host metadata.
- The template that uses the element.

Angular applies the union of all of them. When sources disagree about the same class name, the more
specific source wins: the template over directives, and directives over the component.

The union breaks utility CSS. `px-2` and `px-4` are different names, so both stay on the element,
and the rule that comes later in the stylesheet wins:

```ts
@Component({
  selector: 'ui-button',
  host: {class: 'px-4 py-2'},
  template: '<ng-content />',
})
export class UiButton {}
```

```html
<ui-button class="px-2">Save</ui-button>
<!-- Rendered: class="px-4 py-2 px-2". The stylesheet decides which padding applies. -->
```

Component libraries built on utility CSS now merge classes as a matter of course. React libraries in
the shadcn style call `cn(componentClasses, className)`, which puts the consumer's classes last.
Angular libraries emulate this with an input aliased to `class` and a computed host `[class]`
binding, as spartan-ng does. That workaround can't see the template's `[class.x]` bindings or the
classes of other directives, and host static classes still conflict. Each library reinvents it,
because Angular has no way to resolve classes across sources.

## Proposed API

### Syntax

The handler accepts three forms:

```html
<!-- An expression that uses $event. -->
<ui-button class="px-2" (class)="cn($event)" />

<!-- An arrow function. -->
<ui-button class="px-2" (class)="(sources) => cn(sources, size())" />

<!-- A function reference. -->
<ui-button class="px-2" (class)="cn" />
```

If the handler returns a function, as the last two forms do, Angular calls that function with the
same sources. Angular applies the final value the way it applies a `[class]` binding: a string, an
array of class names, a `Set`, or an object map. Templates can't see imports, so the component
exposes `cn` as a field.

A component can resolve its own host element, so its consumers don't need `(class)`:

```ts
import {cn} from 'cn';

@Component({
  selector: 'ui-button',
  host: {class: 'px-4 py-2', '(class)': 'cn($event)'},
  template: '<ng-content />',
})
export class UiButton {
  protected readonly cn = cn;
}
```

`@HostListener('class', ['$event'])` on a method declares the same host resolver. A class keeps one
host listener per event name, so a `@HostListener('class')` replaces a `host: {'(class)': …}` on the
same class.

On `<ng-container>` and `<ng-template>`, `(class)` stays a plain listener, because there's no
element to style.

### The payload

```ts
export type ClassSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
] & {
  /**
   * Runs the resolver that this one replaced on the element, with the same sources, and returns the
   * class names it resolved. Without such a resolver, returns the class names the element would
   * have without resolution. With a directive type, runs that directive's resolver instead.
   */
  inherited(directive?: Type<unknown>): string[];
};
```

Angular builds the payload with these rules:

1. It always has three slots, ordered from the lowest to the highest priority. A missing source is an
   empty array.
1. The component slot includes the component's host directives. Angular matches them before the
   component, so they already rank below it.
1. All other directives share one slot, in the order Angular matched them.
1. Within a slot, static classes come first, then `[class]`, then `[class.x]`. A source's bound
   classes therefore beat its own static classes.
1. Each class name appears at most once, under the source and at the position of the
   highest-priority binding that has an opinion about it. A binding set to `false`, `null`, `''`, or
   `0` removes the class from every lower-priority source. `undefined` defers. These are Angular's
   existing rules for one class name.

`cn($event)` works without spreading, because `clsx` and `tailwind-merge` flatten nested arrays at
any depth. `inherited` is a method, not an array element, so `cn` and spreading ignore it.

### When the handler runs

Angular calls the handler on every refresh of the view that declares the element, after host
bindings and before child components. It then applies the difference between the classes it applied
last time and the new result. Classes that something else added, for example `Renderer2.addClass`,
stay on the element.

`(class)` uses event-binding syntax, but Angular calls the handler while it renders the view, like a
template expression:

- Signals that the handler reads are tracked, so a change to them schedules a refresh.
- Writing a signal in the handler throws `NG0600`.
- Writing a plain field that the element's own bindings read leaves the element out of date. In an
  `OnPush` view, the default, nothing reports it. The dev-mode check reports it as `NG0100` in an
  `Eager` view, and `provideCheckNoChangesConfig({exhaustive: true})` reports it in any view.

Write the handler as a function of its sources and the state it reads.

## Edge cases

### Directive outputs named `class`

A template `(class)` binding next to a directive output named `class` listens to that output, as it
did before this feature. Angular logs `NG0319` in dev mode, and full AOT compilation reports
`NG8119`. A host-level `(class)` always resolves: a component's or directive's own resolver isn't
turned off by an unrelated directive on the same element.

Starting point:

```ts
@Directive({selector: '[emitter]'})
export class Emitter {
  readonly changed = output<string>({alias: 'class'});
}

@Component({
  selector: 'ui-card',
  host: {class: 'p-4', '(class)': 'cn($event)'},
  template: '<ng-content />',
})
export class UiCard {
  protected readonly cn = cn;
}
```

```html
<ui-card emitter class="p-2" />
```

Before this decision, the output turned off UiCard's resolver:

```text
classes: "p-4 p-2". Nothing resolves.
cn runs on every emit of `changed` and receives a string, although its type says ClassSources.
NG0319 is logged for UiCard's host binding.
```

With it:

```text
classes: "p-2". UiCard's resolver works as usual.
Only a template (class) on <ui-card> would listen to `changed`.
```

The host's `$event: ClassSources` type stays true. A host `(class)` never listened to another
directive's output on purpose.

An upstream bug drops the template's `[class]` binding on these elements, with or without a
`(class)` binding. Angular marks an element as having a `class` input when a directive declares an
output named `class`, so the binding's value goes to directive inputs that don't exist:

```html
<ui-card emitter [class]="'shadow-lg'" />
```

```text
classes: "p-4". `shadow-lg` is dropped, and UiCard's resolver never sees it.
```

This proposal doesn't change that. The fix belongs in a separate upstream pull request, and the
feature already asks authors to rename such outputs through `NG0319` and `NG8119`.

### `[(class)]`

`[(class)]="value"` is shorthand for `[class]="value" (classChange)="value = $event"`. It never
touches `(class)`, so the two can coexist. Don't reserve `[(class)]`, and don't name the resolver
`(classChange)`. That name already belongs to `model({alias: 'class'})`. It would also turn
`[(class)]="value"` into a resolver that writes its own source: the assignment stores the
`ClassSources` array in `value`, which feeds `[class]`. As
[When the handler runs](#when-the-handler-runs) describes, that write throws `NG0600` for a signal
and leaves the element out of date for a plain field.

### Static classes merged ahead of time

Each source reports its static classes in its own slot. Angular computes them once per template, in
the first creation pass, from each directive's `hostAttrs` and the element's attributes, so they
cost nothing per change detection. The merged static string is still written when the element is
created, so directive constructors see the same `classList` as today.

### Several resolvers on one element

Four parties can declare a resolver for the same element:

| Declared by                        | How                                                           | Controlled by                                   |
| ---------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| The template that uses the element | `<ui-button (class)="…">`                                     | The consumer                                    |
| The component                      | `host: {'(class)': …}` or `@HostListener('class')`            | The component author                            |
| A host directive                   | `hostDirectives: [Dir]`, where `Dir` declares a host resolver | The component author                            |
| An attribute directive             | Matched in the consumer's template                            | Its author; the consumer applies and imports it |

#### Measured behavior before delegation

The specs under `with several resolvers on one element` in
[`class_resolver_spec.ts`](packages/core/test/acceptance/class_resolver/class_resolver_spec.ts)
measure this behavior through the JIT compiler. Each row names its evidence.

| Behavior                                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exactly one resolver runs. Each registration replaces the previous one in the element's slot. The replaced resolvers never run, and any classes they would add are dropped without a warning. Their bindings still reach `$event`.                                                                                                                                         | Spec: "runs only the template resolver".                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Angular registers resolvers in this order: the component's host directives, the component, attribute directives in match order, then the template. So the template wins, then the attribute directive matched last, then the component, then its host directives.                                                                                                          | Specs: "runs only the resolver of the directive matched last" and "runs the component's @HostListener resolver, not its host-object or host directive's".                                                                                                                                                                                                                                                                                                       |
| Match order follows the order of the consuming component's `imports`. Swapping two imports changes which directive's resolver runs.                                                                                                                                                                                                                                        | Spec: "matches directives in the order of the imports".                                                                                                                                                                                                                                                                                                                                                                                                         |
| A class keeps one host listener per event name, so `@HostListener('class')` replaces `host: {'(class)': …}` on the same class.                                                                                                                                                                                                                                             | Code: both `extractHostBindings` functions, in `packages/compiler/src/jit_compiler_facade.ts` and `packages/compiler-cli/src/ngtsc/annotations/directive/src/shared.ts`, key listeners by event name. The JIT spec above agrees. For AOT, the compliance case `class_resolver_host_listener_and_host` emits a single `ɵɵclassResolver`, and its partial declaration keeps only `listeners: {"class": "fromDecorator($event)"}`.                                 |
| If any directive on the element has an output named `class`, nothing resolves. Every registration, host-level ones included, becomes a listener on that output. All of them run on each emission, in registration order, and receive the output's value. `NG0319` is logged once per registration. Host-level handlers are still type-checked with `$event: ClassSources`. | Spec: "turns every resolver into a listener when a directive has an output named class", which covers the component's and the template's registrations. Code read: other directives' registrations take the same path, because `classResolverFirstCreatePass` leaves `tNode.classResolver` unset and every `ɵɵclassResolver` call then falls back to `listenerInternal`. The host type-check block types `$event` without looking at other directives' outputs. |

So it's neither a race nor a queue. Resolvers never compete to apply classes, and none of them sees
another's result: the last registration replaces the others when Angular creates the element. The
exception was the `class` output fallback, where every registration fanned out as a listener. The
decisions in this section and in [Directive outputs named `class`](#directive-outputs-named-class)
change the first and last rows. [Combining several resolvers](#combining-several-resolvers)
compares the options.

#### Delegation with `$event.inherited()`

The highest-priority resolver still runs alone, but it can run the resolver it replaced:

- `inherited()` runs the resolver that this one replaced, with the same sources. The lowest
  resolver gets the classes the element would have without any resolution.
- `inherited(Tooltip)` runs the resolver of one specific directive on the element, which must rank
  below the caller. This lets a consumer choose between host-level resolvers, a choice that only
  `imports` order made before. It reports `NG0321` if that directive declares no resolver below the
  caller. Templates can't reference classes directly, so the component exposes the directive type
  as a field, as it does for `cn`.
- Angular normalizes the result to the class names it would apply. It calls a returned function
  with the sources, splits strings, and reads a `Set` or an object map. `cn($event.inherited())`
  then works whatever the replaced resolver returns. Without normalization, `clsx` would drop a
  `Set`.
- The method isn't named `next`, because an array with a `next` method looks like an iterator to
  code that detects iterators by duck typing.
- It costs nothing when unused: Angular builds a lower resolver's payload only when `inherited()`
  asks for it.

Starting point: a library component adds a state class in its own resolver.

```ts
@Component({
  selector: 'ui-button',
  host: {'(class)': 'resolve($event)'},
  template: '<ng-content />',
})
export class UiButton {
  readonly disabled = input(false);

  protected resolve(sources: ClassSources) {
    return cn(sources, this.disabled() && 'bg-muted');
  }
}
```

Before: a consumer's `(class)` replaces UiButton's resolver, and `bg-muted` is lost.

```html
<ui-button [disabled]="true" (class)="cn($event, 'shadow-lg')" />
```

After: the consumer can extend it instead. The result is UiButton's classes, including `bg-muted`,
then `shadow-lg`.

```html
<ui-button [disabled]="true" (class)="cn($event.inherited(), 'shadow-lg')" />
```

#### Warning when a resolver never runs

In dev mode, Angular logs `NG0320` once per element when a directive's or component's resolver never
runs because another directive's resolver replaced it without calling `inherited()`. Two cases stay
silent, because their authors replace the resolver on purpose:

- A template that replaces a resolver: the consumer wrote that binding.
- A component that replaces the resolver of one of its own host directives: the component author
  chose that host directive.

  ```ts
  @Directive({host: {'(class)': 'cn($event)'}})
  class Elevated {}

  @Component({selector: 'ui-card', hostDirectives: [Elevated], host: {'(class)': 'cn($event)'}})
  class UiCard {}
  ```

  `<ui-card />` runs `UiCard`'s resolver and logs nothing about `Elevated`.

Starting point: `<ui-button tooltip ring />`, where `UiButton` from the previous section,
`Tooltip`, and `Ring` declare host resolvers, imported in that order.

Before: Ring's resolver runs, and the resolvers of UiButton and Tooltip silently never do.

```text
(no output)
```

After:

```text
NG0320: The class resolver of UiButton on <ui-button> never runs, because the class resolver of Ring replaces it without calling $event.inherited().
NG0320: The class resolver of Tooltip on <ui-button> never runs, because the class resolver of Ring replaces it without calling $event.inherited().
```

#### Consumer controls

- At the call site, `$event.inherited()` and `$event.inherited(Directive)` decide whether a
  resolver replaces or extends the ones below it, and which one it extends.
- In userland, a consumer can import a marker directive, such as one with the selector `[cn]` and a
  host resolver, and add its attribute to each element that should resolve. It ranks as a directive,
  so it replaces the component's resolver unless it calls `inherited()`.
- App-wide defaults aren't part of this proposal. The [Request for comments](#request-for-comments)
  covers them.

Two other controls were rejected:

- An app-level policy for how several resolvers combine. The same template would behave differently
  per app, so libraries couldn't rely on either behavior.
- A template-wide import that makes every element of one template resolve. `imports` accepts only
  components, directives, pipes, and NgModules. A directive can't select elements by their classes
  either: in a temporary JIT probe, a `[class]` selector matched no element whose classes came from a
  static `class`, `[class]`, or `[class.x]`. (A `(class)` binding itself lists `class` among the
  element's binding names, so it might make the element match.)

### Libraries compiled in partial mode

A library compiled in partial mode publishes its templates and host metadata as source, and the
application's linker compiles them. A linker from a version without this feature compiles `(class)`
as a plain listener, so the library's classes silently stop resolving. Templates with blocks already
raise `minVersion` to `17.0.0` for the same reason.

Starting point: a library component with `template: '<div (class)="cn($event)"></div>'`, compiled in
partial mode.

Before: an older linker accepts the declaration and compiles `(class)` as a listener.

```js
static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", ..., template: `<div (class)="cn($event)"></div>` });
```

After: an older linker rejects the declaration.

```js
static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "22.3.0", ..., template: `<div (class)="cn($event)"></div>` });
```

The same rule applies to `ɵɵngDeclareDirective` and `ɵɵngDeclareComponent` when the host uses
`(class)`. `22.3.0` matches the `@experimental 22.3` tag on `ClassSources`.

### Other edge cases

The design doc's [Other edge cases](docs/class-resolver.md#other-edge-cases) table covers classes
added outside bindings, the order inside one `[class]` value, nested return values, an input aliased
to `class`, embedded views, the `checkNoChanges` pass, hydration, and performance.

## Alternatives considered

### Payload shape

Each row passes the same element through `cn`. The component's host has
`'[class]': 'variants()'`, which returns `inline-flex h-9 px-4 bg-primary`, and the consumer writes
`class="px-2 w-full"`. Results come from running `clsx@2.1.1` and `tailwind-merge@3.7.0`.

| Shape                                                                               | Payload                                                | `cn` result                                 | Verdict                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{static, dynamic}` from the preliminary design, with `static` as one merged string | `['px-2 w-full', [variants, [], []]]`                  | `w-full inline-flex h-9 px-4 bg-primary`    | Rejected. Bound classes always win, as the next section explains. The merged string loses each class's source. `static` is a reserved word, and template arrow functions can't destructure. |
| Static, then bound, each per source: `[[cS, dS, tS], [cB, dB, tB]]`                 | `[[[], [], ['px-2', 'w-full']], [variants, [], []]]`   | `w-full inline-flex h-9 px-4 bg-primary`    | Rejected for the same reason.                                                                                                                                                               |
| An object with named keys                                                           | `{component: […], template: […]}`                      | The key names, such as `component template` | Rejected. `clsx` reads an object's keys as class names.                                                                                                                                     |
| A static and a bound list inside each source: `[[cS, cB], [dS, dB], [tS, tB]]`      | `[[[], variants], [[], []], [['px-2', 'w-full'], []]]` | `inline-flex h-9 bg-primary px-2 w-full`    | Deferred. Same result as the chosen shape, and a custom resolver could regroup it, at the cost of a deeper type.                                                                            |
| Chosen: `[component, directives, template]`                                         | `[variants, [], ['px-2', 'w-full']]`                   | `inline-flex h-9 bg-primary px-2 w-full`    | Chosen.                                                                                                                                                                                     |

### Should bound classes always win over static ones?

No. The payload orders classes by source: the template over directives, and directives over the
component. Within one source, bound classes already win over static ones. The alternative orders
them by kind: every static class first, then every bound class, whatever its source.

The case that decides it is a shadcn-style button with computed variants and a static override:

```ts
@Component({
  selector: 'ui-button',
  host: {'[class]': 'variants()', '(class)': 'cn($event)'},
  template: '<ng-content />',
})
export class UiButton {
  readonly size = input<'sm' | 'md'>('md');
  protected readonly cn = cn;
  protected readonly variants = computed(() => buttonVariants({size: this.size()}));
}
```

```html
<ui-button class="px-2 w-full">Save</ui-button>
```

Starting state: `variants()` returns `inline-flex h-9 px-4 bg-primary`, which are bound classes from
the component. `px-2 w-full` are static classes from the template.

Ordered by source, as proposed:

```ts
$event = [['inline-flex', 'h-9', 'px-4', 'bg-primary'], [], ['px-2', 'w-full']];
cn($event); // 'inline-flex h-9 bg-primary px-2 w-full'
```

Ordered by kind:

```ts
$event = [
  [[], [], ['px-2', 'w-full']],
  [['inline-flex', 'h-9', 'px-4', 'bg-primary'], [], []],
];
cn($event); // 'w-full inline-flex h-9 px-4 bg-primary'
```

The consumer's `px-2` is gone, and the consumer would have to write `[class.px-2]="true"` to get it
back. shadcn always puts the consumer's `className` last, however the component computed its own
classes. Component variants are almost always computed and consumer overrides almost always static,
so ordering by kind breaks the case this feature exists for.

Two more reasons favor ordering by source:

- It matches Angular's own styling. Angular already orders class bindings by source: see the
  priority order in
  [`style_binding_list.ts`](packages/core/src/render3/styling/style_binding_list.ts), and the
  residual-class example in
  [`interfaces/styling.ts`](packages/core/src/render3/interfaces/styling.ts), where a template's
  static class outranks a directive's binding.
- One rule covers both kinds of conflict. Before `cn` runs, Angular settles `foo` against `foo` with
  its existing rules. `cn` then settles `px-2` against `px-4` by order. Ordering by source keeps the
  two consistent. Ordering by kind leaves two bad choices:
  - The two kinds of conflict go opposite ways. A template's static `opacity-100` would beat a
    directive's `[class.opacity-100]="false"` but lose to its `[class.opacity-50]="true"`.
  - Or the rule for one class name changes too, and adding `(class)` changes which plain classes
    Angular renders.

The case that cuts the other way is a state class from a lower source:

```ts
@Component({
  selector: 'ui-button',
  host: {class: 'bg-primary', '[class.bg-muted]': 'disabled()', '(class)': 'cn($event)'},
  template: '<ng-content />',
})
export class UiButton {
  readonly disabled = input(false);
  protected readonly cn = cn;
}
```

With `disabled` set to `true`:

| Order  | Consumer writes             | Result                                  |
| ------ | --------------------------- | --------------------------------------- |
| Source | `class="bg-red-600"`        | `bg-red-600`: the disabled look is lost |
| Source | `[class.bg-red-600]="true"` | `bg-red-600`                            |
| Kind   | `class="bg-red-600"`        | `bg-muted`                              |
| Kind   | `[class.bg-red-600]="true"` | `bg-red-600`                            |

Ordering by kind doesn't protect the state either. It only makes the result depend on whether the
consumer wrote `class` or `[class.…]`. Angular already makes the same call for one class name. With
ordering by source, the component author has two explicit fixes.

A Tailwind state variant, which `tailwind-merge` keeps next to the override:

```ts
host: {
  class: 'bg-primary data-disabled:bg-muted',
  '[attr.data-disabled]': 'disabled() || null',
  '(class)': 'cn($event)',
}
// 'data-disabled:bg-muted bg-red-600'. The variant wins in CSS while data-disabled is set.
```

The state class after all sources:

```ts
host: {class: 'bg-primary', '(class)': 'cn($event, disabled() && "bg-muted")'}
// 'bg-muted' while disabled
```

With [delegation](#delegation-with-eventinherited), a consumer who adds their own `(class)` can keep
such a state class by calling `$event.inherited()`.

### Combining several resolvers

| Option              | Behavior                                                                                             | Strengths                                                                     | Why it lost, or why it won                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Replace             | The highest-priority registration runs.                                                              | One call per refresh. A consumer override is one binding.                     | Lost: silent; ties between directives depend on `imports` order; logic in a replaced resolver, such as a state class it adds, is lost.                                               |
| Race                | Every resolver runs and applies its own result.                                                      | None.                                                                         | Lost: each diff removes the classes that the others applied, so the result depends on run order.                                                                                     |
| Queue               | Every resolver runs in priority order, and each receives the previous result.                        | Every resolver's logic applies.                                               | Lost: a resolver reads the whole element, so the previous result has no slot in `ClassSources`, and every resolver runs on every refresh, even when the last one ignores the others. |
| Exclusive           | More than one resolver on an element is an error.                                                    | Unambiguous.                                                                  | Lost: a consumer couldn't override a library component.                                                                                                                              |
| Delegation (chosen) | The highest-priority resolver runs, and it can call `$event.inherited()` to run the one it replaced. | Explicit. Costs nothing when unused. Authors who delegate get queue behavior. | Won. Its costs are a new method on the payload and one winner by default.                                                                                                            |

### Binding syntax and placement

| Design                                                                                           | Who opts in                   | Trade-off                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Template `(class)` and host `(class)` (proposed)                                                 | Consumer and component author | One syntax and one mechanism for both. Event syntax for a function that runs while rendering.                                      |
| `[class]="fn"`: give function values a meaning                                                   | Consumer                      | No new syntax, but `[class]` would have to stop being a source on that element.                                                    |
| App-wide default resolvers                                                                       | App                           | No template changes, but every element changes, including third-party components. Open for comments as direction 2 below.          |
| A component option, such as `classResolver: cn`                                                  | Component author              | Once per component, but a static function without instance state. Host `(class)` covers it.                                        |
| A different name, such as `(class.resolve)`                                                      | Consumer                      | Avoids colliding with `class` outputs, but loses the short form, and `(class.x)` reads like a modifier, as `(keydown.enter)` does. |
| Userland: `input({alias: 'class'})` plus a host `[class]` computed with `cn`, as spartan-ng does | Component author              | Works today, but the template's `[class.x]` and other directives' classes are invisible to it.                                     |

## Deferred

| Item                                                                            | Reason                                                                                 |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A `[static, bound]` split inside each source                                    | No case needs it yet; it only deepens the type. See [Payload shape](#payload-shape).   |
| App-wide default resolvers                                                      | Open for comments as direction 2 of the [Request for comments](#request-for-comments). |
| Resolution for attributes other than `class`, including a `(style)` counterpart | Open for comments as direction 1 of the [Request for comments](#request-for-comments). |
| `NG8119` for an output that `hostDirectives` exposes under the alias `class`    | The extended check doesn't cover it yet; the runtime `NG0319` warning does.            |
| Checking the type of the handler's return value                                 | `[class]` accepts several value types; the prototype applies whatever it gets.         |
| Language service support for `$event` in `(class)`                              | Not needed to evaluate the design.                                                     |
| Root components with a host `(class)`                                           | Not covered by tests yet.                                                              |

## Compiler backends

- TypeScript (ngtsc and JIT): full support. The prototype changes the template pipeline, type
  checking, and two extended diagnostics in `@angular/compiler` and `@angular/compiler-cli`.
- Rust preprocessor (`ngp`): no changes, because it doesn't accept external contributions. It reuses
  `@angular/compiler` for template code generation and type checking, so `(class)` compiles and
  type-checks the same way there. The type-checking specs pass on the `ngtsc_ngp` target, and the
  compliance cases pass on its `full_ngp`, `codegen_ngp`, and `declaration-only_ngp` targets and in
  the preprocessor's own compliance suite. It doesn't run ngtsc's extended diagnostics (it implements
  two of them itself), so `NG8119` and the `NG8111` exemption don't apply on it. The runtime warnings
  do.

## Prototype

- Design notes, the worked example, and the test inventory:
  [`docs/class-resolver.md`](docs/class-resolver.md).
- Runtime: [`class_resolver.ts`](packages/core/src/render3/instructions/class_resolver.ts).
- Compiler: the `(class)` flag in
  [`ingest.ts`](packages/compiler/src/template/pipeline/src/ingest.ts) and the `ɵɵclassResolver`
  emit in [`reify.ts`](packages/compiler/src/template/pipeline/src/phases/reify.ts).
- Runtime specs, including the measurements above:

  ```bash
  pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver
  ```

- Compliance cases for the generated code, in
  [`r3_view_compiler_class_resolver`](packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_class_resolver):
  `(class)` on an element and on a component, an arrow function, `<ng-container>`, host
  `(class)`, and `@HostListener('class')` next to `host: {'(class)': …}`. They run in full,
  linked, declaration-only, and instruction compilation, and the partial golden is checked in:

  ```bash
  pnpm bazel test --test_arg=--filter=r3_view_compiler_class_resolver //packages/compiler-cli/test/compliance/full:full //packages/compiler-cli/test/compliance/linked:linked //packages/compiler-cli/test/compliance/declaration-only:declaration-only //packages/compiler-cli/test/compliance/codegen:codegen
  ```

## Request for comments

The prototype treats `class` as a special case. Two directions would go further. Feedback on either
is welcome, and they can combine.

### Direction 1: resolve any attribute

`class` is one case of a broader problem: several sources can set the same attribute on one element,
and Angular has no way to combine them. Static attributes already follow a priority order, because
the template's attributes merge last and overwrite the directives'. Bound attributes have none: each
`[attr.x]` binding writes when its own value changes, so the binding that changed last wins. (Both
rules come from reading the runtime, not from a measurement.)

Token-list attributes suffer most. A form field directive, a tooltip directive, and the template can
each want an id in `aria-describedby`, and a binding from one overwrites the others. Angular CDK's
`AriaDescriber` works around this imperatively: its `addAriaReferencedId` helper reads the ids
already in the attribute and appends its own with `setAttribute`.

This direction generalizes the binding to any attribute, with `(attr.name)` as the syntax, matching
the `[attr.name]` property binding. `(class)` becomes shorthand for `(attr.class)`, and `(style)`
for `(attr.style)`.

```html
<input
  formField
  tooltip="Shown on hover"
  [attr.aria-describedby]="errorId()"
  (attr.aria-describedby)="joinIds($event)"
/>
```

```ts
export type AttributeSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
] & {
  inherited(directive?: Type<unknown>): string | null;
};
```

Each slot lists the values that source sets for the attribute, static and bound. The handler returns
the attribute's value, or `null` to remove it. `class` and `style` keep their token-aware payloads,
because their bindings set single tokens, as in `[class.x]` and `[style.x]`.

Problems to solve:

- Bound attributes need a defined priority, the same one that static attributes follow.
- Angular keeps no record of which source set an attribute. Elements that declare a resolver would
  need per-source bookkeeping, as the prototype adds for classes.
- Property bindings that the browser reflects to an attribute, such as `[id]`, might or might not
  count as sources.
- `(attr.name)` means nothing today, but it would change the meaning of a custom event literally
  named `attr.name`.
- Type checking needs a payload and a return type for each attribute.
- Hydration needs the same seeding rules as `class`.

### Direction 2: default resolvers configured at build time

Instead of a `(class)` binding on every element or in every component's host, an app that wants
React-style class merging everywhere configures default resolvers once, per attribute. The
configuration is a file, like the `polyfills.ts` file, linked from `angular.json` or from the
compiler options:

```ts
// src/resolvers.ts
import {cn} from './cn';

export default {
  class: cn,
  'aria-describedby': (sources) => [...new Set(sources.flat())].join(' ') || null,
};
```

```json
// angular.json, in projects.app.architect.build.options
"resolvers": "src/resolvers.ts"
```

```json
// tsconfig.app.json
{
  "angularCompilerOptions": {"defaultResolvers": "src/resolvers.ts"}
}
```

The compiler imports the file into each compiled template and adds a resolver at the lowest priority
for every element where that attribute has a source, as if the element declared it. An explicit
`(class)` still runs first and can extend the default with `$event.inherited()`. Direction 2 needs
direction 1 for attributes other than `class`.

The compiler, not the runtime, decides where resolvers go. In full AOT compilation it knows which
directives match each element, so it could limit them to elements that receive the attribute from
more than one source. That would skip elements whose conflicts are all inside one source.

Problems to solve:

- A library compiled in partial mode doesn't know the app's defaults. The app's linker would apply
  them, so a library component renders differently per app. That's the point, but it changes what
  library authors can test.
- JIT, partial, and local compilation don't know which directives match, so they would add the
  resolver to every element with the attribute.
- Every tool that compiles templates needs the same configuration: the CLI builders, TestBed, the
  language service, and server rendering. A server and client that disagree break hydration.
- Every resolved element costs a call per refresh. Pure default resolvers would let Angular skip the
  call when the sources don't change.

Dependency injection configuration is the alternative, for example a provider in the application
config that maps attributes to resolvers. It's likely more ergonomic, and it could scope defaults to
a subtree. It moves the decision to runtime, though: templates are shared across injectors, so
Angular would read the configuration once per template, and every element with the attribute would
carry a resolver. That's a separate experiment.

### Questions for commenters

1. Is `class` special enough, because of utility CSS, to ship on its own, or should resolution cover
   any attribute from the start?
1. Which attributes besides `class` and `style` get conflicting values from several sources in your
   apps or libraries?
1. For app-wide defaults, do you prefer a build-time configuration file or dependency injection?
1. Does `$event.inherited()` cover how your libraries compose classes?
