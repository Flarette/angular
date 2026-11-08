/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * @fileoverview
 *
 * Change detection, the styling instructions, and element creation call the class resolver runtime
 * through these hooks instead of importing it, so an app without a class resolver doesn't bundle
 * that runtime. `_refreshClassResolvers` and `_registerClassResolverBinding` are set before
 * anything creates a `TView.classResolvers` or a `TNode.classResolver`, so code that finds either
 * can call them.
 */

import type {TClassResolver} from '../interfaces/class_resolver';
import type {TElementNode} from '../interfaces/node';
import type {LView, TView} from '../interfaces/view';

/** Resolves the classes of every element in a view that has a class resolver. */
export let _refreshClassResolvers: ((tView: TView, lView: LView) => void) | null = null;

/** Records a class binding with the source that owns it. */
export let _registerClassResolverBinding:
  ((tClassResolver: TClassResolver, directiveIndex: number, bindingIndex: number) => void) | null =
  null;

/**
 * Sets up automatic class resolution for an element once its directives are created. Stays `null`
 * until `withAutoResolution()` is called.
 */
export let _setUpClassResolution:
  ((tView: TView, lView: LView, tNode: TElementNode) => void) | null = null;

/**
 * Called when a class resolver registers, which passes `null` for `setUpImpl`, and when
 * `withAutoResolution()` is called.
 */
export function enableClassResolverHooks(
  refreshImpl: (tView: TView, lView: LView) => void,
  registerBindingImpl: (
    tClassResolver: TClassResolver,
    directiveIndex: number,
    bindingIndex: number,
  ) => void,
  setUpImpl: ((tView: TView, lView: LView, tNode: TElementNode) => void) | null,
): void {
  // Once automatic resolution is on, its refresh also refreshes the `(class)` bindings, so a binding
  // that registers later keeps it.
  if (_setUpClassResolution === null) {
    _refreshClassResolvers = refreshImpl;
    _registerClassResolverBinding = registerBindingImpl;
    _setUpClassResolution = setUpImpl;
  }
}
