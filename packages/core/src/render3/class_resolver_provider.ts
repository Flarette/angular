/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {InjectionToken} from '../di/injection_token';
import {Provider} from '../di/interface/provider';

import {
  ClassResolver,
  ClassResolverFeature,
  ClassResolverFeatureKind,
} from './interfaces/class_resolver';

/** What a `provideClassResolver` call registers. */
export interface ClassResolverConfig {
  /** Merges the classes of an element. */
  readonly resolver: ClassResolver;

  /** Whether `withAutoResolution()` resolves the elements that this provider reaches. */
  readonly auto: boolean;
}

/**
 * The resolver that merges an element's classes for its `(class)` and `(attr.class)` bindings, and
 * whether elements without such a binding are resolved automatically. Without a provider, the
 * bindings use the plain merge and nothing is resolved automatically.
 */
export const CLASS_RESOLVER = new InjectionToken<ClassResolverConfig>(
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
 * With `withAutoResolution()` in the root providers, the resolver also resolves every element that
 * a component or directive matches. Below the root, a component turns that off for its template by
 * providing the resolver without the feature, and back on by providing it with the feature.
 *
 * ```ts
 * bootstrapApplication(App, {providers: [provideClassResolver(twMerge, withAutoResolution())]});
 * ```
 *
 * @param resolver Merges the classes of an element.
 * @param features Features of the resolver, such as `withAutoResolution()`.
 *
 * @experimental 22.3
 */
export function provideClassResolver(
  resolver: ClassResolver,
  ...features: ClassResolverFeature[]
): Provider {
  const auto = features.some(
    (feature) => feature.ɵkind === ClassResolverFeatureKind.AutoResolution,
  );
  return [
    {provide: CLASS_RESOLVER, useValue: {resolver, auto}},
    features.map((feature) => feature.ɵproviders),
  ];
}
