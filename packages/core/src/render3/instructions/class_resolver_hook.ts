/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type {TClassResolver} from '../interfaces/class_resolver';
import type {TElementNode} from '../interfaces/node';
import type {LView, TView} from '../interfaces/view';

/**
 * Resolves the classes of every element in a view that has a class resolver.
 *
 * Change detection calls the class resolver runtime through this reference instead of importing it,
 * so an app without a class resolver doesn't bundle that runtime. It stays `null` until the first
 * class resolver registers, and so does every `TView.classResolvers`.
 */
export let _refreshClassResolvers: ((tView: TView, lView: LView) => void) | null = null;

/**
 * Records a class binding with the source that owns it, for an element that has a class resolver.
 *
 * The styling instructions call it through this reference, for the same reason as
 * `_refreshClassResolvers`. It stays `null` until the first class resolver registers, and so does
 * every `TNode.classResolver`.
 */
export let _registerClassResolverBinding:
  ((tClassResolver: TClassResolver, directiveIndex: number, bindingIndex: number) => void) | null =
  null;

/**
 * Sets up automatic class resolution for an element that a component or directive matches, once it
 * has created the element's directives.
 *
 * Element creation calls it through this reference, for the same reason as
 * `_refreshClassResolvers`. It stays `null` until `withAutoResolution()` is called.
 */
export let _setUpClassResolution:
  ((tView: TView, lView: LView, tNode: TElementNode) => void) | null = null;

/**
 * Lets change detection, the styling instructions, and element creation reach the class resolver
 * runtime. Called when a class resolver registers, and when `withAutoResolution()` is called, which
 * passes `setUpImpl`.
 */
export function enableClassResolverHooks(
  refreshImpl: (tView: TView, lView: LView) => void,
  registerBindingImpl: (
    tClassResolver: TClassResolver,
    directiveIndex: number,
    bindingIndex: number,
  ) => void,
  setUpImpl: ((tView: TView, lView: LView, tNode: TElementNode) => void) | null = null,
) {
  // Once automatic resolution is on, its refresh also refreshes the `(class)` bindings, so a binding
  // that registers later keeps it.
  if (_setUpClassResolution === null) {
    _refreshClassResolvers = refreshImpl;
    _registerClassResolverBinding = registerBindingImpl;
    _setUpClassResolution = setUpImpl;
  }
}
