# `(class)` bindings

Status: experimental (`@experimental 22.3`), on the `feat/class-resolver` branch of the
Flarette/angular fork. The design record is [`proposal.md`](../proposal.md).

A `(class)` binding resolves an element's classes. Angular collects the classes that each source
applies to the element: the component on it, its other directives, and the template. It merges them
with your app's class resolver, such as `twMerge`, and applies the result.

```html
<ui-button class="px-2" (class)="(cn) => cn('shadow-lg')">Save</ui-button>
```

The typical use is Tailwind CSS. Conflicting utilities, such as `px-4` from the component and `px-2`
from the template, then resolve by the priority of the source that set them, not by the order of
rules in the stylesheet.

With [automatic resolution](#resolve-every-element-automatically), you don't write the binding:
Angular resolves every element that a component or directive matches.

## Provide a resolver

`provideClassResolver(resolver, ...features)` registers the function that merges classes:

```ts
import {provideClassResolver} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {twMerge} from 'tailwind-merge';

bootstrapApplication(App, {providers: [provideClassResolver(twMerge)]});
```

The resolver is a `ClassResolver`:

```ts
type ClassResolver = (...classes: string[]) => string;
```

- Angular always calls it with three strings, one per source, from the lowest to the highest
  priority: component, directives, template. A source without classes is `''`.
- Each string holds the source's classes, separated by spaces. Classes that a binding adds come at
  the end of its own source's string.
- Angular splits the returned string on whitespace and drops empty and repeated names.

A shadcn-style `cn` fits the contract too:

```ts
import {clsx, type ClassValue} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

```ts
bootstrapApplication(App, {providers: [provideClassResolver(cn)]});
```

Angular reads class values before it calls the resolver, so `twMerge` alone is enough.

### Without a provider

Without `provideClassResolver()`, bindings use the plain merge. It joins the three strings in
order, drops empty and repeated names, keeping each name's first position, and resolves no
conflicts. So `(class)="(cn) => cn()"` gives an element the same classes it has without the binding,
and adopting `(class)` changes nothing until you provide a resolver.

### Where a provider applies

Each binding looks its resolver up from its element's injector when Angular creates the element.
To resolve a component's template and its own host binding with another resolver, provide it in
`viewProviders`:

```ts
import {ClassCallback, Component, provideClassResolver} from '@angular/core';
import {panelMerge} from './panel-merge';

@Component({
  selector: 'ui-panel',
  viewProviders: [provideClassResolver(panelMerge)],
  host: {class: 'rounded-md', '(class)': 'classes'},
  template: `
    <div class="p-4" (class)="(cn) => cn()"></div>
    <ng-content />
  `,
})
export class UiPanel {
  protected readonly classes: ClassCallback = (cn) => cn();
}
```

- The `<div>` in the template and the host's `(class)` use `panelMerge`.
- Content that a consumer projects into `<ui-panel>`, a consumer's binding on `<ui-panel>`, and
  other directives on `<ui-panel>` use the resolver provided above `UiPanel`.

So one element can use two resolvers: the component's host binding uses the component's
`viewProviders`, and everything else on the element uses the outer one. A component's `providers`
reach further than its `viewProviders`: they also apply to content projected into it and to every
binding on its host element.

## Write a `(class)` binding

The shorthand `(class)` takes a callback. Angular calls the callback with `cn`, the element's
resolver bound to its sources, and applies what `cn` returns:

```html
<ui-button class="px-2" (class)="(cn) => cn('shadow-lg', busy() && 'opacity-50')" />
```

`(class)="F"` means:

```html
<ui-button (attr.class)="$event.resolve((F)($event.resolver))" />
```

`F` is one expression whose value is a `ClassCallback`:

```ts
type ClassCallback = (cn: BoundClassResolver) => ResolvedClasses;
type BoundClassResolver = (...extras: ClassBindingValue[]) => ResolvedClasses;
```

It takes one of these forms:

```html
<!-- An arrow function. -->
<div class="p-2" (class)="(cn) => cn('m-1')"></div>

<!-- A reference to a field. -->
<div class="p-2" (class)="withMargin"></div>

<!-- An expression that returns a callback. -->
<div class="p-2" (class)="margin('m-1')"></div>
```

```ts
@Component({
  selector: 'app-list',
  template: `...`,
})
export class List {
  protected readonly withMargin: ClassCallback = (cn) => cn('m-1');

  protected margin(size: string): ClassCallback {
    return (cn) => cn(size);
  }
}
```

A field keeps a callback in one place when it reads component state or when several elements share
it. Prefer an arrow function field to a method, so the callback keeps `this` however the template
reads it. See [Type checking](#type-checking).

A shorthand must be a single expression. A chain, such as `(class)="count(); classes"`, is a
compile error. Use `(attr.class)` to run more than one statement.

### Extras

The arguments that you pass to `cn` are extras. `cn` adds them at the end of the source of the
binding that calls it, and merges:

- In a template, extras rank after the template's own classes.
- In a component's `host`, they rank at the end of the component source, so the consumer's template
  classes still win over them.
- In another directive's `host`, they rank at the end of the directives source.

An extra is a `ClassBindingValue`:

```ts
type ClassBindingValue =
  | string
  | readonly string[]
  | ReadonlySet<string>
  | {readonly [className: string]: unknown}
  | null
  | undefined
  | false;
```

`cn` reads each extra the way a `[class]` binding reads a value:

- A string splits on whitespace.
- An array or a `Set` lists class names.
- An object map keeps the keys whose values are truthy.
- `null`, `undefined`, `false`, and `''` add nothing, so `cn(active() && 'ring')` works.
- A name that contains a space, such as the array entry `'a b'`, is dropped.

### `ResolvedClasses`

`cn` returns a `ResolvedClasses`. It's an opaque value, and only the resolver of the current event
creates one. A shorthand callback must return the value that its `cn` gives it:

- Type checking rejects a callback that returns anything else, such as a string.
- In dev mode, Angular throws `NG0320` when the callback returns a value that its own `cn` didn't
  create in this refresh: a string, the result of another element's `cn`, or a result kept from an
  earlier refresh.

  ```text
  NG0320: The `(class)` callback returned a value that its own resolver didn't create. Return the
  result of the resolver that the callback receives, such as `(cn) => cn('px-4')`.
  ```

- Production skips the check and reads the value as a class value.

This makes every shorthand go through the app's resolver, so its result is always the merge of the
sources and its extras. To set an element's classes directly, use the full form.

## The full form: `(attr.class)`

`(attr.class)` gives its handler a `ClassResolveEvent` as `$event`:

```ts
interface ClassResolveEvent {
  readonly sources: ClassSources;
  resolver(...extras: ClassBindingValue[]): ResolvedClasses;
  resolve(classes: ClassBindingValue | ResolvedClasses): void;
}
```

- `sources` holds the classes of each source. See [The sources](#the-sources).
- `resolver(...extras)` merges the sources with extras, like `cn` in the shorthand.
- `resolve(classes)` sets the element's classes to exactly `classes`. It takes a `ResolvedClasses`
  or a class value, which it reads the way `cn` reads extras. A value of another type, such as a
  number, fails type checking and gives no classes at runtime.

```ts
@Component({
  selector: 'app-card',
  imports: [UiButton],
  template: `<ui-button class="px-2" (attr.class)="resolveButton($event)" />`,
})
export class Card {
  readonly plain = input(false);

  protected resolveButton(event: ClassResolveEvent) {
    if (this.plain()) {
      // Replaces every class, without the resolver.
      event.resolve(['btn-plain']);
    } else {
      event.resolve(event.resolver('shadow-lg'));
    }
  }
}
```

- If the handler doesn't call `resolve()`, the element keeps the classes of its sources, as if the
  binding weren't there. The resolver doesn't run.
- The handler's return value is ignored.
- A chain is allowed: `(attr.class)="count(); $event.resolve($event.resolver())"`.

Each refresh creates a new event. Call `resolve()` at most once, while the handler runs:

- In dev mode, a second call throws `NG0320`, and so does a call after the handler returns or
  throws. A call from a getter that `resolve()` reads counts as a second call. The message names the
  binding's form:

  ```text
  NG0320: The `(attr.class)` handler called `resolve()` more than once. Call it at most once.
  ```

  ```text
  NG0320: The `(attr.class)` handler called `resolve()` after it returned. Call it while the
  handler runs.
  ```

- In production, a call after the handler returns is ignored. If the handler calls `resolve()` more
  than once, the call that starts last wins.

## The sources

`$event.sources` is a `ClassSources`:

```ts
type ClassSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
];
```

Angular builds it with these rules:

1. It always has three slots, ordered from the lowest to the highest priority. A missing source is
   an empty array.
1. `component` holds the classes of the component on the element and of its host directives, which
   Angular matches before the component.
1. `directives` holds the classes of all other directives, in the order Angular matched them. That
   order follows the consuming component's `imports`.
1. `template` holds the element's `class` attribute and its `[class]` and `[class.name]` bindings.
1. Within a slot, static classes come first, then `[class]`, then `[class.name]`.
1. Each class name appears once, under the source and at the position of the highest-priority
   binding that has an opinion about it. A binding set to a falsy value, such as `false`, `null`,
   `''`, or `0`, removes the class from every lower-priority source. `undefined` defers to a lower
   priority.

For example, with a component that has a host directive, and an attribute directive:

```ts
@Directive({host: {class: 'ring'}})
export class Ring {}

