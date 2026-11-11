# Attribute resolvers: design decisions

The decisions behind angular/angular#71966 and the alternatives that lost. For how the feature
behaves, see the [reference](README.md). The numbers come from
[measurements of today's Angular](measurements.md) and [the feature's cost](cost.md).

## The problem

Several sources can set one attribute on one element: the component on the element, its other
directives, and the template. Angular has no rule for combining them. Measured without a resolver:

- Static values follow a priority: the template, then the last-matched directive, then the
  component, then its host directives.
- Bound values (`[attr.x]`, `[x]`) follow none. At creation, the host binding that runs last wins,
  and it beats the template. After that, the source that changed last wins. A source that becomes
  `null` removes the attribute while other sources still set it.
- Classes take the union, so conflicting utility classes such as `px-4` and `px-2` both stay, and
  the stylesheet's order picks the winner.
- Styles resolve a conflict on one property by priority, but not a shorthand against its
  longhands: a component's bound `padding` overrides the template's bound `padding-left`, and
  removing the `padding` removes the `padding-left` with it.

A library binds a default, and a consumer overrides it statically:

```ts
@Directive({selector: '[menuItem]', host: {'[attr.role]': 'role()'}}) // role() is 'menuitem'
export class MenuItem {}
```

```html
<li menuItem role="separator"></li>
<!-- Today: role="menuitem". The directive's binding beats the consumer's static value. -->
```

The design started as a class-only proposal, angular/angular#71888, with the prototype in
Flarette/angular#5. That proposal was closed as a duplicate of #67519, which asks for resolvers for
any host attribute. Classes turned out to be one grammar of the general problem, so the class
design was generalized rather than kept special.

## Decisions

### Opt in, and nothing changes without it

- Without a resolver binding or automatic resolution, Angular behaves exactly as today. Changing
  the default would change every app.
- A handler that doesn't call `resolve()` applies the attribute's built-in rule. For `class`,
  that's today's union.

### Sources and priority

- Sources are static attributes and `[attr.x]` bindings, plus the class and style bindings for
  `class` and `style`. `[attr.class]` and `[attr.style]` count too.
- A property binding that writes the same attribute, such as `[id]`, isn't a source: it writes a
  property, and `[id]` may be a directive input. On an element that resolves the attribute, the
  `NG8122` extended diagnostic suggests `[attr.x]` instead.
- Priority comes only from origin: component, directives, template, lowest first. There's no
  priority flag. A component that owns a state attribute declares its own resolver, and a consumer
  overrides that only with an explicit resolver of their own:

  ```ts
  @Component({
    selector: 'ui-disclosure',
    host: {'(attr.aria-expanded)': '$event.resolve(String(open()))'},
  })
  export class UiDisclosure {
    readonly open = signal(false);
  }
  ```

- Every resolver binding on an element runs, from the lowest to the highest priority, and each one
  receives the previous result folded back into the sources by origin. A value that a resolver
  adds ranks in that resolver's own source, so a component's extras are defaults that directives
  and the template override.

### One resolver contract

- Every resolver is `(...values: string[]) => string | null`, lowest priority first, with one
  argument per entry: a class name, a style declaration, a token, or a scalar's value. `twMerge`,
  shadcn's `cn`, and `clsx` fit unchanged.
- No second, origin-aware argument. Logic that needs the origins uses the full form and
  `$event.sources`.
- A resolver writes only its own attribute.
- The contract is fixed, with no declaration merging, because a library that augments the type
  differently from its app fails to compile.

### Grammars and built-in rules

The attribute's name decides how Angular reads, merges, and applies it:

| Grammar      | Attributes                                                                                                | Built-in rule      |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------ |
| Class list   | `class`                                                                                                   | plain merge        |
| Declarations | `style`                                                                                                   | `joinDeclarations` |
| Token list   | `rel`, `part`, `headers`, `aria-describedby`, `aria-controls`, `aria-owns`, `aria-flowto`, `aria-details` | `joinTokens`       |
| Scalar       | every other name, including `id`, `role`, `title`, `aria-labelledby`, and `data-*`                        | `lastValue`        |

