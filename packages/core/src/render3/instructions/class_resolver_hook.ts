/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type {TClassResolver} from '../interfaces/class_resolver';
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
 * Lets change detection and the styling instructions reach the class resolver runtime. Called when
 * a class resolver registers.
 */
export function enableClassResolverHooks(
  refreshImpl: (tView: TView, lView: LView) => void,
  registerBindingImpl: (
    tClassResolver: TClassResolver,
    directiveIndex: number,
    bindingIndex: number,
  ) => void,
) {
  _refreshClassResolvers = refreshImpl;
  _registerClassResolverBinding = registerBindingImpl;
}