@Component({
  selector: 'ui-button',
  hostDirectives: [Ring],
  host: {class: 'cmp-static', '[class]': 'variant()'},
  template: '',
})
export class UiButton {
  readonly variant = signal('cmp-map');
}

@Directive({selector: '[highlight]', host: {class: 'dir-static', '[class.dir-prop]': 'true'}})
export class Highlight {}
```

```html
<ui-button
  highlight
  class="tpl-static"
  [class]="'tpl-map'"
  [class.tpl-prop]="true"
  (attr.class)="capture($event)"
/>
```

```text
$event.sources: [
  ['ring', 'cmp-static', 'cmp-map'],
  ['dir-static', 'dir-prop'],
  ['tpl-static', 'tpl-map', 'tpl-prop'],
]
```

## Resolve a component's host element

A component can resolve the classes of its own host element, so its consumers don't need a binding:

```ts
import {ClassCallback, Component, input} from '@angular/core';

@Component({
  selector: 'ui-button',
  host: {class: 'inline-flex h-9 px-4 bg-primary', '(class)': 'classes'},
  template: '<ng-content />',
})
export class UiButton {
  readonly disabled = input(false);
  protected readonly classes: ClassCallback = (cn) => cn(this.disabled() && 'bg-muted');
}
```

With `twMerge`, `<ui-button class="px-2" />` gets `inline-flex h-9 bg-primary px-2`.

The full form works in `host` too: `host: {'(attr.class)': 'resolve($event)'}`. Directives and host
directives declare resolvers the same way.

### Declaration rules

- Declare a resolver in `host`. `@HostListener('class')` and `@HostListener('attr.class')` are
  compile errors:

  ```text
  @HostListener('class') can't declare a class resolver. Bind it in the host metadata instead:
  host: {'(class)': 'onClass($event)'}.
  ```

  `@HostBinding('class')` still binds classes.

- A directive has at most one resolver. `(class)` and `(attr.class)` in one `host` object are a
  compile error:

  ```text
  Can't have multiple class resolvers in one host. Use only one '(class)' or '(attr.class)' binding.
  ```

- A directive inherits its base class's resolver. If it also declares its own, dev mode throws
  `NG0323` when Angular first creates a template that uses it, because the compiler can't always see
  the base class's host bindings:

  ```text
  NG0323: `Sub` has more than one class resolver, through inheritance. A directive can have at most
  one `(class)` or `(attr.class)` binding in its host, including the ones it inherits from its base
  classes.
  ```

- A template element has at most one resolver. A second `(class)` or `(attr.class)` on it is a
  compile error, on `<ng-container>` and `<ng-template>` too:

  ```text
  Can't have multiple class resolvers on one element. Use only one '(class)' or '(attr.class)'
  binding.
  ```

- A shorthand must be a single expression, in a template and in `host`:

  ```text
  A '(class)' shorthand must be a single expression, a function that receives the resolver. Bind
  '(attr.class)' to run more than one statement.
  ```

JIT compilation throws these compile errors with the same messages when it compiles the component
or directive.

## Several resolvers on one element

An element can have one resolver per directive and one from its template. Angular runs them from
the lowest to the highest priority:

1. The component's host directives, then the component.
1. The other directives, in match order.
1. The template.

- The lowest resolver receives the sources as Angular collected them.
- Angular folds the classes that each resolver resolves back into `ClassSources` for the next one:
  - A class keeps the source it had.
  - A class that the sources didn't have goes to the resolver's own source: `component` for the
    component and its host directives, `directives` for other directives, and `template` for the
    template.
  - A class that the result leaves out is gone for the resolvers above it.
- The highest resolver's result becomes the element's classes.

Because extras rank in the caller's source, a component's extra is a default that the consumer
overrides. With the `UiButton` above, `provideClassResolver(twMerge)`, and this consumer:

```html
<ui-button [disabled]="true" class="px-2 bg-red-600" (class)="(cn) => cn('shadow-lg')" />
```

```text
Collected:        [['inline-flex', 'h-9', 'px-4', 'bg-primary'], [], ['px-2', 'bg-red-600']]