- Known attributes follow their spec grammar. `data-*` and unknown names are scalars.
- The built-in rules are exported, so an app can enroll an attribute without writing a function:
  `provideAttributeResolvers({role: lastValue})`.
- `joinValues(separator)` joins any attribute, because the reader of an attribute decides its
  separator: HTML uses commas for `srcset` and spaces for `rel`, and CSS `attr()` lists need the
  separator their syntax names.
- In dev mode, `NG0324` warns when two directives set different values for a resolved scalar. The
  last match still wins. Token lists never warn.

### Bindings

- `(attr.x)` is the full form for every attribute. Its `$event` holds the `sources`, the bound
  `resolver(...extras)`, and `resolve(value)`.
- Only `class` and `style` get shorthands. `(class)="F"` means
  `(attr.class)="$event.resolve((F)($event.resolver))"`. A scalar needs no app function, so a
  shorthand such as `(id)` would add nothing over `(attr.id)`.
- A shorthand must return the opaque `ResolvedAttribute` that its own resolver creates. Type
  checking rejects `(class)="(cn) => 'px-2'"`, and a cast fails in dev mode. A handler's return
  value isn't the result, because no other Angular event works that way, the value wasn't
  type-checked, and a later statement could replace it silently.
- A result is valid only in its own event's `resolve()`. In dev mode, a result from another event
  or a function passed to `resolve()` throws `NG0320`.
- One way to declare a resolver: `host` or the template. `@HostListener('class')` and
  `@HostListener('attr.x')` are compile errors, because a decorator always calls its method and
  can't pass the shorthand's callback. One element and one `host` each get one resolver per
  attribute.

### Styles

- Resolved styles apply by an ordered per-property diff, so a shorthand never lands after a
  higher-priority longhand. Styles that `Renderer2.setStyle()` or an animation set stay.
- `!important` follows CSS for one property: an important declaration beats later ones without it.
- The style resolver models a CSS subset, a shorthand table and a small tokenizer. Full CSS Syntax
  is out of scope: reimplementing CSS would be a maintenance burden. The gaps are documented in the
  reference's limitations.

### Providers and automatic resolution

- `provideAttributeResolvers(map, ...features)` registers a resolver per attribute name for the
  element injectors below it. Nested maps compose per name through the element's injector path, so
  a component that overrides one name doesn't drop the others.
- `withAutoResolution()` resolves `class`, `style`, and every name in the map on every element that
  a component or directive matches. Only the root providers can turn it on, because its data is
  built per template on first creation while providers belong to instances; a lower declaration
  would make the result depend on load order. `withAutoResolution(false)` turns it off for a
  subtree, and `withAutoResolution()` turns it back on below.
- Automatic resolution doesn't cover every element. An element that no component or directive
  matches has only the template's values, so it has no conflict, and every element would pay the
  cost.
- An explicit resolver runs on every refresh. An automatic one runs only when a source changes.

### Security

- Attributes whose value needs sanitization can't be resolved: `href`, `src` on most elements,
  `srcdoc`, `on*`, and namespaced names such as `xlink:href`. They're compile errors in templates
  and hosts, and automatic resolution skips them per element.
- The reason: sanitizing a resolved value can't keep the trust of a `SafeResourceUrl` through a
  string contract, and a runtime sanitizer would miss `srcdoc`. With the exclusion, a resolved
  value never needs a sanitizer.

### Names and breaking changes

- `(class)`, `(style)`, and `(attr.x)` always resolve. A directive output with the same name is
  shadowed, and `NG8120`, `outputShadowedByAttributeResolver`, warns with strict templates.
  Outputs named `class` are rare, and until #71661 such an output also dropped the element's
  `[class]` binding.
- A resolver on `<ng-container>` or `<ng-template>` is an error, `NG8121`, because neither renders
  an element.
- A partial declaration that uses a resolver requires a `22.3.0` linker, so an older linker can't
  compile it as a plain listener.
- An app that doesn't use the feature carries only three hook symbols. The runtime loads with the
  first resolver instruction or `withAutoResolution()`.

## Alternatives considered

