# How Angular resolves one attribute from several sources today

Measured on 2026-11-09 on the class resolver prototype (Flarette/angular#5, upstream `main` at
`5ac4cf7b54`), with no resolver in use. The spec ran in Node with Domino and in Chrome. Chrome is
authoritative for `style`, where Domino doesn't expand shorthands.

Sources on one `<ui-box>`: the component's `host` (C), a host directive (H), two attribute
directives (D1, D2, imported in that order unless noted), and the template (T). Each source sets its
own value: `c`, `h`, `d1`, `d2`, `t`. Attributes measured: `id`, `title`, `role`,
`aria-describedby`, `data-x`, `tabindex`, and `style`. All the non-style attributes behave the same.

Files next to this one:

- [`measurements-spec.ts`](measurements-spec.ts): the spec. To rerun it on that prototype, copy it
  into `packages/core/test/acceptance/class_resolver/` and add an `ng_web_test_suite` over
  `:class_resolver_lib` for Chrome.
- [`measurements-chrome.jsonl`](measurements-chrome.jsonl) and
  [`measurements-domino.jsonl`](measurements-domino.jsonl): every measured row, one JSON object per
  step.

## Single-value attributes, such as `id`

Static values follow a priority: template, then the last-matched directive, then the component,
then its host directives.

| Static sources  | Result |
| --------------- | ------ |
| C, H, D1, D2, T | `t`    |
| C, H, D1, D2    | `d2`   |
| C, D1           | `d1`   |
| C, H            | `c`    |

Bound values (`[attr.id]` or `[id]`) follow no priority. At creation, the host binding that runs last
wins, which is the last directive in `imports` order, and it beats the template's binding. After
that, the source that changed last wins. A source that becomes `null` removes the attribute, even
though other sources still set it.

| Bound sources, `[attr.id]`        | Step             | Result       |
| --------------------------------- | ---------------- | ------------ |
| C, H, D1, D2, T                   | create           | `d2`         |
| C, H, D1, D2, T, `imports` D2, D1 | create           | `d1`         |
| C, T                              | create           | `c`          |
| C, T                              | T changes        | `t2`         |
| C, T                              | C changes        | `c2`         |
| C, T                              | C becomes `null` | no attribute |
| C, D1 bound, T static             | create           | `d1`         |
| C, D1 static, T bound             | create           | `t`          |

`[id]` property bindings measure the same as `[attr.id]`.

## `style`

Angular already resolves a conflict on the same property by source priority, but not a conflict
between a shorthand and its longhands. Values: C `padding: 4px; color: red`, D1 `color: green`,
T `padding-left: 2px; color: blue`.

| Sources                         | Chrome's `style` attribute                     | `padding-left` | `color` |
| ------------------------------- | ---------------------------------------------- | -------------- | ------- |
| All static                      | `color: blue; padding: 4px; padding-left: 2px` | 2px ✓          | blue ✓  |
| C, D1 static, T `[style]`       | `color: blue; padding: 4px 4px 4px 2px`        | 2px ✓          | blue ✓  |
| All `[style]`                   | `color: blue; padding: 4px; margin: 1px`       | 4px ✗          | blue ✓  |
| All `[style]`, C becomes `null` | `color: blue; margin: 1px; z-index: 1`         | none ✗         | blue ✓  |
| C, D1 `[style]`, T static       | `color: green; padding: 4px`                   | 4px ✗          | green ✗ |
| C, D1, T `[attr.style]`         | `color: green`                                 | none ✗         | green ✗ |

- With bound styles, the component's `padding` shorthand overrides the template's `padding-left`,
  because Angular writes properties in an order that ignores priority between a shorthand and its
  longhands.
- When the component's `padding` goes away, Chrome removes the template's `padding-left` with it.
- A directive's bound `[style]` beats the template's static `style`. See below: the binding kind
  decides it.
- `[attr.style]` bindings replace the whole attribute; the last one to write wins.

Static styles come out right only because Angular writes them in source order, template last, and
the browser lets a later declaration win.

### A directive's binding against the template's static value

Measured in Chrome, one directive on `<div dir class="foo" style="color: blue">`. The three binding
kinds disagree:

| Directive binding          | Result                                   |
| -------------------------- | ---------------------------------------- |
| `[style]="{color: green}"` | `green`: the directive wins              |
| `[style.color]="'green'"`  | `blue`: the template's static value wins |
| `[class.foo]="false"`      | `foo` removed: the directive wins        |

`TStylingStatic` in `interfaces/styling.ts` keeps the template's static values as a fallback that
is read after the bindings, which explains the map and class results, but not the property result.

### Concatenating declarations in priority order

Measured in Chrome with `setAttribute('style', …)`: a later declaration wins for a shorthand against
its longhand, in both orders, for a repeated property, and for a custom property.
`!important` is the exception: `color: red !important; color: blue` stays red, so a lower-priority
source's `!important` would still win after concatenation.

| `style` attribute                           | Result              |
| ------------------------------------------- | ------------------- |
| `padding: 4px; padding-left: 2px`           | `padding-left` 2px  |
| `padding-left: 2px; padding: 4px`           | `padding-left` 4px  |
| `margin: 1px; margin: 2px`                  | `margin` 2px        |
| `--x: 1; --x: 2`                            | `--x` 2             |
| `border: 1px solid red; border-color: blue` | `border-color` blue |
| `color: red !important; color: blue`        | `color` red         |

Writing the whole attribute would also remove styles that `Renderer2.setStyle()` or an animation
set, which the class resolver avoids by diffing.

## Lists in `data-*` attributes that CSS reads

Measured in HeadlessChrome 159 with typed `attr()`. CSS parses a list from one attribute, and the
declaration's syntax decides the separator: `#` takes commas, `+` takes spaces. A value with the
other separator, or a list where the syntax expects one value, is invalid, and the property falls
back to its initial value.

| CSS                                               | `data-*` value | Computed        |
| ------------------------------------------------- | -------------- | --------------- |
| `transition-duration: attr(data-d type(<time>#))` | `1s, 2s`       | `1s, 2s`        |
| `transition-duration: attr(data-d type(<time>#))` | `1s 2s`        | `0s` (invalid)  |
| `padding: attr(data-p type(<length>+))`           | `1px 2px`      | `1px 2px`       |
| `padding: attr(data-p type(<length>+))`           | `1px, 2px`     | `0px` (invalid) |
| `transition-duration: attr(data-d type(<time>))`  | `1s, 2s`       | `0s` (invalid)  |
| `content: attr(data-s)`                           | `a, b`         | `"a, b"`        |

So a `data-*` attribute's separator belongs to the stylesheet that reads it, not to Angular.
