/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {InjectionToken} from '../di/injection_token';
import {Provider} from '../di/interface/provider';

import {ClassResolver, ClassResolverFeature} from './interfaces/class_resolver';

/**
 * The resolver that merges an element's classes for its `(class)` and `(attr.class)` bindings.
 * Without a provider, they use the plain merge.
 */
export const CLASS_RESOLVER = new InjectionToken<ClassResolver>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'CLASS_RESOLVER' : '',
);

/**
 * Sets the resolver that merges the classes of elements with a `(class)` or `(attr.class)` binding.
 *
 * Angular reads the classes of each source and the classes that the binding adds, then calls the
 * resolver with one space-separated string per source, from the lowest to the highest priority.
 * The classes that the binding adds come at the end of its own source's string. Without a
 * resolver, Angular flattens the strings in order, drops empty and repeated names, and joins the
 * rest with spaces.
 *
 * Each binding looks the resolver up from its element's injector, so a component can resolve the
 * elements of its own template with another resolver by providing it in `viewProviders`.
 *
 * ```ts
 * bootstrapApplication(App, {providers: [provideClassResolver(twMerge)]});
 * ```
 *
 * @param resolver Merges the classes of an element.
 * @param features Features of the resolver.
 *
 * @experimental 22.3
 */
export function provideClassResolver(
  resolver: ClassResolver,
  ...features: ClassResolverFeature[]
): Provider {
  return {provide: CLASS_RESOLVER, useValue: resolver};
}
