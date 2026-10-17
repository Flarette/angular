/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * Classes that each source applies to an element, ordered from the lowest to the highest priority.
 * A `(class)` binding receives them as `$event` and returns the classes the element should have.
 *
 * - `component`: the component on the element, including the component's host directives.
 * - `directives`: all other directives on the element, in matching order.
 * - `template`: the element's own `class` attribute and its `[class]` and `[class.name]` bindings.
 *
 * Within a source, static classes come first, followed by `[class]` and then `[class.name]`
 * bindings. A class that a higher-priority binding turns off (for example with
 * `[class.name]="false"`) isn't present in any source.
 *
 * When several `(class)` bindings apply to an element, each one after the lowest-priority one
 * receives the classes that the previous one returned, grouped the same way. A class keeps its
 * source, and a class that the previous binding added is reported under that binding's source.
 *
 * @experimental 22.3
 */
export type ClassSources = readonly [
  component: readonly string[],
  directives: readonly string[],
  template: readonly string[],
];

/**
 * Handler compiled from a `(class)` binding. It receives the element's `ClassSources` as `$event`
 * and returns the classes the element should have, in any form a `[class]` binding accepts. If it
 * returns a function, that function is called with the same `ClassSources`.
 */
export type ClassResolverFn = (sources: ClassSources) => unknown;

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
   */
  index: number;

  /**
   * Owner of each registered resolver, from the lowest to the highest priority: the index of the
   * `DirectiveDef` in `TView.data`, or `-1` for the template.
   */
  owners: number[];

  /** One segment per directive followed by the template's, from the lowest to the highest priority. */
  segments: TClassSourceSegment[];
}
