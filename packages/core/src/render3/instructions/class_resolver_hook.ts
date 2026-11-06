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
 * Change detection and the styling instructions call the class resolver runtime through these
 * hooks instead of importing it, so an app without a class resolver doesn't bundle that runtime.
 * `_refreshClassResolvers` and `_registerClassResolverBinding` are set before anything creates a
 * `TView.classResolvers` or a `TNode.classResolver`, so code that finds either can call them.
 */

import type {TClassResolver} from '../interfaces/class_resolver';
import type {LView, TView} from '../interfaces/view';

/** Resolves the classes of every element in a view that has a class resolver. */
export let _refreshClassResolvers: ((tView: TView, lView: LView) => void) | null = null;

/** Records a class binding with the source that owns it. */
export let _registerClassResolverBinding:
  ((tClassResolver: TClassResolver, directiveIndex: number, bindingIndex: number) => void) | null =
  null;

/** Called when a class resolver registers. */
export function enableClassResolverHooks(
  refreshImpl: (tView: TView, lView: LView) => void,
  registerBindingImpl: (
    tClassResolver: TClassResolver,
    directiveIndex: number,
    bindingIndex: number,
  ) => void,
): void {
  _refreshClassResolvers = refreshImpl;
  _registerClassResolverBinding = registerBindingImpl;
}
