# Attribute resolvers

Status: experimental (`@experimental 22.3`), proposed in angular/angular#71966 from the
`feat/attribute-resolver` branch of Flarette/angular. Why it works this way: [design decisions](design.md).

An attribute resolver decides the value of one attribute of an element when several sources set
it: the component on the element, its other directives, and the template. Angular collects the
value that each source gives, merges the values with the attribute's resolver, and applies the
result.

Without a resolver, this directive's `[attr.role]` binding overwrites the template's static `role`:

```ts
@Directive({selector: '[menuItem]', host: {'[attr.role]': 'role()'}})
export class MenuItem {
  readonly role = signal('menuitem');
}
```

```html
<li menuItem role="separator"></li>
```

```html
<li menuitem="" role="menuitem"></li>
```

With an `(attr.role)` binding, the template's value wins, because the template has the highest
priority:

```html
<li menuItem role="separator" (attr.role)="$event.resolve($event.resolver())"></li>
```

```html
<li menuitem="" role="separator"></li>
```

You can resolve any attribute that doesn't need sanitization:

- `(attr.x)` resolves the attribute `x`. It's the full form, and it works for every name that Angular can resolve. See [Names](#names).
- `(class)` and `(style)` are shorthands for `(attr.class)` and `(attr.style)`.
- With [automatic resolution](#resolve-every-element-automatically), you don't write the binding:
  Angular resolves `class`, `style`, and the attributes that you list on every element that a
  component or directive matches.

The typical use for `class` is Tailwind CSS. Conflicting utilities, such as `px-4` from the
component and `px-2` from the template, then resolve by the priority of the source that set them,
not by the order of rules in the stylesheet.

## Provide resolvers

`provideAttributeResolvers(resolvers, ...features)` registers the function that merges each
attribute:

```ts
import {joinValues, provideAttributeResolvers} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {twMerge} from 'tailwind-merge';

bootstrapApplication(App, {
  providers: [provideAttributeResolvers({class: twMerge, 'data-labels': joinValues(', ')})],
});
```

The map's keys are attribute names. The value of `class` is a `ClassResolver`, and the value of
any other name is an `AttributeResolver`:

```ts
type ClassResolver = (...classes: string[]) => string;
type AttributeResolver = (...values: string[]) => string | null;
```

- Angular calls a resolver with one argument per entry, from the lowest to the highest priority:
  one per class for `class`, one per declaration for `style`, one per token for a token list, and
  one per contributor for any other attribute. See [Grammars](#grammars).
- Extras that a binding adds come right after the entries of the binding's own source.
- For `class`, Angular splits the returned string on whitespace and drops empty and repeated
  names.
- For a scalar attribute, `null` removes the attribute. For a token list, `''` removes it too.
- For `style`, a `null` result removes the declarations that the resolver manages: those it set
  before, or on the first resolution the element's static styles and, on a hydrated element, the
  properties its sources name. Other declarations stay, unless removing a managed shorthand removes
  them too. Angular doesn't remove the `style` attribute itself.

For example, with a component whose host has `class="px-4 py-2"`:

```html
<ui-card class="px-2" (class)="(cn) => cn()" />
```

```text
resolver arguments: 'px-4', 'py-2', 'px-2'
```

With `twMerge`, the element gets the classes `py-2 px-2`. An empty `class` attribute adds no
argument.

A shadcn-style `cn` fits the `class` contract too:

```ts
import {clsx, type ClassValue} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

```ts
bootstrapApplication(App, {providers: [provideAttributeResolvers({class: cn})]});
```

Angular reads class values before it calls the resolver, so `twMerge` alone is enough.

### Built-in rules

An attribute that no provider names uses the built-in rule of its grammar. Three rules are exported,
so you can name an attribute without writing a function, and one factory creates more:

| Rule                    | Result                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `lastValue`             | The last value, which has the highest priority, or `null` when there's none.                                               |
| `joinTokens`            | The tokens without repeated ones, keeping the first, joined with a space. An argument with several tokens counts as those. |
| `joinDeclarations`      | The declarations joined with `; `.                                                                                         |
| `joinValues(separator)` | The values joined with `separator`, keeping repeated ones, or `null` when there's none.                                    |

```ts
lastValue('a', 'b'); // 'b'
lastValue(); // null
joinTokens('b', 'a b', '', '\tc\n', 'a'); // 'b a c'
joinDeclarations('color: red', 'padding: 4px', 'color: blue'); // 'color: red; padding: 4px; color: blue'
joinValues(' / ')('a', 'b', 'a'); // 'a / b / a'
```

`class` has no exported rule. Its built-in rule is the plain merge: it joins the classes in order,
drops empty and repeated names, keeping each name's first position, and resolves no conflicts.

### Without a provider

Without `provideAttributeResolvers()`, every binding uses the built-in rule of its attribute. For
`class`, the built-in rule merges the collected classes and resolves no utility conflicts. It can
still change the DOM. An element with `class="a" [attr.class]="'b'"` has the class `b`, because the
ordinary attribute write replaces the static class. Adding `(class)="(cn) => cn()"` gives it the
classes `a b`, because the sources join. For other attributes, the built-in rule can also differ
from Angular's behavior without a binding: in the `MenuItem` example, `lastValue` picks the
template's value, where Angular without a binding keeps the directive's.

A key whose value is `undefined` provides the built-in rule.

### Where a provider applies

Each binding looks the resolver of its attribute up from its element's injector when Angular
creates the element. To resolve a component's template and its own host binding with another
resolver, provide it in `viewProviders`:

```ts
@Component({
  selector: 'ui-panel',
  viewProviders: [provideAttributeResolvers({class: panelMerge})],
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

### Nested providers

Angular looks each name up separately, through the element's injectors and then its environment
injector, such as a lazy route's. A call that doesn't name an attribute leaves that attribute's
resolver to the injectors above it:

```ts
@Component({
  selector: 'ui-menu',
  imports: [MenuItem],
  providers: [provideAttributeResolvers({role: joinValues('+')})],
  template: `<li
    menuItem
    role="separator"
    class="item"
    (class)="(cn) => cn()"
    (attr.role)="$event.resolve($event.resolver())"
  ></li>`,
})
export class UiMenu {}
```

```ts
bootstrapApplication(App, {
  providers: [provideAttributeResolvers({class: markRoot, role: joinValues('-')})],
});
```

```html
<li menuitem="" role="menuitem+separator" class="item by-root"></li>
```

`class` comes from the root call, and `role` from `UiMenu`'s call. Here `markRoot` appends
`by-root` to the classes.

Within one injector, a later call replaces only the names that it names:

```ts
providers: [
  provideAttributeResolvers({class: markFirst, role: joinValues('-')}),
  // Replaces `role`. `class` stays `markFirst`.
  provideAttributeResolvers({role: joinValues('+')}),
];
```

`provideAttributeResolvers()` reads the map when you call it. Changing the object afterward
changes nothing.

### Names

- Names match as written, so `viewBox` and `viewbox` are two attributes with their own resolvers.
- A namespaced attribute, such as `xlink:title`, can't be resolved.
- An attribute whose name starts with `on`, in any letter case, can't be resolved. That covers event
  handler attributes, such as `onclick`, and names that aren't events, such as `onboarding`. In dev
  mode, a key for one throws:

  ```text
  `provideAttributeResolvers` can't resolve the `onclick` attribute, because Angular never resolves
  an event handler attribute. Remove its key.
  ```

See also [Attributes that need sanitization](#attributes-that-need-sanitization).

## Grammars

The attribute's name decides how Angular reads its sources, merges them without a provider, and
applies the result:

| Grammar      | Attributes                                                                                                | One entry is                          | Built-in rule      | Applied by                                       |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------ | ------------------------------------------------ |
| Class list   | `class`                                                                                                   | a class name                          | plain merge        | adding and removing the classes that changed     |
| Declarations | `style`                                                                                                   | a declaration, such as `padding: 4px` | `joinDeclarations` | setting and removing the properties that changed |
| Token list   | `rel`, `part`, `headers`, `aria-describedby`, `aria-controls`, `aria-owns`, `aria-flowto`, `aria-details` | a token                               | `joinTokens`       | setting the attribute, or removing it for `''`   |
| Scalar       | every other name, including `id`, `role`, `title`, `aria-labelledby`, and `data-*`                        | the value of one contributor          | `lastValue`        | setting the attribute, or removing it for `null` |

The token list names match as written, in lowercase.

### Class list

- Static classes split on any whitespace, including a no-break space. `[attr.class]` strings split
  on ASCII whitespace only. A `[class]` string splits at every character up to U+0020.
- Angular applies the difference between the classes it applied last time and the new result.

### Declarations

- When Angular initially collects the sources, each source holds at most one declaration per
  property, written `property: value` or `property: value !important`. A resolver can return
  repeated properties, and the folded sources then keep them. See
  [Several resolvers on one element](#several-resolvers-on-one-element).
- Property names are written as CSS names them: dash case in lowercase, such as `font-size` for
  `fontSize` and `color` for `COLOR`, a vendor prefix with its leading dash, such as `-webkit-transform` for
  `WebkitTransform`, `float` for `cssFloat`, and a custom property as written. CSS escapes in a
  name are decoded.
- A declaration marked `!important` beats a later declaration of the same property that isn't,
  and a later removal. A later `!important` declaration replaces an earlier one.
- Angular applies the resolved declarations in order, property by property. A longhand that comes
  after its shorthand lands after it, and a declaration that overlaps a changed one is written
  again. Styles that something else set, such as `Renderer2.setStyle()` or an animation, stay,
  unless a managed shorthand write or removal affects them. For example, an outside
  `padding-left: 9px` is lost when a managed `padding: 4px` changes to `padding: 8px`.
- An empty custom property, such as `--x: ;`, is kept. An ordinary property with an empty value is
  dropped.

### Token list

- Each source holds its tokens, split on ASCII whitespace. Repeated tokens stay in the sources.
- Different tokens from two directives aren't a conflict, so they don't warn.

### Scalar

- Each contributor, the template or one directive, gives at most one value: its static value, or
  its `[attr.x]` binding's value while that isn't `null` or `undefined`.
- A source has one entry per directive that gives a value.
- In dev mode, Angular warns when two directives give different values. See
  [Conflicting directive values](#conflicting-directive-values).

## Write a binding

### The full form: `(attr.x)`

`(attr.x)` gives its handler a resolve event as `$event`:

```ts
interface AttributeResolveEvent {
  readonly sources: AttributeSources;
  resolver(...extras: AttributeValue[]): ResolvedAttribute;
  resolve(value: AttributeValue | ResolvedAttribute | null): void;
}

type AttributeValue = string | (readonly string[] & {readonly call?: never});
```

The `call` member rejects functions, which an array type alone can't.

- `sources` holds the entries of each source. See [The sources](#the-sources).
- `resolver(...extras)` merges the sources with extras, using the attribute's resolver.
- `resolve(value)` sets the attribute to exactly `value`. An array joins with a space. `null`
  removes the attribute, and so does `''` for a token list.

`class` and `style` have their own events, with the same members and their own value types:

| Attribute    | `$event`                | Extras and `resolve()` take                       |
| ------------ | ----------------------- | ------------------------------------------------- |
| `class`      | `ClassResolveEvent`     | `ClassBindingValue`                               |
| `style`      | `StyleResolveEvent`     | `StyleBindingValue`                               |
| another name | `AttributeResolveEvent` | `AttributeValue`: a string or an array of strings |

The minimal binding resolves with the attribute's resolver and no extras:

```html
<li menuItem role="separator" (attr.role)="$event.resolve($event.resolver())"></li>
```

A handler can compute the value from component state instead:

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

- If the handler doesn't call `resolve()`, the attribute takes the built-in rule of its grammar
  applied to the sources, without the app's resolver. For `class`, the element keeps the classes
  of its sources.
- The handler's return value is ignored.
- A chain is allowed: `(attr.role)="count(); $event.resolve($event.resolver())"`.
- `(attr.x)` never listens to a DOM event named `attr.x`.

Each refresh creates a new event. Call `resolve()` at most once, while the handler runs:

- In dev mode, a second call throws `NG0320`, and so does a call after the handler returns or
  throws. A call from a getter or a proxy that `resolve()` reads counts as a second call. The
  message names the binding's form:

  ```text
  NG0320: The `(attr.role)` handler called `resolve()` more than once. Call it at most once.
  ```

  ```text
  NG0320: The `(attr.role)` handler called `resolve()` after it returned. Call it while the
  handler runs.
  ```

- In production, a call after the handler returns is ignored. If the handler calls `resolve()` more
  than once, the call that starts last wins.

### Shorthands: `(class)` and `(style)`

The shorthands take a callback. Angular calls the callback with the element's resolver bound to its
sources, and applies what the resolver returns:

```html
<ui-button class="px-2" (class)="(cn) => cn('shadow-lg', busy() && 'opacity-50')" />
<div style="color: red" (style)="(s) => s({width: size()})"></div>
```

`(class)="F"` means:

```html
<ui-button (attr.class)="$event.resolve((F)($event.resolver))" />
```

`(style)="F"` means the same with `(attr.style)`. Other attributes have no shorthand.

`F` is one expression whose value is a callback:

```ts
type ClassCallback = (cn: BoundClassResolver) => ResolvedAttribute;
type BoundClassResolver = (...extras: ClassBindingValue[]) => ResolvedAttribute;

type StyleCallback = (s: BoundStyleResolver) => ResolvedAttribute;
type BoundStyleResolver = (...extras: StyleBindingValue[]) => ResolvedAttribute;
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
compile error. Use the full form to run more than one statement.

### Extras

The arguments that you pass to the resolver are extras. The resolver adds them at the end of the
source of the binding that calls it, and merges:

- In a template, extras rank after the template's own entries.
- In a component's `host`, they rank at the end of the component source, so the consumer's
  template entries still win over them.
- In another directive's `host`, they rank at the end of the directives source.

`ClassBindingValue` and `StyleBindingValue` are the input types of the resolver. The resolver reads
each extra by the rules below, which differ from `[class]` and `[style]` in some cases. For example,
an extra `false` for `class` is valid, where `[class]="false"` throws in dev mode, and a `style`
array entry such as `'color: red'` is a declaration, where `[style]` reads it as a property name.
The resolver reads each extra this way:

- `class`: a string splits on whitespace, an array or a `Set` lists class names, an object map
  keeps the keys whose values are truthy, and `null`, `undefined`, `false`, and `''` add nothing.
  So `cn(active() && 'ring')` works. A name that contains a space, such as the array entry `'a b'`,
  is dropped.
- `style`: a string holds declarations separated by semicolons, an array lists such strings, an
  object map keeps the properties whose values aren't `null`, `undefined`, or `''`, and a trusted
  style, such as one from `DomSanitizer.bypassSecurityTrustStyle()`, reads as its string.
- A token list: a string splits into tokens, and an array joins with a space first.
- A scalar: a string is one value, and an array joins with a space into one value.

With `provideAttributeResolvers({role: (...values) => values.join('+')})`:

```html
<li menuItem role="separator" (attr.role)="$event.resolve($event.resolver('a', ['b', 'c']))"></li>
```

```html
<li menuitem="" role="menuitem+separator+a+b c"></li>
```

An extra that repeats an entry of the sources is still its own argument.

### `ResolvedAttribute`

The resolver of an event returns a `ResolvedAttribute`. It's an opaque value, and only the resolver
of the current event creates one. It's valid only as the argument of that event's `resolve()`:

- A shorthand callback must return the value that its own resolver gives it. Type checking rejects
  a callback that returns anything else, such as a string. In dev mode, Angular throws `NG0320`:

  ```text
  NG0320: The `(class)` callback returned a value that its own resolver didn't create. Return the
  result of the resolver that the callback receives, such as `(cn) => cn('px-4')`.
  ```

- A result of another event, such as another element's, another attribute's, or one kept from an
  earlier refresh, throws `NG0320` in dev mode, in both forms:

  ```text
  NG0320: The `(attr.role)` handler passed `resolve()` a result that belongs to another resolve
  event. A result is valid only in the `resolve()` of the event whose `resolver()` created it.
  ```

  A shorthand's message reads "The \`(class)\` callback returned a result that belongs to another
  resolve event".

- A result passed as an extra throws `NG0320` in dev mode:

  ```text
  NG0320: The `(attr.role)` handler passed a result to `resolver()`. A result belongs to the
  resolve event that created it and is valid only in that event's `resolve()`. Pass values as
  extras.
  ```

- A function passed to `resolve()` or as an extra throws `NG0320` in dev mode:

  ```text
  NG0320: The `(attr.role)` handler passed a function to `resolve()`, which doesn't read
  functions. Pass the value that the function computes.
  ```

- Production skips these checks. A result of the same grammar reads as its value, and a result of
  another grammar reads as no value. A string that a shorthand returns reads as a value. A function
  reads as its source text for a scalar or token list, and as no value for `class` and `style`.

This makes every shorthand go through the app's resolver, so its result is always the merge of the
sources and its extras. To set an attribute directly, use the full form.

## The sources

`$event.sources` has three slots, ordered from the lowest to the highest priority:

```ts
type AttributeSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
];
```

`ClassSources` has the same shape. Angular builds the sources with these rules:

1. A missing source is an empty array.
1. `component` holds the entries of the component on the element and of its host directives,
   which Angular matches before the component.
1. `directives` holds the entries of all other directives, in the order Angular matched them. That
   order follows the consuming component's `imports`.
1. `template` holds the element's own entries.
1. Each contributor's entries come from its static attribute and its bindings of the attribute:

   | Attribute    | Bindings that are sources, in order within a contributor |
   | ------------ | -------------------------------------------------------- |
   | `class`      | `[class]`, then `[class.name]`, then `[attr.class]`      |
   | `style`      | `[style]`, then `[style.property]`, then `[attr.style]`  |
   | another name | `[attr.x]`                                               |

1. A translated static attribute, such as `title="Save" i18n-title`, and a translated attribute
   interpolation, such as `attr.title="Hi {{ name() }}" i18n-attr.title`, count as the template's
   value.
1. For `class` and `style`, each class or property appears once, under the source and at the
   position of the highest-priority binding that has an opinion about it. A falsy class value, such
   as `false`, `null`, `''`, or `0`, removes the class from every lower-priority source. A `null` or
   `''` style value removes the property. `undefined` defers to a lower priority.
1. On an element that resolves an attribute, its `[attr.x]` bindings don't write the attribute.
   Only the resolver does.

A property binding that writes the same attribute, such as `[title]` or `title="{{ hint }}"`, isn't
a source. See [Property bindings that bypass a resolver](#property-bindings-that-bypass-a-resolver).

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

For `style`, with a component whose host has `[style.width.px]="10"` and
`[attr.style]="'height: 1px'"`:

```html
<ui-box style="color: blue" (attr.style)="capture($event)" />
```

```text
$event.sources: [['width: 10px', 'height: 1px'], [], ['color: blue']]
```

For a token list, with these directives:

```ts
@Directive({selector: '[hint]', host: {'aria-describedby': 'hint shared'}})
export class Hint {}

@Directive({selector: '[errors]', host: {'[attr.aria-describedby]': 'ids()'}})
export class Errors {
  readonly ids = signal('shared error');
}
```

```html
<input hint errors (attr.aria-describedby)="$event.resolve($event.resolver())" />
```

```text
$event.sources: [[], ['hint', 'shared', 'shared', 'error'], []]
```

```html
<input hint="" errors="" aria-describedby="hint shared error" />
```

For a scalar, with a component whose host binds `[attr.id]` to `'cmp'`:

```html
<ui-item id="tpl" (attr.id)="capture($event)" />
```

```text
$event.sources: [['cmp'], [], ['tpl']]
```

When the component's binding becomes `null`, the sources become `[[], [], ['tpl']]`. A directive
with both a static value and a binding falls back to its static value while the binding is `null`
or `undefined`.

## Attributes that need sanitization

A resolved value doesn't go through Angular's sanitizer, so an attribute whose value is a URL, HTML,
or a script can't be resolved. `style` can, because `[style]` bindings aren't sanitized either.

- In a template, `(attr.x)` is a compile error when `x` needs sanitization on that element:

  ```text
  Can't resolve the 'href' attribute of <a>, because its value needs sanitization.
  ```

  That covers, for example, `href` on `<a>` in HTML and SVG and on `<mi>` in MathML, `srcdoc` and
  `sandbox` on `<iframe>`, and `src` on `<embed>`. `(attr.src)` on `<img>` compiles, and its
  sources read a trusted URL as its string.

- In `host`, the element isn't known, so `(attr.x)` is a compile error when `x` needs sanitization
  on any element:

  ```text
  Can't resolve the 'href' attribute in a host binding, because its value needs sanitization on
  some elements.
  ```

- An event handler attribute is a compile error everywhere:

  ```text
  Can't resolve the event attribute 'onclick' for security reasons.
  ```

- A namespaced attribute is a compile error everywhere:

  ```text
  Can't resolve the namespaced attribute 'xlink:title'. Only attributes without a namespace can be
  resolved.
  ```

- Automatic resolution checks each element by its tag and namespace, also in production. It skips
  `href` on `<a>` and resolves it on `<div>`. On a host created in code, it reads the element's
  local name and namespace. If the element doesn't tell its namespace, as an element from a
  custom renderer can fail to, only `class` and `style` resolve there.

## Resolve a component's host element

A component can resolve the attributes of its own host element, so its consumers don't need a
binding:

```ts
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

The full form works in `host` too, for any name that Angular can resolve. Directives and host
directives declare resolvers the same way:

```ts
@Component({
  selector: 'ui-disclosure',
  host: {'(attr.aria-expanded)': "$event.resolve(open() ? 'true' : 'false')"},
  template: '<ng-content />',
})
export class UiDisclosure {
  readonly open = signal(false);
}
```

### Declaration rules

The compile errors below use the attribute's name. JIT compilation throws them with the same
messages when it compiles the component or directive.

- Declare a resolver in `host`. `@HostListener('class')`, `@HostListener('style')`, and
  `@HostListener('attr.x')` are compile errors:

  ```text
  @HostListener('attr.role') can't declare a role resolver. Bind it in the host metadata instead:
  host: {'(attr.role)': 'onRole($event)'}.
  ```

  For an attribute that can't be resolved at all, such as `@HostListener('attr.xlink:href')`, the
  error says why instead, as it does for `host`. Angular reads the name the way it reads a `host`
  key, so whitespace around the colon doesn't change the result.

  `@HostBinding('class')` and `@HostBinding('attr.role')` still bind values, which become sources.

- A directive has at most one resolver per attribute. `(class)` and `(attr.class)` in one `host`
  object are a compile error, and so are `(style)` and `(attr.style)`:

  ```text
  Can't have multiple class resolvers in one host. Use only one '(class)' or '(attr.class)' binding.
  ```

  One `host` can resolve several attributes, such as `(class)` and `(attr.role)`.

- A directive inherits its base class's resolvers. If it also declares its own for the same
  attribute, dev mode throws `NG0323` when Angular first creates a template that uses it, because
  the compiler can't always see the base class's host bindings:

  ```text
  NG0323: `Sub` has more than one class resolver, through inheritance. A directive can have at most
  one `(class)` or `(attr.class)` binding in its host, including the ones it inherits from its base
  classes.
  ```

- A template element has at most one resolver per attribute. A second one is a compile error, on
  `<ng-container>` and `<ng-template>` too:

  ```text
  Can't have multiple role resolvers on one element. Use only one '(attr.role)' binding.
  ```

- A shorthand must be a single expression, in a template and in `host`:

  ```text
  A '(class)' shorthand must be a single expression, a function that receives the resolver. Bind
  '(attr.class)' to run more than one statement.
  ```

## Several resolvers on one element

An element can have one resolver per attribute per directive and one from its template. Angular
runs the resolvers of one attribute from the lowest to the highest priority:

1. The component's host directives, then the component.
1. The other directives, in match order.
1. The template.

- The lowest resolver receives the sources as Angular collected them.
- Angular folds what each resolver resolves back into sources for the next one. An entry that the
  result leaves out is gone for the resolvers above it. The fold keeps every declaration that the
  result holds, so a resolver that returns `color: red; color: blue` gives the next resolver both.
- The highest resolver's result becomes the attribute's value.

The fold depends on the grammar:

| Grammar      | Where an entry of the result goes                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Class list   | A class keeps the source it had. A new class goes to the resolver's own source: `component` for the component and its host directives, `directives` for other directives, `template` for the template. |
| Declarations | A declaration keeps the source that had the same declaration. A new one goes to the resolver's own source.                                                                                             |
| Token list   | A token keeps the highest-priority source that had it. A new one goes to the resolver's own source.                                                                                                    |
| Scalar       | The value replaces the sources. It goes to the highest-priority source that gave it, or else to the resolver's own source. `null` leaves the sources empty.                                            |

For example, a directive that resolves `role` itself replaces the template's value for the
resolvers above it:

```ts
@Directive({selector: '[tab]', host: {'(attr.role)': `$event.resolve('tab')`}})
export class Tab {}
```

```html
<li tab role="separator" (attr.role)="$event.resolve($event.resolver())"></li>
```

```text
Collected:   [[], [], ['separator']]
Tab:         resolve('tab')
Folded:      [[], ['tab'], []]
Template:    lastValue('tab')
```

```html
<li tab="" role="tab"></li>
```

Because extras rank in the caller's source, a component's extra is a default that the consumer
overrides. With the `UiButton` above, `provideAttributeResolvers({class: twMerge})`, and this
consumer:

```html
<ui-button [disabled]="true" class="px-2 bg-red-600" (class)="(cn) => cn('shadow-lg')" />
```

```text
Collected:        [['inline-flex', 'h-9', 'px-4', 'bg-primary'], [], ['px-2', 'bg-red-600']]

UiButton, cn('bg-muted')
  twMerge input:  'inline-flex', 'h-9', 'px-4', 'bg-primary', 'bg-muted', 'px-2', 'bg-red-600'
  result:         'inline-flex h-9 px-2 bg-red-600'
  folded:         [['inline-flex', 'h-9'], [], ['px-2', 'bg-red-600']]

Template, cn('shadow-lg')
  twMerge input:  'inline-flex', 'h-9', 'px-2', 'bg-red-600', 'shadow-lg'
  result:         'inline-flex h-9 px-2 bg-red-600 shadow-lg'
```

A lower resolver beats a higher source only by removing that source's entry, because the resolvers
above it never see the entry again. To drop a consumer's value on purpose, filter `$event.sources`
in a full-form handler and pass the rest to `resolve()`.

## Resolve every element automatically

`withAutoResolution()` makes Angular resolve elements without a binding:

```ts
bootstrapApplication(App, {
  providers: [provideAttributeResolvers({class: twMerge, role: lastValue}, withAutoResolution())],
});
```

```html
<!-- A component matches: resolved. -->
<ui-button class="px-4" />
<!-- A directive matches: class and role resolved. -->
<li menuItem role="separator"></li>
<!-- No component or directive: not resolved. -->
<span class="px-2 px-4"></span>
```

```html
<li menuitem="" role="separator"></li>
```

- Automatic resolution covers `class`, `style`, and the names of every `provideAttributeResolvers()`
  call with `withAutoResolution()` in root providers that turn it on. Calls below the root, and
  calls without the feature, change resolvers but never add names.
- It resolves every element that a component or directive matches. That includes components
  created in code, such as routed components and components that you create with
  `ViewContainerRef.createComponent()` or `createComponent()`, with their host directives.
- It skips an attribute that needs sanitization on the element. See
  [Attributes that need sanitization](#attributes-that-need-sanitization).
- Each attribute takes its resolver from `provideAttributeResolvers()`, or its built-in rule when no
  provider names it. So `provideAttributeResolvers({}, withAutoResolution())` resolves `class` with
  the plain merge and `style` with `joinDeclarations`.
- Angular calls a resolver with the entries of the sources and no extras, and calls it again only
  when the entries of a source change.
- An attribute that no source of the element sets isn't touched, so a value that a constructor set
  stays. `class` is the exception: an element without class sources resolves once, with no
  arguments.
- An attribute with a resolver binding, in the template or in the `host` of a directive on the
  element, is resolved only through its bindings. Automatic resolution doesn't run on that
  attribute, even when the handler doesn't call `resolve()`. The binding's handler runs on every
  refresh, because it can read other state.

### Turn it off for a subtree

Declare the feature in the root providers, such as those of `bootstrapApplication()` or of
`TestBed.configureTestingModule()`. Below the root, to turn it off for a component's template,
provide `withAutoResolution(false)`. To turn it back on, provide `withAutoResolution()`. A call
without the feature keeps the setting of the providers above it, whichever resolvers it names.

```ts
@Directive({selector: '[tone]', host: {class: 'px-2'}})
export class Tone {}

@Component({
  selector: 'modern-card',
  imports: [Tone],
  // Back on in this template.
  viewProviders: [provideAttributeResolvers({class: twMerge}, withAutoResolution())],
  template: `<div tone class="px-4"></div>`,
})
export class ModernCard {}

@Component({
  selector: 'legacy-table',
  imports: [ModernCard, Tone],
  // Off in this template.
  providers: [provideAttributeResolvers({class: twMerge}, withAutoResolution(false))],
  template: `<modern-card tone class="px-4" />`,
})
export class LegacyTable {}
```

```text
<modern-card> classes: px-2, px-4
<div> in ModernCard classes: px-4
```

- The setting applies to the component's template and to the templates nested in it. In an off
  template, elements get the values that Angular gives without a resolver, and resolver bindings
  still resolve.
- In an on template, automatic resolution uses the resolvers that the template's view sees. A
  resolver binding looks its resolver up from its element's injector instead.
- An element follows the template that declares it. In the example, `<modern-card>` isn't resolved,
  because `LegacyTable`'s template declares it, but the `<div>` in `ModernCard`'s template is.
- An embedded view follows the template that declares its `<ng-template>`, wherever you insert it.
- A component created in code follows the injector where you create it. A route's `providers` can
  turn the feature off, or back on with another resolver, for the components it creates.

If a provider below the root turns the feature on while the root providers don't, dev mode throws
`NG0322`. That includes root providers that turn it off. Production ignores the feature in that
provider.

```text
NG0322: Automatic resolution is turned on for `ModernCard` by `withAutoResolution()` in providers
below the root, but the root providers don't declare it. Provide
`provideAttributeResolvers({class: resolver}, withAutoResolution())` in the root providers, such as
those of `bootstrapApplication()`.
```

### Turn it on before the first render

Angular sets up an element for automatic resolution when it first creates the element's template,
and it caches that setup with the component. It sets up the names that are listed by then. The
feature's hooks turn on when you call `withAutoResolution()`. That call enables the hooks, and it
doesn't list the custom names. A root's names are listed when Angular first evaluates the root's
automatic-resolution setting, which happens during a component's setup after the check that the
effective setting is on. Creating the first component through an injector where the feature is off
therefore leaves the root's custom names unlisted. So:

- A template that Angular created before the first `withAutoResolution()` call never gets
  automatic resolution in that JavaScript process, in any app.
- A template that Angular created before a root listed a name never resolves that name, in any
  app. To list a custom name, create a component through an injector where the feature is on
  before the first creation of any template that needs the name.

An app whose root providers call `withAutoResolution()` before its first render isn't affected. Two
cases are:

- Several apps in one process, where an app without the feature, or with fewer names, renders a
  shared component first.
- Tests, where an earlier test renders a component before a later test provides the feature or a
  name. Call `withAutoResolution()` in your test setup file, before any test renders, to enable the
  hooks. That call doesn't list custom names. To list them, provide them with the feature on in the
  root providers of the test that renders first. Calling `withAutoResolution()` in setup alone
  doesn't turn automatic resolution on in a test whose root providers don't provide it.

Angular gives no signal, in dev mode or in production: the affected elements keep their values
unresolved.

## When handlers run

Angular calls an element's handlers on every refresh of the view that declares the element, after
the view's host bindings and before its child components. It then applies the difference between
the value it applied last time and the new result:

- `class`: it adds and removes classes. Classes that something else added, for example
  `Renderer2.addClass()` or an animation, stay.
- `style`: it sets and removes properties in the resolved order. Properties that something else
  set, for example `Renderer2.setStyle()` or an animation, stay, unless a managed shorthand write or
  removal affects them. See [Declarations](#declarations).
- Another attribute: it sets or removes the attribute only when the resolved value changes.

Angular calls the handler while it renders the view, like a template expression:

- Signals that the handler reads are tracked, so a change to them schedules a refresh.
- Writing a signal in the handler throws `NG0600`.
- Writing a plain field that the element's own bindings read leaves the element out of date. An
  `OnPush` view, the default, doesn't report it. Dev mode reports it as `NG0100` in an `Eager` view,
  and `provideCheckNoChangesConfig({exhaustive: true})` reports it in any view.

In an embedded view, such as an `@if` or `@for` block, each view resolves its own elements, and the
handler reads that view's context, such as the `@for` item.

Write the handler as a function of its sources and the state it reads.

## Conflicting directive values

In dev mode, when two directives on one element give different values for a resolved scalar,
Angular logs `NG0324` with `console.warn`, once per element and attribute. The template's value
doesn't count, and the warning appears with any resolver, including `joinValues()`:

```text
NG0324: Directives `TestId` and `BoundTestId` set different values for the `data-testid`
attribute of an element: `static-id` and `bound-id`. Reconcile the values that the directives
contribute, for example by setting the attribute in only one of them.
```

The resolver still runs. With `lastValue`, the later directive's value wins. Token lists never
warn.

## Property bindings that bypass a resolver

A property binding isn't a source, but it still writes the attribute, and its later writes can stay
in the DOM while the resolved value doesn't change. The extended diagnostic
`propertyBindingBypassesResolver` (`NG8122`), a warning by default, reports one next to a resolver
of the same attribute:

```html
<button [title]="hint" (attr.title)="$event.resolve($event.resolver('Save'))"></button>
```

```text
The `title` property binding writes the `title` attribute, which the element's `(attr.title)`
binding resolves. The resolver doesn't receive the binding's value, and the binding's later writes
can stay in the DOM while the resolved value doesn't change. Bind `[attr.title]` instead to make
the value a source of the resolver.
```

Bind `[attr.title]` instead. For `class` and `style`, `[class]`, `[class.x]`, `[style]`, and
`[style.x]` are sources too.

- It checks properties that map to an attribute of another name, such as `[className]` for
  `class` and `[tabIndex]` for `tabindex`, interpolations such as `title="{{ hint }}"`, translated
  interpolations, and ARIA bindings such as `[aria-label]`.
- It checks the host bindings and host resolvers of the element's directives, including the ones
  that a directive inherits from local base classes, when `typeCheckHostBindings` is on, the
  default. It reports a host binding on the element, once per template.
- A binding that a directive input claims isn't reported, because it never writes the DOM.
- It runs only with `strictTemplates`, like every extended diagnostic.

## Directive outputs that a resolver binding shadows

A resolver binding always resolves its attribute, in a template and in `host`, even next to a
directive output of the same name: `(class)` next to an output named `class`, `(style)` next to
`style`, and `(attr.role)` next to `attr.role`. That includes a host directive's output that the
component exposes under that name. The binding never listens to the output, and type checking gives
`$event` the resolve event's type, not the output's type.

The extended diagnostic `outputShadowedByAttributeResolver` (`NG8120`), a warning by default,
reports such a binding in a template. It runs only with `strictTemplates`:

```text
The `(class)` binding resolves the element's classes, so it doesn't listen to the `class` output of
`Emitter`. Rename the output to listen to it.
```

For another attribute, the message reads "resolves the element's \`role\` attribute". Rename the
output to listen to it.

## `<ng-container>` and `<ng-template>`

These elements aren't rendered, so they have no attributes to resolve. A resolver binding on them
does nothing, and it doesn't listen to a directive output either.

- At compile time, the TypeScript compiler reports `NG8121`, an error, for a binding on
  `<ng-container>`, also inside `<svg>` or `<math>`:

  ```text
  The '(attr.role)' binding can't resolve the 'role' attribute on '<ng-container>' or
  '<ng-template>', because neither is rendered as an element. Bind it on an element instead.
  ```

  For `class`, the message reads "can't resolve classes". Type checking doesn't see a binding on
  `<ng-template>` itself.

- At runtime, dev mode logs `NG0321` with `console.error` when Angular creates the binding. This
  also covers a binding on `<ng-template>` and a directive's host binding on these elements, which
  type checking can't see. The handler never runs.

  ```text
  NG0321: The `(class)` binding can't resolve classes on `<ng-container>` or `<ng-template>`,
  because neither is rendered as an element. Bind it on an element instead.
  ```

  ```text
  NG0321: The `(attr.role)` host binding of `Recorder` can't resolve the `role` attribute on
  `<ng-container>` or `<ng-template>`, because neither is rendered as an element. Apply `Recorder`
  to an element instead.
  ```

### Other names

- An event with a target, such as `(window:class)` or `(document:class)`, is an ordinary listener,
  in a template, in `host`, and in `@HostListener`.
- `[(class)]` is a two-way binding to an input named `class`, not a resolver.

## Type checking

With `strictOutputEventTypes`, which `strictTemplates` turns on by default:

- `$event` is a `ClassResolveEvent` for `class`, a `StyleResolveEvent` for `style`, and an
  `AttributeResolveEvent` for any other name, in both forms, in a template and in `host`.
- Angular checks a shorthand `(class)="F"` as the call that runs,
  `$event.resolve((F)($event.resolver))`, with two more checks: `F` must satisfy `ClassCallback`,
  and the call's result must satisfy `ResolvedAttribute`. `(style)` is checked the same way, with a
  callback that receives `StyleResolveEvent['resolver']`.
- Extras and `resolve()` arguments must fit the attribute's value type. For example,
  `$event.resolve(false)` fits `class` but not `role`, a `Set` fits `class` but not `role`, and
  `style` rejects numbers, booleans, and functions.

The parameter of an arrow function gets the resolver's type, whatever you name it. The checks catch
these mistakes:

| Template                                                  | Error                                                     |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `(class)="(cn) => 'x'"`                                   | `TS2322` and `TS1360`: a string isn't `ResolvedAttribute` |
| `(class)="(cn) => cn(42)"`                                | `TS2345`: `42` isn't a `ClassBindingValue`                |
| `(class)="classes()"`, where `classes()` returns a string | `TS2349` and `TS1360`: a string isn't callable            |
| `(class)="() => saved"`                                   | `TS2554`: the callback takes no parameter                 |
| `(class)="choice?.classes"`, with a nullable `choice`     | `TS1360`: `undefined` isn't a `ClassCallback`             |
| `(style)="(s) => 'x'"`                                    | `TS2322` and `TS1360`: a string isn't `ResolvedAttribute` |
| `(attr.role)="$event.resolve(false)"`                     | `TS2345`: `false` isn't an `AttributeValue`               |
| `(attr.role)="count($event)"`, with `count(n: number)`    | `TS2345`: `AttributeResolveEvent` isn't a `number`        |

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

With `strictOutputEventTypes: false`, `$event` is `any`. `strictTemplates` supplies the default of
that option. An explicit `strictOutputEventTypes: true` keeps the resolver's event checks when
`strictTemplates` is `false`, in the parts of a template that Angular checks; it doesn't restore the
checks of `<ng-template>` and control flow bodies that `strictTemplates: false` turns off. Type checking skips the callback, result, and value checks, but it still checks the
call itself and the ordinary expressions, so it still reports a lost `this` (`TS2684`).

The extended diagnostic `uninvokedFunctionInEventBinding` (`NG8111`), which runs only with
`strictTemplates`, doesn't report a `(class)` or `(style)` shorthand, because the shorthand passes
its function on purpose. Calling the function by mistake, as in `(class)="classes()"`, fails type
checking instead. `NG8111` reports `(attr.class)="resolve"` like any other event binding. It reports
no resolver on `<ng-container>` or `<ng-template>`.

## Server rendering and hydration

On the server, resolvers run as in the browser, and the HTML carries the resolved values. Resolved
styles serialize in the order that they resolve to. When hydration claims an element that a
binding or automatic resolution resolves, the first resolution in the browser reconciles the
server's value:

- `class`:
  - If the element has static classes, Angular rewrites its `class` attribute to them when it
    claims the element, and the first resolution starts from them. Classes that only the server
    resolved are removed.
  - If the element has no static classes, the first resolution starts from the classes the
    element has and removes the ones that no longer resolve. That also removes classes that a
    directive's constructor added.
- `style`:
  - If the element has no static styles, the first resolution removes every property that its
    sources name and the result doesn't set. Other properties, such as one that a constructor set,
    stay.
  - If the element has static styles, Angular rewrites its `style` attribute to them when it claims
    the element. Styles that only the server resolved or that only the server's constructor set
    are lost.
- Another attribute: the first resolution compares the result with the server's value, and sets
  or removes the attribute when they differ.

The same applies to the host element of a root component. A host element that the server didn't
render, such as one that you pass to `createComponent()`, keeps the classes it had, next to the
resolved ones. In a subtree where automatic resolution is off, elements hydrate with the values
that Angular gives without a resolver.

## Libraries compiled in partial mode

A partial declaration declares `minVersion: "22.3.0"` when:

- Its template has a resolver binding, `(class)`, `(style)`, or `(attr.x)`, on any element,
  including `<ng-container>` and `<ng-template>`.
- Its host has a `(class)`, `(style)`, or `(attr.x)` binding. A host listener with a target, such as
  `(window:class)`, doesn't count.

An older linker, which would compile the binding as a plain listener, rejects the declaration.

The linker and JIT compilation read every host listener named `class`, `style`, or `attr.x` as a
resolver, also in a declaration from an older library. They check its name, so a host
`(attr.href)` or `(attr.xlink:title)` listener from an older library throws with the messages in
[Attributes that need sanitization](#attributes-that-need-sanitization).

## Error conditions

| Code               | When                                                                                                                              | Effect                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `NG0320`           | A handler calls `resolve()` twice, or after it returns or throws.                                                                 | Throws in dev mode. Production ignores a late call and keeps the call that starts last.               |
| `NG0320`           | A shorthand callback returns a value that its own resolver didn't create.                                                         | Throws in dev mode. Production reads the value as a value.                                            |
| `NG0320`           | A handler passes `resolve()` a result of another event, or passes a result as an extra.                                           | Throws in dev mode. Production reads a result of the same grammar as its value and any other as none. |
| `NG0320`           | A handler passes a function to `resolve()` or as an extra.                                                                        | Throws in dev mode. Production reads it as its source text for a scalar or token list, else as none.  |
| `NG0321`           | A resolver binding, in a template or in `host`, is on `<ng-container>` or `<ng-template>`.                                        | Logged with `console.error` in dev mode. The binding does nothing.                                    |
| `NG0322`           | A provider below the root turns automatic resolution on, and the root providers don't.                                            | Throws in dev mode. Production ignores the feature in that provider.                                  |
| `NG0323`           | A directive declares a resolver of an attribute and inherits another one.                                                         | Throws in dev mode. Production runs both, the base class's first.                                     |
| `NG0324`           | Two directives give different values for a resolved scalar.                                                                       | Logged with `console.warn` in dev mode, once per element and attribute.                               |
| `NG0600`           | A handler writes a signal.                                                                                                        | Throws.                                                                                               |
| `NG0100`           | A handler writes a plain field that the element's bindings read.                                                                  | Reported in an `Eager` view, or with exhaustive `checkNoChanges`.                                     |
| None               | `provideAttributeResolvers()` has a key for an event handler attribute.                                                           | Throws in dev mode.                                                                                   |
| `NG5001`           | `@HostListener('class')`, `@HostListener('style')`, or `@HostListener('attr.x')`.                                                 | Compile error.                                                                                        |
| `NG5001`           | Two resolvers of one attribute in one `host`, a chain in a host shorthand, or a host `(attr.x)` that can't be resolved.           | Compile error.                                                                                        |
| `NG5002`           | Two resolvers of one attribute on one template element, a chain in a template shorthand, or an `(attr.x)` that can't be resolved. | Compile error.                                                                                        |
| `NG8120`           | A template resolver binding sits next to a directive output of the same name.                                                     | Compile-time warning by default.                                                                      |
| `NG8121`           | A template resolver binding is on `<ng-container>`.                                                                               | Compile error.                                                                                        |
| `NG8122`           | A property binding writes an attribute that a resolver on the same element resolves.                                              | Compile-time warning by default.                                                                      |
| `TS2322`, `TS1360` | A shorthand callback isn't a callback of its resolver, or returns something other than `ResolvedAttribute`.                       | Compile error.                                                                                        |
| `TS2345`           | An extra or a `resolve()` argument doesn't fit the attribute's value type, or `$event` doesn't fit the handler's parameter.       | Compile error.                                                                                        |
| `TS2349`           | A shorthand calls its function instead of passing it.                                                                             | Compile error.                                                                                        |
| `TS2554`           | A shorthand callback takes no parameter.                                                                                          | Compile error.                                                                                        |
| `TS2684`           | A shorthand calls a method that declares `this` without its receiver.                                                             | Compile error.                                                                                        |

With `strictOutputEventTypes: false`, type checking reports only the errors of the call itself and
of the ordinary expressions, such as `TS2684`. JIT compilation and the linker throw the `NG5001` and `NG5002` errors with the same
messages, without the code.

## Limitations

### Sources and values

- Values set outside bindings, for example by `Renderer2.addClass()`, `Renderer2.setStyle()`,
  `NgClass`, or animations, aren't sources, so a resolver can't resolve conflicts with them. Prefer
  `[class]` over `[ngClass]` on these elements.
- Angular stores a `[class]` value and a `[style]` map sorted by name, so conflicts inside one such
  value resolve alphabetically. Extras keep their order, so `(class)="(cn) => cn(value)"` resolves
  `value` in the order you write.
- A directive with an input named or aliased `class` or `style`, as spartan-ng uses for `class`,
  receives the template's `[class]` or `[style]` binding, so that binding isn't a source. The
  template's static `class` or `style` still is.
- For `class`, static classes, extras, `resolve()` values, and the resolver's returned string split
  on any whitespace, including a no-break space. `[attr.class]` strings split on ASCII whitespace
  only, and a `[class]` string splits at every character up to U+0020.
- A resolver writes only its own attribute. It can't split one value into several attributes.

### Styles

- The style resolver models a subset of CSS: a table of shorthands and their longhands, and a small
  tokenizer for declarations. It doesn't implement full CSS Syntax. The table doesn't link logical
  and physical properties, vendor-prefixed aliases, or `all`.
- How the importance of a shorthand and of its longhands interact isn't modeled. Only declarations
  of one property follow the `!important` rule. A lower-priority `!important` declaration still
  wins after a join, as in CSS.
- Hydration of `style` reconciles by ownership. A server-only property from a `[style]` map key that
  the client's map doesn't have stays on the element. On an element with static styles, styles that
  only the server resolved or set are lost.
- When Domino writes the `style` attribute on the server, it doesn't escape property names. So the
  server's HTML can differ from the browser's for a custom property whose decoded name contains a
  character such as `;`.
- With Domino on the server, a static host style whose property name uses a CSS escape, such as
  `\63 olor: red !important`, reaches the resolver as `color`, but the element can render the
  template's value for that property.

### Automatic resolution

- Only the root providers can turn automatic resolution on and list its names.
- A template that Angular first created before a name enrolls doesn't resolve that name. See
  [Turn it on before the first render](#turn-it-on-before-the-first-render).
- The names that automatic resolution covers, and the injection token of each name, live in
  module-level registries for the lifetime of the JavaScript process. They never shrink.
- Automatic resolution reserves five `LView` slots for each automatically enrolled name that is
  eligible on an element that a component or directive matches, also in instances where it's off.
  It reserves none for a name that is excluded for security on that element or that the element
  already resolves through a binding.

### Resolvers and results

- An app's resolver receives one argument per value. A list longer than the JavaScript engine's
  argument limit, such as 200,000 classes or tokens, throws there. The built-in rules and resolvers
  from `joinValues()` read the list as an array and don't throw.
- In production, a function passed to `resolve()` or as an extra of a scalar or token list becomes
  its source text. For `class` and `style`, it reads as no value. Dev mode throws `NG0320`.
- Strict templates accept a result of another event, because every result has the one type
  `ResolvedAttribute`. Only dev mode reports it.
- In dev mode, a `resolve()` call that throws `NG0320` for its argument still counts as the call,
  so a handler that catches the error and calls `resolve()` again gets the "more than once" error.
- The `checkNoChanges` pass doesn't run the handlers, so it doesn't verify that they're stable.

### Compiler and type checking

- `NG8122` matches a binding to a resolved attribute whose name is lowercase. So it still reports a
  property that doesn't write its attribute, such as `[value]` on `<input>`, `[checked]`,
  `[selected]`, or `[muted]`, next to an `(attr.x)` of the same lowercase name.
- `NG8122` follows a base class through `extends` only when the class is declared locally or
  imported. A base class reached through a value alias, such as `const Alias = Base`, stops the
  walk. It also doesn't check resolvers that automatic resolution adds, directives inside an
  `ngNonBindable` element, host bindings of directives and base classes from libraries, or a
  `@HostBinding` on a getter.
- A shorthand that reads its callback through a safe read, such as `(class)="choice?.classes"`, can
  call it without `this`, depending on how the compiler emits optional chaining. Type checking
  doesn't report it. Use an arrow function field.
- Type checking doesn't report a binding on `<ng-template>`. Only the runtime `NG0321` does.
- The `ngp` compiler backend doesn't run most of these checks. It skips these:
  - The host resolver rules under `NG5001`, including a host `(attr.href)`.
  - The type checks of resolver bindings.
  - `NG8120`, `NG8121`, and `NG8122`.
  - `minVersion: "22.3.0"` for a binding on `<ng-container>`.

  For `NG8111`, it doesn't report the full form, and it reports a `(class)` or `(style)`
  shorthand as never invoked.

### Bundle size and hydration edge cases

- A single resolver binding, such as one `(attr.role)`, pulls in the whole resolver runtime, the
  style code included: about +7.1 kB gzip over an app without one, as the linked benchmark measures. See
  [the cost measurements](cost.md).
- If a directive's constructor calls `ViewContainerRef.createEmbeddedView()`, its element can keep
  values that only the server resolved after hydration.
- When an element has two translated attribute interpolations and the translation of the first
  drops its placeholders or is empty, the second can read the first one's expression. This also
  happens without a resolver.

## Tests

```bash
pnpm bazel test //packages/core/test/acceptance/attribute_resolver:attribute_resolver //packages/core/test/acceptance/attribute_resolver:attribute_resolver_web //packages/core/test/acceptance/attribute_resolver:auto_resolution //packages/core/test/acceptance/attribute_resolver:auto_resolution_web
```

```bash
pnpm bazel test //packages/platform-server/test:test //packages/platform-server/test:attribute_resolver_auto_hydration_test
```

```bash
pnpm bazel test --local_test_jobs=1 //packages/compiler-cli/test/ngtsc:ngtsc
```

```bash
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/output_shadowed_by_attribute_resolver:test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/property_binding_bypasses_resolver:test //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/uninvoked_function_in_event_binding:test
```

```bash
pnpm bazel test --test_arg=--filter=r3_view_compiler_attribute_resolver //packages/compiler-cli/test/compliance/full:full //packages/compiler-cli/test/compliance/linked:linked //packages/compiler-cli/test/compliance/declaration-only:declaration-only //packages/compiler-cli/test/compliance/codegen:codegen
```

The code lives on `feat/attribute-resolver`:

- Runtime: `packages/core/src/render3/instructions/attribute_resolver.ts`,
  `packages/core/src/render3/attribute_resolver_auto.ts`, and the specs in
  `packages/core/test/acceptance/attribute_resolver/`.
- Public types and providers: `packages/core/src/render3/interfaces/attribute_resolver.ts` and
  `packages/core/src/render3/attribute_resolver_provider.ts`.
- Hydration: the `*resolver*hydration*` specs in `packages/platform-server/test/`.
- Compiler: `packages/compiler/src/render3/r3_attribute_resolver.ts`, the shorthand expansion in
  `packages/compiler/src/template/pipeline/src/ingest.ts`, type checking in
  `packages/compiler/src/typecheck/ops/events.ts`, the extended checks under
  `packages/compiler-cli/src/ngtsc/typecheck/extended/checks/`, and the compliance cases in
  `packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_attribute_resolver/`.
