/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * Classes that each source applies to an element, ordered from the lowest to the highest priority.
 * An `(attr.class)` binding receives them as `$event.sources`.
 *
 * - `component`: the component on the element, including the component's host directives.
 * - `directives`: all other directives on the element, in matching order.
 * - `template`: the element's own `class` attribute and its `[class]` and `[class.name]` bindings.
 *
 * Within a source, static classes come first, followed by `[class]` and then `[class.name]`
 * bindings. A class that a higher-priority binding turns off (for example with
 * `[class.name]="false"`) isn't present in any source.
 *
 * When several `(class)` or `(attr.class)` bindings apply to an element, each one after the
 * lowest-priority one receives the classes that the previous one resolved, grouped the same way. A
 * class keeps its source, and a class that the previous binding added is reported under that
 * binding's source.
 *
 * @experimental 22.3
 */
export type ClassSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
];

/**
 * A value that names classes, read the way a `[class]` binding reads it: a string splits on
 * whitespace, an array or a `Set` lists the names, and an object map keeps the keys whose values
 * are truthy. `null`, `undefined`, `false`, and `''` add nothing.
 *
 * @experimental 22.3
 */
export type ClassBindingValue =
  | string
  | readonly string[]
  | ReadonlySet<string>
  | {readonly [className: string]: unknown}
  | null
  | undefined
  | false;

// Type-only brand of `ResolvedClasses`; no value carries it at runtime.
export const ɵRESOLVED_CLASSES_BRAND: unique symbol = /* @__PURE__ */ Symbol();

/**
 * Classes that a `ClassResolveEvent`'s resolver merged for an element. Only that resolver creates
 * one; pass it to `ClassResolveEvent.resolve` to apply it.
 *
 * @experimental 22.3
 */
export interface ResolvedClasses {
  readonly [ɵRESOLVED_CLASSES_BRAND]: true;
}

/**
 * The resolver of a `ClassResolveEvent`. It merges the event's sources with the extras, which rank
 * at the end of the source of the binding that calls it.
 *
 * @experimental 22.3
 */
export type BoundClassResolver = (...extras: ClassBindingValue[]) => ResolvedClasses;

/**
 * A function that computes an element's classes with the resolver of a `ClassResolveEvent`.
 *
 * @experimental 22.3
 */
export type ClassCallback = (cn: BoundClassResolver) => ResolvedClasses;

/**
 * `$event` of an `(attr.class)` binding, which resolves the classes of its element.
 *
 * If the handler doesn't call `resolve()`, the element keeps the classes of its sources. The
 * handler's return value is ignored.
 *
 * @experimental 22.3
 */
export interface ClassResolveEvent {
  /** Classes that each source applies to the element. */
  readonly sources: ClassSources;

  /**
   * Merges the sources with `extras`, which rank at the end of the source of the binding that
   * calls it.
   */
  resolver(...extras: ClassBindingValue[]): ResolvedClasses;

  /**
   * Sets the element's classes. Call it at most once, while the handler runs; in dev mode, another
   * call throws.
   */
  resolve(classes: ClassBindingValue | ResolvedClasses): void;
}

/**
 * Merges the classes of an element. It receives one space-separated string per source, from the
 * lowest to the highest priority, and returns the element's classes.
 *
 * @experimental 22.3
 */
export type ClassResolver = (...classes: string[]) => string;

/**
 * A feature of the class resolver that `provideClassResolver` registers.
 *
 * @experimental 22.3
 */
export interface ClassResolverFeature {
  readonly ɵbrand: 'ClassResolverFeature';
}

/**
 * Handler compiled from a `(class)` or `(attr.class)` binding. It receives a `ClassResolveEvent` as
 * `$event`, and its return value is ignored. The handler of `(class)="F"` is
 * `$event.resolve((F)($event.resolver))`.
 */
export type ClassResolverFn = (event: ClassResolveEvent) => unknown;

/**
 * Flags of a `ɵɵclassResolver` registration.
 *
 * NOTE: Ensure changes here are in sync with `packages/compiler/src/core.ts`.
 */
export const enum ClassResolverFlags {
  /** The handler receives a `ClassResolveEvent`. */
  FullForm = 1 << 0,

  /** The handler was compiled from a `(class)` shorthand, whose result must come from its event. */
  Shorthand = 1 << 1,
}

/** Position of a source in `ClassSources`. */
export const enum ClassSource {
  Component = 0,
  Directives = 1,
  Template = 2,
}

/** Classes contributed by one directive's host bindings or by the template. */
export interface TClassSourceSegment {
  /** Source under which the classes are reported. */
  source: ClassSource;

  /** Index of the `DirectiveDef` in `TView.data`, or `-1` for the template. */
  directiveIndex: number;

  /** Static classes from the directive's `hostAttrs` or the element's `attrs`. */
  statics: string[];

  /** Binding indices of the segment's `[class]` and `[class.name]` bindings, in execution order. */
  bindings: number[];
}

/** Data shared by all instances of an element whose classes are computed by a `(class)` binding. */
export interface TClassResolver {
  /**
   * Index of the per-instance state in the `LView`:
   * - `index`: the `ClassResolverFn`s registered by `ɵɵclassResolver`, in the order of `owners`.
   * - `index + 1`: `KeyValueArray` of the classes applied by the previous resolution. Before the
   *   first resolution it holds the classes of an element claimed by hydration, or `null` if the
   *   element still has the static classes it was created with.
   * - `index + 2`: the `ClassResolver` that each registration's owner injects, in the order of
   *   `owners`, or `null` for the plain merge.
   */
  index: number;

  /**
   * Owner of each registered resolver, from the lowest to the highest priority: the index of the
   * `DirectiveDef` in `TView.data`, or `-1` for the template.
   */
  owners: number[];

  /** `ClassResolverFlags` of each registered resolver, in the order of `owners`. */
  flags: ClassResolverFlags[];

  /** One segment per directive followed by the template's, from the lowest to the highest priority. */
  segments: TClassSourceSegment[];
}
