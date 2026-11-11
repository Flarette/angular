# What the attribute resolver costs

Measured on 2026-11-10 on the feature branch, before its last performance change (static styles
parsed once, elements without sources skipped), so the refresh figures are upper bounds. The
benchmark isn't part of the change. Files next to this one:

- [`cost-spec.ts`](cost-spec.ts): the benchmark spec. To rerun it, copy it to
  `packages/core/test/acceptance/attribute_resolver/` and apply [`cost-build.diff`](cost-build.diff).
- [`cost-tables.md`](cost-tables.md): both medians and their difference for every cell.

## Setup

Apple M4 with 16 GB, Node v24.22.2 (Bazel's), Bazel `fastbuild`, JIT, dev mode, Domino. N = 1000
elements, medians of 31 samples per phase, each mode in two separate processes with nothing else
running. Phases: create (first render on a warm template), unchanged refresh, and toggle (one
template source changes). Each element has one directive with a static value and a host binding, and
the template adds a static value and a binding.

Automatic resolution always enrolls `class` and `style`, so an automatic `role` cell resolves three
names.

## Per element

Extra cost in µs per element, two processes. "Explicit" compares with plain Angular; "auto" and
"off" compare with the plain component in the same phase.

| Attribute          | Cell     |        Create | Unchanged refresh |        Toggle |
| ------------------ | -------- | ------------: | ----------------: | ------------: |
| `class`            | explicit | +14.5 / +16.1 |       +9.7 / +9.8 | +10.7 / +11.1 |
| `class`            | auto     | +15.5 / +16.1 |       +1.7 / +1.7 | +11.4 / +11.6 |
| `class`            | off      |   +3.4 / +3.7 |     +0.14 / +0.15 | +0.33 / +0.34 |
| `role`             | explicit |   +3.0 / +3.5 |       +6.8 / +7.3 |   +4.2 / +4.8 |
| `role`             | auto     |   +7.9 / +8.1 |       +3.9 / +3.9 |   +5.3 / +5.4 |
| `role`             | off      |   +2.7 / +3.2 |     +0.19 / +0.19 | +0.54 / +0.55 |
| `aria-describedby` | explicit |   +5.3 / +5.5 |       +8.2 / +4.0 |   +6.2 / +3.3 |
| `aria-describedby` | auto     |   +9.2 / +9.9 |       +4.8 / +4.8 |   +4.8 / +6.7 |
| `aria-describedby` | off      |   +4.6 / +3.0 |     +0.20 / +0.19 | +0.83 / +0.58 |
| `style`            | explicit | +32.8 / +30.8 |     +22.2 / +21.7 | +30.0 / +30.0 |
| `style`            | auto     | +34.8 / +34.8 |       +5.5 / +5.7 | +29.8 / +29.8 |
| `style`            | off      |   +2.0 / +2.5 |     +0.16 / +0.18 | +0.80 / +0.39 |

The `aria-describedby` pair was noisy: some processes ran a whole phase about twice as fast. An
explicit resolver runs on every refresh; an automatic one runs only when a source changes.

## Hot paths

- A changed class binding on an element whose only resolver is for another name pays a few tenths
  of a µs for the `styling.ts` lookup (+0.23 / +0.21); `ɵɵattribute` there pays +0.29 / +0.40.
- A style result of 100 declarations costs about +305 µs per element when one declaration changes,
  about ten times plain styling. On an unchanged refresh it costs +286 / +276 µs explicit and
  +85 / +81 µs automatic, because collection parses every static declaration again before it compares.
- Automatic setup grows about 1.2 to 1.4 µs per enrolled name at the first creation of a template
  (3, 6, and 18 names), close to linear at these sizes. An unchanged refresh of elements with enrolled
  names but no sources costs +0.46 to +1.5 µs; the `class` path has no early exit for them.

## Memory

An explicit resolver binding takes three `LView` slots. Automatic resolution takes five slots per
enrolled name on every element that matches a directive, also in instances where it's off: 15, 30,
and 90 slots for 3, 6, and 18 names.

## Bundle size

Minified and mangled, against an app with no resolver (31,471 bytes gzip):

| App                                                        |     Raw |   gzip | brotli |
| ---------------------------------------------------------- | ------: | -----: | -----: |
| One `(attr.role)` binding, no provider                     | +22,972 | +7,113 | +6,207 |
| `provideAttributeResolvers({class}, withAutoResolution())` | +27,029 | +8,584 | +7,454 |

A single `role` binding pulls in the whole resolver runtime, the style code included.