UiButton, cn('bg-muted')
  twMerge input:  'inline-flex h-9 px-4 bg-primary bg-muted', '', 'px-2 bg-red-600'
  result:         'inline-flex h-9 px-2 bg-red-600'
  folded:         [['inline-flex', 'h-9'], [], ['px-2', 'bg-red-600']]

Template, cn('shadow-lg')
  twMerge input:  'inline-flex h-9', '', 'px-2 bg-red-600 shadow-lg'
  result:         'inline-flex h-9 px-2 bg-red-600 shadow-lg'
```

Without the consumer's `bg-red-600`, `UiButton` resolves to `inline-flex h-9 bg-muted px-2`. The
fold puts `bg-muted` in the component source, and the element gets
`inline-flex h-9 bg-muted px-2 shadow-lg`. These results come from `tailwind-merge` 3.7.0.

A lower resolver beats a higher source only by removing that source's class, because the resolvers
above it never see the class again. To drop a consumer's class on purpose, filter `$event.sources`
in a full-form handler and pass the rest to `resolve()`.

## Resolve every element automatically

`withAutoResolution()` makes the resolver resolve elements without a binding:

```ts
bootstrapApplication(App, {
  providers: [provideClassResolver(twMerge, withAutoResolution())],
});
```

```html
<!-- A component matches: resolved. -->
<ui-button class="px-4" />
<!-- A directive matches: resolved. -->
<div tone class="px-4"></div>
<!-- Template classes only: not resolved. -->
<span class="px-2 px-4"></span>
```

- The feature resolves every element that a component or directive matches. That includes
  components created in code, such as routed components and components that you create with
  `ViewContainerRef.createComponent()` or `createComponent()`, with their host directives.
- Elements without a component or directive aren't resolved.
- Angular calls the resolver with the three source strings and no extras, and calls it again only
  when one of the strings changes.
- An element with a `(class)` or `(attr.class)` binding, in the template or in the `host` of a
  directive on it, is resolved only through that binding. Automatic resolution doesn't run on it,
  even when the handler doesn't call `resolve()`. The binding's handler runs on every refresh,
  because it can read other state.

### Turn it off for a subtree

Declare the feature in the root providers, such as those of `bootstrapApplication()` or of
`TestBed.configureTestingModule()`. Below the root, a component provides the resolver again:

- Without the feature, to turn automatic resolution off for its template.
- With the feature, to turn it back on.

```ts
@Directive({selector: '[tone]', host: {class: 'px-2'}})
export class Tone {}

