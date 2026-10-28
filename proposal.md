# Proposal: resolve an element's classes with a `(class)` binding

Status: prototype on the `feat/class-resolver` branch of the Flarette/angular fork. Not pushed. The
decisions dated 2026-10-17 and 2026-10-26 are implemented on that branch, and
[`docs/class-resolver.md`](docs/class-resolver.md) describes the feature as built. The next design,
[the `resolve()` class event](#next-the-resolve-class-event), is decided and gets its own
implementation round.

## Summary

A `(class)` binding lets a template, or a component's host metadata, decide the final classes of an
element. Angular collects the classes that the component, the other directives, and the template
apply to the element. It groups them by source in priority order and passes them to the handler as
`$event`. The handler's return value becomes the element's classes.

```html
<ui-button class="px-2" (class)="cn($event)">Save</ui-button>
```

The next design keeps the sources and the priorities, and moves the result from the handler's
return value to `$event.resolve()`, with a callback shorthand and an app-wide resolver. See
[Next: the `resolve()` class event](#next-the-resolve-class-event).

The main use case is Tailwind CSS with the `cn` helper from shadcn (`clsx` plus `tailwind-merge`).
Conflicting utilities such as `px-2` and `px-4` then resolve by which source set them, not by the
order of rules in the stylesheet.

## Decisions

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-17 | `$event` is `ClassSources`: three arrays of class names, `[component, directives, template]`. Directives share one slot. There's no `static` field and no split between static and bound classes. Reconfirmed after [Should bound classes always win over static ones?](#should-bound-classes-always-win-over-static-ones).                                                                                                                                                                   |
| 2026-10-17 | A component can resolve its own host element's classes with `host: {'(class)': …}` or `@HostListener('class')`. A template `(class)` receives its result.                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-17 | The handler runs on every refresh of the view that declares the element.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-17 | Hydration starts the first resolution from the element's current classes when the element has no static classes.                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-17 | Every resolver on an element runs, from the lowest to the highest priority. Each one receives the previous result folded back into `ClassSources` by origin, so `cn($event)` keeps what lower resolvers added or removed. See [Folding several resolvers](#folding-several-resolvers).                                                                                                                                                                                                        |
| 2026-10-17 | `$event.inherited()`, `$event.inherited(Directive)`, and the `NG0320` warning are withdrawn in favor of the fold. A directive argument would depend on match order, which consumers can't see. A consumer who wants to drop a class that a lower resolver added filters `$event`. See [Combining several resolvers](#combining-several-resolvers).                                                                                                                                            |
| 2026-10-17 | Host-level `(class)` always resolves. Only a template `(class)` next to a directive output named `class` falls back to a listener, with the dev-mode warning `NG0319` and the extended diagnostic `NG8119`. See [Directive outputs named `class`](#directive-outputs-named-class).                                                                                                                                                                                                            |
| 2026-10-17 | No app-wide controls in core for now. App-wide default resolvers are open for comments; see [Request for comments](#request-for-comments).                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-17 | A partial declaration whose template or host uses `(class)` declares `minVersion: "22.3.0"`. See [Libraries compiled in partial mode](#libraries-compiled-in-partial-mode).                                                                                                                                                                                                                                                                                                                   |
| 2026-10-17 | The Rust compiler preprocessor (`packages/compiler-cli/preprocessor`) doesn't change, because it doesn't accept external contributions.                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-17 | Compliance (golden) tests target the TypeScript compiler.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-26 | A directive's host `(class)` on `<ng-container>` or `<ng-template>` does nothing, like its other host bindings there. A template `(class)` on them stays a listener. See [`<ng-container>` and `<ng-template>`](#ng-container-and-ng-template).                                                                                                                                                                                                                                               |
| 2026-10-26 | The compiler classifies `(class)` as the runtime runs it. A host `(class)` is type-checked as a resolver even next to an output named `class`, and `<ng-container>` counts as a container in every namespace, in type checking and in `NG8119`.                                                                                                                                                                                                                                               |
| 2026-10-26 | A template `(class)` next to an output named `class` keeps listening to it, consistent with how a directive input takes a property binding's name. No new warning for `(class)` on containers, because upstream diagnoses no class binding there either. See [Directive outputs named `class`](#directive-outputs-named-class).                                                                                                                                                               |
| 2026-10-26 | The next design replaces the return value with `$event.resolve()`, adds the callback shorthand `(class)="(cn) => cn('x')"` and `provideClassResolver()`, and reverses the 2026-10-17 decision against app-wide controls. It gets its own implementation round. See [Next: the `resolve()` class event](#next-the-resolve-class-event).                                                                                                                                                        |
| 2026-10-28 | In the next design, `(class)` always resolves, also next to a directive output named `class`. The resolver shadows the output, the way an output shadows a native event, and a template can't listen to that output. An extended diagnostic warns about it, and the runtime warning `NG0319` goes. See [Collisions and other names](#collisions-and-other-names).                                                                                                                             |
| 2026-10-28 | In the next design, `(class)` and `(attr.class)` on `<ng-container>` and `<ng-template>` get their own diagnostics, in case a generic check for bindings that do nothing there never lands. The compile-time check sits with the existing per-element checks, so it reports on `<ng-template>` once a separate fix makes type checking visit its bindings. The generic check's error codes take precedence where they collide. See [Collisions and other names](#collisions-and-other-names). |
| 2026-10-28 | `@HostListener('class')` is a compile error that points to `@HostListener('attr.class', ['$event'])`. A shorthand for the decorator is left to the maintainers.                                                                                                                                                                                                                                                                                                                               |
| 2026-10-28 | The extras and `resolve()` read a value the way `[class]` does in production, so a top-level `false` adds nothing. See [The full form](#the-full-form-attrclass).                                                                                                                                                                                                                                                                                                                             |
| 2026-10-28 | Other `(attr.*)` names stay ordinary event bindings. Reserving the namespace is left to the maintainers, and the code marks where the reservation would go.                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-28 | The resolver contract is fixed: `provideClassResolver` takes `(...classes: string[]) => string`, and Angular normalizes the sources and the extras to strings first. Templates are type-checked against one extras type, whichever resolver the app provides. No declaration merging. See [The resolver](#the-resolver-provideclassresolver).                                                                                                                                                 |
| 2026-10-28 | `cn(...extras)` and `[class]` both stay allowed on an element with a resolver. They differ as [`[class]` next to extras](#class-next-to-extras) shows.                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-28 | A second `(class)` or `(attr.class)` on one template element is a compile error.                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-28 | The next design's runtime is tree-shakable: an app without a `(class)` binding doesn't carry it.                                                                                                                                                                                                                                                                                                                                                                                              |

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

On `<ng-container>` and `<ng-template>`, which have no classes, a template `(class)` stays a plain
listener, and a directive's host `(class)` does nothing. See
[`<ng-container>` and `<ng-template>`](#ng-container-and-ng-template).

### The payload

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
   component, so they already rank below it.
1. All other directives share one slot, in the order Angular matched them.
1. Within a slot, static classes come first, then `[class]`, then `[class.x]`. A source's bound
   classes therefore beat its own static classes.
1. Each class name appears at most once, under the source and at the position of the
   highest-priority binding that has an opinion about it. A binding set to `false`, `null`, `''`, or
   `0` removes the class from every lower-priority source. `undefined` defers. These are Angular's
   existing rules for one class name.

`cn($event)` works without spreading, because `clsx` and `tailwind-merge` flatten nested arrays at
any depth. A plain array literal is a valid `ClassSources`, so a unit test can call a resolver
method directly with `[['px-4'], [], ['px-2']]`.

When several resolvers apply to the element, every one after the lowest receives the previous
result in this same shape. See [Folding several resolvers](#folding-several-resolvers).

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
turned off by an unrelated directive on the same element. The next design reverses this rule, so
`(class)` always resolves. See [Collisions and other names](#collisions-and-other-names).

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
feature already asks authors to rename such outputs through `NG0319` and `NG8119`. The element's
static `class` and its `[class.x]` bindings aren't affected: measured on 2026-10-17,
`<div dir class="s" [class]="'b'" [class.p]="true">` next to an output named `class` renders `p s`.

Letting the output take the binding follows Angular's existing collision rules, measured on
2026-10-17 without `(class)`:

| Upstream case                                            | Result                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `[title]` next to a directive input named `title`        | The input takes the value, and the DOM property isn't set. No diagnostic.                                             |
| `class="s" [class]="'b'"` next to an input named `class` | The input receives `s b`, and the DOM keeps only `s`. No diagnostic.                                                  |
| `(click)` next to a directive output named `click`       | Both fire: the handler gets the `MouseEvent` and the emitted value. `$event` is typed as the output's. No diagnostic. |

A directive takes a binding's name without an error, so `(class)` does too, and it adds the
`NG0319` and `NG8119` warnings that upstream lacks. Firing both, as `(click)` does, would make
`$event` either `ClassSources` or the output's value, and would ignore the handler's result on each
emission.

`NG8111` still exempts every `(class)` binding, including one that listens to an output, where a
function reference never runs. The [next design](#next-the-resolve-class-event) narrows the
exemption to the shorthand that resolves, where type checking backs it, so the narrower rule isn't
built for this prototype.

### `<ng-container>` and `<ng-template>`

These elements have no classes. A template `(class)` on them is an ordinary event binding, which
listens to a directive output named `class`. A directive's host `(class)` does nothing on them.

The host rule follows upstream, where a directive's host bindings do nothing on a container:
`host: {class: 'st', '[class.x]': 'true', '(click)': 'h()'}` on `<ng-container>` or `<ng-template>`
applies no class, never calls `h`, and logs nothing (measured on 2026-10-17). As a listener, a host
`(class)` was wrong in a way the compiler can't see: type checking reads host bindings without knowing
the tag, so `$event` is `ClassSources`, but on a container the handler received a sibling's output:

```ts
@Directive({selector: '[tint]', host: {'(class)': 'resolve($event)'}})
export class Tint {
  resolve(sources: ClassSources) {
    return sources.flat();
  }
}
```

```html
<ng-container classEmitter tint />
```

```text
Before: classEmitter emits 'sent', resolve('sent') runs, and ErrorHandler receives
        TypeError: s.flat is not a function.
Now:    resolve never runs. A template (class) on the same container still receives 'sent'.
```

Upstream also accepts class bindings and `(click)` on containers without a diagnostic, so a `(class)`
on a container gets no new warning here. An error for every binding that does nothing on a
container is an upstream-wide question, outside this proposal. The next design reports `(class)`
and `(attr.class)` there itself. See [Collisions and other names](#collisions-and-other-names).

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

#### Measured behavior before the fold

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

#### Folding several resolvers

Every resolver on the element runs on each refresh, from the lowest to the highest priority: the
component's host directives, the component, attribute directives in match order, then the template.

- The lowest resolver receives the sources as Angular collected them.
- Each later resolver receives the previous result folded back into `ClassSources`:
  - A class keeps the source it had in the previous payload.
  - A class that the previous resolver added goes to that resolver's own source: the component's
    for the component and its host directives, the directives' for other directives.
  - A class that the previous resolver left out is gone.
- The highest resolver's result becomes the element's classes.
- Before folding a result, Angular reads it as class names: it calls a returned function with the
  same sources, splits strings, and reads arrays, `Set`s, and object maps. Any other value gives no
  classes.

Starting point: a library component adds a state class in its own resolver.

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

```text
collected sources: [['inline-flex', 'h-9', 'px-4', 'bg-primary'], [], ['px-2', 'bg-red-600']]
```

Before the fold: only the consumer's resolver runs, and `bg-muted` is lost.

```text
consumer's cn: inline-flex h-9 px-2 bg-red-600 shadow-lg
```

With it, the consumer's template doesn't change:

```text
UiButton's cn:    inline-flex h-9 px-2 bg-muted
folded:           [['inline-flex', 'h-9', 'bg-muted'], [], ['px-2']]
consumer's cn:    inline-flex h-9 bg-muted px-2 shadow-lg
```

Two side effects follow from folding by origin:

- A lower resolver beats a higher source only by removing that source's class, as `cn` does.
  Appending its own class isn't enough, because the class folds into the resolver's own source,
  below the higher one. In the example, `bg-muted` survives because UiButton's `cn` removed
  `bg-red-600`. A resolver that returned `[...sources.flat(), 'bg-muted']` would leave both classes,
  and the consumer's `cn` would keep `bg-red-600`.
- Match order no longer decides whether a resolver runs, only which one merges last. That's how
  conflicting `[class.x]` bindings from different directives already behave.

Every resolver runs on every refresh, so an element with three resolvers makes three calls instead
of one. This cost isn't measured yet. `tailwind-merge` caches its results by input string.

#### Consumer controls

- At the call site, a consumer's `(class)` receives what the lower resolvers resolved. To drop a
  class that one of them added, the consumer filters `$event`:

  ```html
  <ui-button [disabled]="true" (class)="cn(without($event, 'opacity-50'))" />
  ```

  Here `without` is the consumer's own helper that removes a class name from each source.

- In userland, a consumer can import a marker directive, such as one with the selector `[cn]` and a
  host resolver, and add its attribute to each element that should resolve. It ranks as a
  directive, so it runs after the component's resolver and receives its result.
- App-wide defaults come with the next design, as `provideClassResolver()`. See
  [Next: the `resolve()` class event](#next-the-resolve-class-event).

Three other controls were rejected:

- A switch that makes one resolver replace the ones below it instead of receiving their result. No
  use case needs it yet; filtering `$event` covers removing classes.

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

The feature doc covers the rest: [Limitations](docs/class-resolver.md#limitations) lists classes
added outside bindings, the order inside one `[class]` value, an input aliased to `class`, the
`checkNoChanges` pass, and cost. Its other sections cover nested return values, embedded views, and
hydration.

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

With the [fold](#folding-several-resolvers), a consumer who adds their own `(class)` keeps such a
state class, because their resolver receives the component's result.

### Combining several resolvers

| Option                               | Behavior                                                                                                                                                  | Strengths                                                               | Why it lost, or why it won                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Replace                              | The highest-priority registration runs.                                                                                                                   | One call per refresh. A consumer override is one binding.               | Lost: silent; ties between directives depend on `imports` order; logic in a replaced resolver, such as a state class it adds, is lost.                                                                                                                                                                                   |
| Race                                 | Every resolver runs and applies its own result.                                                                                                           | None.                                                                   | Lost: each diff removes the classes that the others applied, so the result depends on run order.                                                                                                                                                                                                                         |
| Queue with a flat result             | Every resolver runs in priority order, and each receives the previous result as one list.                                                                 | Every resolver's logic applies.                                         | Lost: the list has no slot in `ClassSources`. Passing it as `[[...result], [], []]` would credit every class to the component.                                                                                                                                                                                           |
| Exclusive                            | More than one resolver on an element is an error.                                                                                                         | Unambiguous.                                                            | Lost: a consumer couldn't override a library component.                                                                                                                                                                                                                                                                  |
| Delegation with `$event.inherited()` | The highest-priority resolver runs, and it can call `$event.inherited()` to run the one it replaced, or `$event.inherited(Directive)` to run a named one. | Explicit. Costs nothing when unused.                                    | Lost: the default `cn($event)` still drops lower resolvers' logic, so it needed the `NG0320` warning. `inherited(Directive)` worked only for a directive that ranked below the caller, which depends on match order that consumers can't see. A required method made a plain array fail to type-check as `ClassSources`. |
| Fold by origin (chosen)              | Every resolver runs in priority order, and each receives the previous result folded back into `ClassSources`.                                             | Every resolver's logic applies by default. One type. No warning needed. | Won. Its costs are a call per resolver on every refresh, and a lower resolver can beat a higher source only by removing that source's class.                                                                                                                                                                             |

Delegation and the fold give the same classes when the lower resolver merges with `cn`. They differ
when it appends a class without merging. Starting point: a component with `host: {class:
'bg-primary'}` whose resolver returns `[...sources.flat(), 'bg-muted']`, used as `<ui-button
class="bg-red-600" (class)="…" />`. Measured with `clsx` 2.1.1 and `tailwind-merge` 3.7.0:

```text
replace,    (class)="cn($event)":             bg-red-600
delegation, (class)="cn($event.inherited())": bg-muted
fold,       (class)="cn($event)":             bg-red-600
```

With delegation, the class that the lower resolver appended wins over the consumer's. With the fold,
it ranks at the component's source, below the template, which matches the priority between sources.

### Binding syntax and placement

| Design                                                                                           | Who opts in                   | Trade-off                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template `(class)` and host `(class)` (proposed)                                                 | Consumer and component author | One syntax and one mechanism for both. Event syntax for a function that runs while rendering.                                                                                                                                               |
| `[class]="fn"`: give function values a meaning                                                   | Consumer                      | No new syntax, but `[class]` would have to stop being a source on that element.                                                                                                                                                             |
| App-wide default resolvers                                                                       | App                           | No template changes, but every element changes, including third-party components. The next design takes a narrower form: `provideClassResolver()` supplies the resolver that `(class)` bindings use, and elements without one don't change. |
| A component option, such as `classResolver: cn`                                                  | Component author              | Once per component, but a static function without instance state. Host `(class)` covers it.                                                                                                                                                 |
| A different name, such as `(class.resolve)`                                                      | Consumer                      | Avoids colliding with `class` outputs, but loses the short form, and `(class.x)` reads like a modifier, as `(keydown.enter)` does.                                                                                                          |
| Userland: `input({alias: 'class'})` plus a host `[class]` computed with `cn`, as spartan-ng does | Component author              | Works today, but the template's `[class.x]` and other directives' classes are invisible to it.                                                                                                                                              |

## Deferred

| Item                                                                            | Reason                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `[static, bound]` split inside each source                                    | No case needs it yet; it only deepens the type. See [Payload shape](#payload-shape).                                                                                                                                       |
| App-wide default resolvers                                                      | Decided for the next design as `provideClassResolver()`. See [Next: the `resolve()` class event](#next-the-resolve-class-event).                                                                                           |
| Resolution for attributes other than `class`, including a `(style)` counterpart | The next design ships `(attr.class)` only. Other attributes need their own source shape and fold rule, in a later round. Reserving `(attr.*)` meanwhile is left to the maintainers.                                        |
| Checking the type of the handler's result                                       | The next design checks it: `resolve()` takes a class value, and the shorthand must return a `ResolvedClasses`.                                                                                                             |
| `NG8111` for a `(class)` that listens to an output                              | The next design narrows the `NG8111` exemption to the shorthand that resolves, so the narrower exemption isn't built for this prototype.                                                                                   |
| An error for bindings that do nothing on `<ng-container>` and `<ng-template>`   | Upstream accepts class bindings and `(click)` there without a diagnostic, so it's an upstream-wide question. A generic check is in progress separately. The next design reports `(class)` and `(attr.class)` there itself. |
| Language service support for `$event` in `(class)`                              | Not needed to evaluate the design.                                                                                                                                                                                         |
| Root components with a host `(class)`                                           | Not covered by tests yet.                                                                                                                                                                                                  |
| A switch that makes a resolver replace the ones below it                        | No use case needs it yet; filtering `$event` covers removing classes.                                                                                                                                                      |
| The cost of running every resolver on every refresh                             | Not measured yet.                                                                                                                                                                                                          |

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

- The feature as built, with examples, error conditions, and test commands:
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

## Next: the `resolve()` class event

Decided on 2026-10-26 for its own implementation round. It keeps `ClassSources`, the priorities
between sources, and the fold. It changes how a handler hands back the classes.

### Why the return value goes

The prototype applies the handler's return value. Apart from `return false`, which calls
`preventDefault()`, no other Angular event binding uses its value. Using it causes problems that the
compiler doesn't catch:

- The template compiler returns the handler's last expression. `(class)="cn($event); track()"`
  applies what `track()` returns, so by the runtime code the element loses the classes that the
  binding manages.
- The return value isn't type-checked. `(class)="count()"` compiles, and a number throws only at
  runtime, in dev mode.
- `NG8111` has to exempt every `(class)` binding, because `(class)="cn"` passes a function on
  purpose, even where the binding only listens and the function never runs.
- A handler can't skip resolving for one refresh.

### The full form: `(attr.class)`

```ts
type ClassBindingValue =
  | string
  | readonly string[]
  | ReadonlySet<string>
  | {readonly [className: string]: unknown}
  | null
  | undefined
  | false;

interface ClassResolveEvent {
  readonly sources: ClassSources;
  resolver(...extras: ClassBindingValue[]): ResolvedClasses;
  resolve(classes: ClassBindingValue | ResolvedClasses): void;
}
```

- `sources` is the same tuple as today.
- `resolver(...extras)` is the app's resolver, bound to `sources`. It puts the extras at the end of
  the caller's own source, which is where the fold puts a class that a resolver adds, and resolves.
- `resolve(classes)` applies exactly these classes. It's the escape hatch for replacing classes,
  filtering them, or overriding a higher source on purpose.
- The extras and `resolve()` read a value the way `[class]` does in production. A string splits on
  whitespace, an array or a `Set` lists names, an object map keeps the keys whose values are truthy,
  and a top-level `null`, `undefined`, `false`, or `''` adds nothing. Unlike `[class]` in dev mode,
  a top-level `false` doesn't assert, so `cn(active() && 'ring')` works. By type, arrays and Sets
  hold strings only, so a class named `false` can't get in.

```html
<ui-button (attr.class)="$event.resolve($event.resolver('shadow-lg'))" />
```

- If the handler doesn't call `resolve()`, the payload passes through, as if the binding weren't
  there.
- A repeated call, or one after the handler returns, throws in dev mode, with one new error code. In
  production, a late call is ignored, and the last call during the handler wins.
- `resolve()` accepts what `[class]` accepts. It doesn't accept a function.
- The handler's return value is ignored, as for any event.

### The shorthand: `(class)`

```html
<ui-button class="bg-red-600" (class)="(cn) => cn('shadow-lg')" />
```

```text
(class)="F"   compiles to   (attr.class)="$event.resolve((F)($event.resolver))"
```

- `F` is one expression whose value is a function `(cn: BoundClassResolver) => ResolvedClasses`:
  an arrow function, or a reference to a component field.
- `ResolvedClasses` is opaque, like `SafeValue`, and only the bound resolver creates one. A callback
  that returns a string, or ignores `cn` and calls another function, fails type checking. In dev
  mode, a result that isn't a `ResolvedClasses`, or that came from another element's resolver,
  throws with the same error code as a late `resolve()`. Production skips the check.
- `NG8111` doesn't report a shorthand that resolves, because its function is passed on purpose.
  Calling the callback by mistake, as in `(class)="classes()"`, fails type checking instead,
  because the argument is missing. `NG8111` reports `(attr.class)` like any other event binding.

A component can define its callback once and bind it by reference:

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

### The resolver: `provideClassResolver()`

```ts
export type ClassResolver = (...classes: string[]) => string;

export function provideClassResolver(resolver: ClassResolver): Provider;
```

```ts
bootstrapApplication(App, {providers: [provideClassResolver(twMerge)]});
```

- The contract is fixed. Angular normalizes the sources and the extras to strings first, then calls
  the resolver with one string per source in priority order, with the extras at the end of the
  caller's string. `cn`, `twMerge`, and `clsx` all fit it (measured with `tsc`), and `twMerge`
  alone is enough, because Angular already does what `clsx` does. Templates are type-checked
  against `ClassBindingValue`, whichever resolver the app provides.
- Angular looks the resolver up through the element's injector, so a library scopes its own with
  `viewProviders`. Plain `providers` would also reach content that consumers project into the
  component.
- It applies only where a `(class)` binding asks for it. Elements without one don't change.
- Without a registration, the resolver is Angular's plain merge. It flattens the sources in order,
  adds each extra at the end of the caller's source, drops empty and repeated names (keeping the
  first position), and joins the rest with spaces. It doesn't resolve conflicts, so
  `(class)="(cn) => cn()"` changes nothing, and adopting `(class)` changes no app until it provides
  a resolver.
- An app without a `(class)` binding doesn't carry the resolver runtime. The first `ɵɵclassResolver`
  call switches on change detection's refresh hook, the way `provideClientHydration()` switches on
  hydration's code paths.

### Collisions and other names

Decided on 2026-10-28.

- **An output named `class`.** `(class)` always resolves, in a template and in host bindings, even
  next to a directive output named `class`. The resolver shadows the output, the way a directive
  output shadows a native event's `$event` type. Unlike that case, the output's emissions don't
  reach the binding, because the binding passes a callback rather than listening. A template can't
  listen to an output named `class`, which is rare. The prototype's fallback to a listener goes. The
  same rule applies to `(attr.class)` and an output named `attr.class`. An extended diagnostic
  warns that the output isn't listened to, and the runtime warning `NG0319` goes.
- **Containers.** `(class)` and `(attr.class)` on `<ng-container>` or `<ng-template>` do nothing,
  like the other bindings there. A generic check for all such bindings is developed separately,
  but the issue is old and the check may never land, so the next design reports them itself:
  - At compile time, next to the existing checks for unclaimed bindings. Type checking runs those
    checks for `<ng-container>` but not for `<ng-template>`, so the error reaches `<ng-template>`
    once the separate fix for that gap lands, with no further change.
  - In dev mode at runtime, where a `(class)` on a node that isn't an element registers nothing.
    This also covers a directive's host `(class)`, which type checking can't see.

  If the generic check lands, it reports these bindings instead, so each one is reported once.

- **One per template element.** A second `(class)` or `(attr.class)` on the same template element
  is a compile error. Today both run, one after the other (measured).
- **`@HostListener`.** `@HostListener('class')` is a compile error that points to
  `@HostListener('attr.class', ['$event'])`. A decorator always calls its method, so it can't pass
  the callback that the shorthand needs. A shorthand for the decorator is a quality-of-life choice
  for the maintainers.
- **Other `(attr.*)` names.** Only `(attr.class)` resolves. Other `(attr.*)` names stay ordinary
  event bindings, so the namespace isn't reserved. Reserving it is a choice for the maintainers, to
  make together with [resolving any attribute](#direction-1-resolve-any-attribute). The code that
  recognizes `(attr.class)` carries the reservation as a commented-out check.

### Why extras rank in the caller's source

A component adds a default class, and the consumer overrides it:

```ts
@Component({selector: 'ui-button', host: {class: 'inline-flex px-4', '(class)': '…'}})
export class UiButton {}
```

```html
<ui-button class="bg-red-600" (class)="(cn) => cn('shadow-lg')" />
```

Measured with `clsx` 2.1.1 and `tailwind-merge` 3.7.0, through a simulation of the fold:

| The host's handler adds `bg-muted`                      | Element                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| After the sources, in an array: `[$event, 'bg-muted']`  | `inline-flex px-4 bg-muted shadow-lg`: the consumer's `bg-red-600` is lost |
| Before the sources, in an array: `['bg-muted', $event]` | `inline-flex px-4 bg-red-600 shadow-lg`                                    |
| Ranked in its own source: `(cn) => cn('bg-muted')`      | `inline-flex px-4 bg-red-600 shadow-lg`                                    |

Without the consumer's `bg-red-600`, all three keep `bg-muted`. Ranking by caller turns a
component's extra into a default that consumers override, whatever order the author writes. A
component that must win over the consumer uses the full form.

### `[class]` next to extras

`[class]="v"` with `(class)="(cn) => cn()"` looks like `(class)="(cn) => cn(v)"`, but the two
differ. Measured on the prototype, except where noted:

| Case                                          | `[class]="v"` and `cn()`                                       | `cn(v)`                                  |
| --------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| A top-level `false`                           | Asserts in dev mode, and the resolver doesn't run              | Adds nothing                             |
| Rank within the source                        | Before the source's `[class.x]` bindings                       | After them, at the end of the source     |
| A component with a `class` input              | The input takes the value                                      | Reaches the element                      |
| Type checking                                 | Only the expression; the type-check block skips class bindings | Checked against `ClassBindingValue`      |
| Visible to a lower resolver, such as a host's | Yes                                                            | No; it exists from the caller's level up |

The `cn(v)` column follows the design, since the next design isn't built. Both forms stay allowed.

### Alternatives considered

| Design                                                                                              | Why it lost                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The return value, as in the prototype                                                               | The problems in [Why the return value goes](#why-the-return-value-goes).                                                                                                                                                              |
| A callable event: `(class)="$event('x')"`                                                           | The same ranking, but `$event` becomes a function. The callback names the resolver as a parameter, and a component can bind it by reference.                                                                                          |
| Sugar over an array: `(class)="[$event, 'x']"`                                                      | `$event` would mean the sources in the shorthand and the event in the full form. Extras rank by position, so a host that appends drops the consumer's class (measured above). `(class)="'x'"` replaces every class without a warning. |
| `resolve()` applies the app's resolver itself                                                       | The full form would lose its guarantee that nothing happens unless the handler writes it, and would need a flag to opt out.                                                                                                           |
| A branded string instead of `ResolvedClasses`                                                       | Checked at compile time only. A cast or `$any` passes without a warning.                                                                                                                                                              |
| A build-time resolver file ([direction 2](#direction-2-default-resolvers-configured-at-build-time)) | Every tool that compiles templates needs the configuration, and a library can't scope its own resolver to its subtree.                                                                                                                |
| Throw when no resolver is registered                                                                | `(class)` would need a provider before an app could adopt it. The plain merge matches what Angular renders today.                                                                                                                     |
| Declaration merging for the extras' type                                                            | Measured: it works for one app, but a library that augments it differently fails with `TS2717`, and a library built alone checks its templates against the default. A resolver scoped with `viewProviders` can't have its own type.   |
| The resolver receives `[class]` values and normalizes them itself                                   | `twMerge` fails the type, and `clsx(new Set(['a', 'b']))` returns `''` (measured), so every resolver would reimplement Angular's reading.                                                                                             |
| Extras stringified the way arrays and interpolation are                                             | `cn(active() && 'ring')` would render a class named `false`. A top-level `[class]` value never renders one.                                                                                                                           |
| Ban `[class]` next to `(class)`                                                                     | Static `class`, `[class.x]`, and host bindings stay sources anyway, and adopting `(class)` would mean rewriting existing `[class]` bindings.                                                                                          |
| A shorthand without extras that only asks for resolution                                            | It gives up every advantage in [`[class]` next to extras](#class-next-to-extras).                                                                                                                                                     |

### To check first

- The type-check block prints template arrow parameters without a type, so TypeScript should infer
  `cn` from the argument in the rewritten call. Measure it before building on it.
- More than one host resolver from one directive. Today a second `@HostListener('class')`, or one
  next to `host: {'(class)': …}`, silently replaces the first, and a subclass's resolver runs after
  its base class's (measured).
- Whether resolution should happen without a `(class)` binding, for example on every component host.

## Request for comments

The prototype treats `class` as a special case. Two directions would go further. Feedback on either
is welcome, and they can combine.

### Direction 1: resolve any attribute

Status: the [next design](#next-the-resolve-class-event) ships `(attr.class)`, with `(class)` as
its shorthand. Other `(attr.*)` names stay ordinary event bindings, and whether to reserve them is
open.

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
];
```

Each slot lists the values that source sets for the attribute, static and bound. With the next
design's event, the handler passes the attribute's value to `$event.resolve()`, or `null` to remove
it. `class` and `style` keep their token-aware payloads,
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
- Folding a result back by origin works for token lists such as `class` and `aria-describedby`.
  For an attribute with a single value, a later resolver would need the previous value some other
  way.

### Direction 2: default resolvers configured at build time

Status: not chosen for `class`. The [next design](#next-the-resolve-class-event) uses dependency
injection instead. This section records the option.

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
`(class)` ranks above the default and receives its result through the fold. Direction 2 needs
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

Dependency injection is what the next design uses, with `provideClassResolver()`. It scopes a
resolver to a subtree and needs no build configuration. Unlike this direction, it doesn't add a
resolver to every element: the provided resolver applies only where a `(class)` binding asks for it.

### Questions for commenters

1. Which attributes besides `class` and `style` get conflicting values from several sources in your
   apps or libraries?
1. Does the callback shorthand, `(class)="(cn) => cn('shadow-lg')"`, read clearly in your
   templates?
1. Should a component be able to override a consumer's class without the full form?
1. Does folding by origin cover how your libraries compose classes, or do you need a resolver that
   replaces the ones below it?