| Alternative                                                       | Why it lost                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One universal rule, join or override                              | Real cases need both: `data-testid` and `id` must override, and `aria-describedby` and `rel` must join. The attribute's grammar decides, and the specs already define it.                                                                                            |
| Comma joins for every list                                        | The reader decides the separator. `joinValues(separator)` covers each case.                                                                                                                                                                                           |
| A priority flag, like `!important`                                | It escalates: a library pins, a consumer pins back, and two pins tie on match order again. A pinned lower source silently beats the consumer. A component that owns a state attribute declares its own resolver instead.                                              |
| One resolver replaces the others on an element                    | Among directives, the winner depended on the order of the consumer's `imports`, and a library's logic vanished as soon as a consumer wrote their own resolver.                                                                                                         |
| A lower resolver delegates to a higher one                        | Naming another directive's resolver depends on a match order that consumers can't see, and a lower resolver's appended values beat the consumer's.                                                                                                                    |
| A handler returns the value                                       | It breaks the void contract of an event binding, isn't type-checked, and a later statement can replace the value silently.                                                                                                                                            |
| A resolver contract that takes `[class]` values                   | It fails `twMerge`'s types, and declaration merging for the extras' type breaks when two libraries augment it differently. Angular reads extras the way `[class]` does, then passes strings.                                                                          |
| A second, origin-aware argument for app-wide resolvers            | `twMerge` is variadic and would read it as a class string. The full form already has `$event.sources`.                                                                                                                                                               |
| A name such as `(class.resolve)`, to avoid the breaking change    | It loses the short form, and `(class.x)` reads like a modifier, as in `(keydown.enter)`.                                                                                                                                                                              |
| Property bindings as sources                                      | They'd need to intercept property writes, and `[id]` may be a directive input. A diagnostic points to `[attr.x]`.                                                                                                                                                     |
| Splitting one attribute into several                              | Ownership of the derived attributes, ordering against their own resolvers, cycles, hydration, and type checking per key have no clean answer. A host binding can compute a second attribute from the same state.                                                     |
| Rewriting the whole `style` attribute                             | It removes styles that `Renderer2.setStyle()` and animations set.                                                                                                                                                                                                     |
| Sanitizing resolved URL values                                    | A string contract loses `SafeResourceUrl` trust, and a runtime sanitizer misses `srcdoc`.                                                                                                                                                                             |
| Automatic resolution on every element                             | Every element would pay, and an element that nothing matches has only the template's values. A template that needs a merge there can bind `[class]` to the resolver's result.                                                                                         |
| Automatic resolution declared below the root                      | Its data is built per template on first creation, so the result would depend on which instance created the template first.                                                                                                                                           |
| Changing Angular's behavior without a resolver                    | Every app would change. Resolution stays opt-in.                                                                                                                                                                                                                      |

## How this maps to #67519's first sketch

| First sketch                                             | Now                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `twMerge` configured in `angular.json`                   | `provideAttributeResolvers({class: twMerge})` in DI, scoped by injector.                                                               |
| `hostAttributeResolvers` on `@Component`                 | A resolver binding, `(attr.x)`, `(class)`, or `(style)`, in `host` or in the template, or automatic resolution.                        |
| Sources as `{component, directives, host}`               | `$event.sources` as `[component, directives, template]`; an app's resolver receives one argument per value, lowest priority first.     |
| The tuple alternative, `class: twMerge`                  | Kept: the variadic contract fits `twMerge` unchanged.                                                                                  |
| Extending `host` with `{value, resolve}`                 | Not needed: `host` takes a resolver binding next to the static value.                                                                  |
| Event resolvers                                          | Not included.                                                                                                                          |

## Deferred

| Item                                            | Reason                                                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Attributes that need sanitization               | See [Security](#security).                                                                                              |
| Full CSS Syntax in the style resolver           | Out of scope; the subset's gaps are documented.                                                                         |
| The `ngp` backend's resolver checks             | The Rust preprocessor doesn't take outside contributions; its gaps are on its known-failures list.                      |
| Event resolvers                                 | No established pattern asks for custom event resolution.                                                                |