@Component({
  selector: 'modern-card',
  imports: [Tone],
  // Back on in this template.
  viewProviders: [provideClassResolver(twMerge, withAutoResolution())],
  template: `<div tone class="px-4"></div>`,
})
export class ModernCard {}

@Component({
  selector: 'legacy-table',
  imports: [ModernCard],
  // Off in this template.
  providers: [provideClassResolver(twMerge)],
  template: `<modern-card class="px-4" />`,
})
export class LegacyTable {}
```

- The setting applies to the component's template and to the templates nested in it. In an off
  template, elements get the classes that Angular gives without a resolver, and `(class)` bindings
  still resolve.
- In an on template, automatic resolution uses the resolver of the provider that turned the
  template on. A `(class)` binding looks its resolver up from its element's injector instead.
- An element follows the template that declares it. In the example, `<modern-card>` isn't resolved,
  because `LegacyTable`'s template declares it, but the `<div>` in `ModernCard`'s template is.
- An embedded view follows the template that declares its `<ng-template>`, wherever you insert it.
- A component created in code follows the injector where you create it. A route's `providers` can
  turn the feature off, or back on with another resolver, for the components it creates.

If a provider below the root declares `withAutoResolution()` while the root providers don't, dev
mode throws `NG0322` when that provider would turn the feature on. Production ignores the feature in
that provider.

```text
NG0322: Automatic class resolution is turned on for `ModernCard` by `withAutoResolution()` in
providers below the root, but the root providers don't declare it. Provide
`provideClassResolver(resolver, withAutoResolution())` in the root providers, such as those of
`bootstrapApplication()`.
```

### Turn it on before the first render

Angular sets up an element for automatic resolution when it first creates the element's template,
and it caches that setup with the component. The feature's runtime turns on when you call
`withAutoResolution()`. So a template that Angular created before the first call never gets
automatic resolution in that JavaScript process, in any app.

An app whose root providers call `withAutoResolution()` before its first render isn't affected. Two
cases are:

- Several apps in one process, where an app without the feature renders a shared component first.
- Tests, where an earlier test renders a component before a later test provides the feature. Call
  `withAutoResolution()` in your test setup file, before any test renders. Tests whose root
  providers have no resolver still resolve nothing.

Angular gives no signal, in dev mode or in production: the affected elements keep their classes
unresolved.

## When handlers run

Angular calls an element's handlers on every refresh of the view that declares the element, after
the view's host bindings and before its child components. It then applies the difference between
the classes it applied last time and the new result. Classes that something else added, for example
`Renderer2.addClass()` or an animation, stay on the element.

Angular calls the handler while it renders the view, like a template expression:

- Signals that the handler reads are tracked, so a change to them schedules a refresh.
- Writing a signal in the handler throws `NG0600`.
- Writing a plain field that the element's own bindings read leaves the element out of date. An
  `OnPush` view, the default, doesn't report it. Dev mode reports it as `NG0100` in an `Eager` view,
  and `provideCheckNoChangesConfig({exhaustive: true})` reports it in any view.

In an embedded view, such as an `@if` or `@for` block, each view resolves its own elements, and the
handler reads that view's context, such as the `@for` item.

Write the handler as a function of its sources and the state it reads.

## Directive outputs named `class` or `attr.class`

`(class)` always resolves its element's classes, in a template and in `host`, even next to a
directive output named `class`. That includes a host directive's output that the component exposes
as `class`. The same holds for `(attr.class)` and an output named `attr.class`. The binding never
listens to the output, and type checking gives `$event` the type `ClassResolveEvent`, not the
output's type.

The extended diagnostic `outputShadowedByClassResolver` (`NG8120`), a warning by default, reports
such a binding in a template. Like every extended diagnostic, it runs only with `strictTemplates`,
which is on by default:

```text
The `(class)` binding resolves the element's classes, so it doesn't listen to the `class` output of
`Emitter`. Rename the output to listen to it.
```

Rename the output to listen to it. An output named `class` also makes Angular drop the element's
template `[class]` binding, with or without a `(class)` binding. The element's static `class` and
its `[class.name]` bindings stay.

## `<ng-container>` and `<ng-template>`

These elements aren't rendered, so they have no classes to resolve. A `(class)` or `(attr.class)`
on them does nothing, and it doesn't listen to a directive output either.

- At compile time, the TypeScript compiler reports `NG8121`, an error, for a binding on
  `<ng-container>`:

  ```text
  The '(class)' binding can't resolve classes on '<ng-container>' or '<ng-template>', because
  neither is rendered as an element. Bind it on an element instead.
  ```

  Type checking doesn't see a binding on `<ng-template>` itself. With `strictTemplates: false`, it
  also skips `<ng-template>` bodies, so it doesn't report an `<ng-container>` inside one.

- At runtime, dev mode logs `NG0321` with `console.error` when Angular creates the binding. This
  also covers a directive's host binding on these elements, which type checking can't see. The
  handler never runs.

  ```text
  NG0321: The `(class)` binding can't resolve classes on `<ng-container>` or `<ng-template>`,
  because neither is rendered as an element. Bind it on an element instead.
  ```

  ```text
  NG0321: The `(class)` host binding of `Recorder` can't resolve classes on `<ng-container>` or
  `<ng-template>`, because neither is rendered as an element. Apply `Recorder` to an element
  instead.
  ```

### Other names

- An event with a target, such as `(window:class)` or `(document:class)`, is an ordinary listener,
  in a template, in `host`, and in `@HostListener`.
- Other `(attr.*)` names, such as `(attr.title)`, are ordinary event bindings.
- `[(class)]` is a two-way binding to an input named `class`, not a resolver.

## Type checking

With `strictOutputEventTypes`, which `strictTemplates` turns on, and which is on by default:

- `$event` is a `ClassResolveEvent` in both forms, in a template and in `host`.
- Angular checks a shorthand `(class)="F"` as the call that runs,
  `$event.resolve((F)($event.resolver))`, with two more checks: `F` must satisfy `ClassCallback`,
  and the call's result must satisfy `ResolvedClasses`.

The parameter of an arrow function gets the type `BoundClassResolver`, whatever you name it. The
checks catch these mistakes:

| Template                                                  | Error                                                   |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `(class)="(cn) => 'x'"`                                   | `TS2322` and `TS1360`: a string isn't `ResolvedClasses` |
| `(class)="(cn) => cn(42)"`                                | `TS2345`: `42` isn't a `ClassBindingValue`              |
| `(class)="classes()"`, where `classes()` returns a string | `TS2349` and `TS1360`: a string isn't callable          |
| `(class)="() => saved"`                                   | `TS2554`: the callback takes no parameter               |
| `(class)="choice?.classes"`, with a nullable `choice`     | `TS1360`: `undefined` isn't a `ClassCallback`           |

For an overloaded method, Angular checks the overload that the call selects, and its result.

Because Angular checks the call that runs, it also checks `this`:

- `(class)="classes"` calls the method on the component, so the method keeps `this`.
- `(class)="active ? first : classes"` calls the method without `this`. If the method declares a
  `this` parameter, such as `classes(this: Toolbar, cn: BoundClassResolver)`, type checking reports
  `TS2684`. If it doesn't, type checking accepts it, and the method runs without `this`.

A wrong callback can report up to three errors, all on the callback:

```ts
onClick(event: MouseEvent): void {}
```

```html
<!-- TS1360 for ClassCallback, TS2345 for the argument, and TS1360 for the void result. -->
<div (class)="onClick"></div>
```

With `strictOutputEventTypes: false`, or `strictTemplates: false`, `$event` is `any`. Type checking
skips the `ClassCallback` and `ResolvedClasses` checks, but it still checks the call itself, so it
still reports a lost `this` (`TS2684`).

The extended diagnostic `uninvokedFunctionInEventBinding` (`NG8111`), which runs only with
`strictTemplates`, doesn't report a `(class)` shorthand, because the shorthand passes its function
on purpose. Calling the function by mistake,
as in `(class)="classes()"`, fails type checking instead. `NG8111` reports `(attr.class)="resolve"`
like any other event binding. It reports neither form on `<ng-container>` or `<ng-template>`.

## Server rendering and hydration

On the server, resolvers run as in the browser, and the HTML carries the resolved classes. When
hydration claims an element that a binding or automatic resolution resolves:

- If the element has static classes, Angular rewrites its `class` attribute to them when it claims
  the element, and the first resolution starts from them. Classes that only the server resolved are
  removed.
- If the element has no static classes, the first resolution starts from the classes the element
  has and removes the ones that no longer resolve. That also removes classes that a directive's
  constructor added.

The same applies to the host element of a root component. A host element that the server didn't
render, such as one that you pass to `createComponent()`, keeps the classes it had, next to the
resolved ones. In a subtree where automatic resolution is off, elements hydrate with the classes
that Angular gives without a resolver.

## Libraries compiled in partial mode

A partial declaration declares `minVersion: "22.3.0"` when:

- Its template has a `(class)` or `(attr.class)` binding, on any element, including
  `<ng-container>` and `<ng-template>`.
- Its host has a `(class)` or `(attr.class)` binding. A host listener with a target, such as
  `(window:class)`, doesn't count.

An older linker, which would compile the binding as a plain listener, rejects the declaration.

## Error conditions

| Code               | When                                                                                                  | Effect                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `NG0320`           | A handler calls `resolve()` twice, or after it returns or throws.                                     | Throws in dev mode. Production ignores a late call and keeps the call that starts last. |
| `NG0320`           | A shorthand callback returns a value that its own `cn` didn't create in this refresh.                 | Throws in dev mode. Production reads the value as a class value.                        |
| `NG0321`           | A `(class)` or `(attr.class)`, in a template or in `host`, is on `<ng-container>` or `<ng-template>`. | Logged with `console.error` in dev mode. The binding does nothing.                      |
| `NG0322`           | A provider below the root declares `withAutoResolution()`, and the root providers don't.              | Throws in dev mode. Production ignores the feature in that provider.                    |
| `NG0323`           | A directive declares a resolver and inherits another one.                                             | Throws in dev mode. Production runs both, the base class's first.                       |
| `NG0600`           | A handler writes a signal.                                                                            | Throws.                                                                                 |
| `NG0100`           | A handler writes a plain field that the element's bindings read.                                      | Reported in an `Eager` view, or with exhaustive `checkNoChanges`.                       |
| `NG5001`           | `@HostListener('class')` or `@HostListener('attr.class')`.                                            | Compile error.                                                                          |
| `NG5001`           | Two resolvers in one `host`, or a chain in a host `(class)`.                                          | Compile error.                                                                          |
| `NG5002`           | Two resolvers on one template element, or a chain in a template `(class)`.                            | Compile error.                                                                          |
| `NG8120`           | A template binding sits next to a directive output of the same name.                                  | Compile-time warning by default.                                                        |
| `NG8121`           | A template binding is on `<ng-container>`.                                                            | Compile error.                                                                          |
| `TS2322`, `TS1360` | A shorthand callback isn't a `ClassCallback`, or returns something other than `ResolvedClasses`.      | Compile error.                                                                          |
| `TS2345`           | An extra isn't a `ClassBindingValue`, or `$event` doesn't fit the handler's parameter.                | Compile error.                                                                          |
| `TS2349`           | A shorthand calls its function instead of passing it.                                                 | Compile error.                                                                          |
| `TS2554`           | A shorthand callback takes no parameter.                                                              | Compile error.                                                                          |
| `TS2684`           | A shorthand calls a method that declares `this` without its receiver.                                 | Compile error.                                                                          |

Without `strictOutputEventTypes`, type checking reports only the errors of the call itself, such
as `TS2684`. JIT compilation throws the `NG5001` and `NG5002` errors with the same messages,
without the code.

## Limitations

- Classes added outside bindings, for example by `Renderer2.addClass()`, `NgClass`, or animations,
  aren't sources, so a resolver can't resolve conflicts with them. Prefer `[class]` over `[ngClass]`
  on these elements.
- Angular stores a `[class]` value as a list sorted by class name, so conflicts inside one `[class]`
  value resolve alphabetically. Extras keep their order, so `(class)="(cn) => cn(value)"` resolves
  `value` in the order you write.
- A directive with an input named or aliased `class`, as spartan-ng uses, receives the template's
  `[class]` binding, so that binding isn't a source. The template's static `class` still is.
- A directive output named `class` makes Angular drop the template's `[class]` binding.
- The `checkNoChanges` pass doesn't run the handlers, so it doesn't verify that they're stable.
- Only the root providers can declare automatic resolution, and a template that Angular created
  before the first `withAutoResolution()` call never gets it.
- A shorthand that reads its callback through a safe read, such as `(class)="choice?.classes"`, can
  call it without `this`, depending on how the compiler emits optional chaining. AOT compilation
  does. Type checking doesn't report it. Use an arrow function field.
- Type checking drops an error that starts at the parameter of an arrow function, so
  `(class)="(cn) => () => cn()"` and `(attr.class)="$event.resolve(cn => cn())"` compile.
- Type checking doesn't report a binding on `<ng-template>`. Only the runtime `NG0321` does.
- If a directive's constructor calls `ViewContainerRef.createEmbeddedView()`, its element can keep
  classes that only the server resolved after hydration.
- The `ngp` compiler backend has known gaps in these checks: the class resolver errors under
  `NG5001`, `NG8120`, `NG8121`, `TS2554` for a shorthand, `NG8111` for `(attr.class)`, and
  `minVersion: "22.3.0"` for a binding on `<ng-container>`.
- Only `class` has a resolver. There's no `(style)` counterpart.

## Tests

```bash
pnpm bazel test //packages/core/test/acceptance/class_resolver:class_resolver //packages/core/test/acceptance/class_resolver:auto_resolution
```

```bash
pnpm bazel test //packages/platform-server/test:test //packages/platform-server/test:class_resolver_auto_hydration_test
```

```bash
pnpm bazel test --local_test_jobs=1 //packages/compiler-cli/test/ngtsc:ngtsc
```

```bash
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/output_shadowed_by_class_resolver:test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/uninvoked_function_in_event_binding:test
```

```bash
pnpm bazel test --test_arg=--filter=r3_view_compiler_class_resolver //packages/compiler-cli/test/compliance/full:full //packages/compiler-cli/test/compliance/linked:linked //packages/compiler-cli/test/compliance/declaration-only:declaration-only //packages/compiler-cli/test/compliance/codegen:codegen
```

- Runtime: [`class_resolver.ts`](../packages/core/src/render3/instructions/class_resolver.ts),
  [`class_resolver_auto.ts`](../packages/core/src/render3/class_resolver_auto.ts), and the specs in
  [`class_resolver/`](../packages/core/test/acceptance/class_resolver).
- Public types: [`interfaces/class_resolver.ts`](../packages/core/src/render3/interfaces/class_resolver.ts)
  and [`class_resolver_provider.ts`](../packages/core/src/render3/class_resolver_provider.ts).
- Hydration:
  [`class_resolver_hydration_spec.ts`](../packages/platform-server/test/class_resolver_hydration_spec.ts)
  and
  [`class_resolver_auto_hydration_spec.ts`](../packages/platform-server/test/class_resolver_auto_hydration_spec.ts).
- Compiler: [`r3_class_resolver.ts`](../packages/compiler/src/render3/r3_class_resolver.ts), the
  `classResolverForm` of listeners in
  [`ingest.ts`](../packages/compiler/src/template/pipeline/src/ingest.ts), type checking in
  [`events.ts`](../packages/compiler/src/typecheck/ops/events.ts), and the compliance cases in
  [`r3_view_compiler_class_resolver`](../packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_class_resolver).
