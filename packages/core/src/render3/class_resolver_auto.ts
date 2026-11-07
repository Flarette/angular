/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {InjectionToken} from '../di/injection_token';
import {inject} from '../di/injector_compatibility';
import {RuntimeError, RuntimeErrorCode} from '../errors';

import {CLASS_RESOLVER, ClassResolverConfig} from './class_resolver_provider';
import {
  applyResolvedClasses,
  collectClassSources,
  createTClassResolver,
  injectClassResolverConfig,
  readClassNames,
  refreshClassResolvers,
  registerClassResolverBinding,
  seedHydratedClasses,
} from './instructions/class_resolver';
import {enableClassResolverHooks} from './instructions/class_resolver_hook';
import {
  ClassResolver,
  ClassResolverFeature,
  ClassResolverFeatureKind,
  ClassResolverSlot,
} from './interfaces/class_resolver';
import {ComponentDef} from './interfaces/definition';
import {TElementNode, TNode} from './interfaces/node';
import {isComponentHost, isRootView} from './interfaces/type_checks';
import {DECLARATION_COMPONENT_VIEW, INJECTOR, LView, TView, TVIEW} from './interfaces/view';
import {getComponentLViewByIndex} from './util/view_utils';

const AUTO_RESOLUTION_IN_ROOT = new InjectionToken<boolean>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'AUTO_RESOLUTION_IN_ROOT' : '',
  {
    providedIn: 'root',
    factory: () => inject(CLASS_RESOLVER, {self: true, optional: true})?.hasAutoResolution === true,
  },
);

/** The resolver of each component view and root view where automatic resolution is on. */
const autoResolvers = /* @__PURE__ */ new WeakMap<LView, ClassResolver>();

/**
 * Resolves every element that a component or directive matches, without a `(class)` binding, with
 * the resolver of `provideClassResolver`. This includes the host of a component created in code
 * and the component's host directives. An element with a `(class)` or `(attr.class)` binding is
 * resolved only through its bindings.
 *
 * Only the root providers, such as those of `bootstrapApplication`, can declare it. Below the
 * root, a component turns automatic resolution off for its template by providing the resolver
 * without this feature, and back on by providing it with this feature. The templates nested in a
 * component's template take its setting. In dev mode, a provider below the root that declares
 * this feature while the root providers don't throws an error; in production, it's ignored.
 *
 * Automatic resolution calls the resolver again only when the classes of a source change.
 *
 * ```ts
 * bootstrapApplication(App, {providers: [provideClassResolver(twMerge, withAutoResolution())]});
 * ```
 *
 * @experimental 22.3
 */
export function withAutoResolution(): ClassResolverFeature {
  enableClassResolverHooks(
    refreshAllClassResolvers,
    registerClassResolverBinding,
    setUpClassResolution,
  );
  return {ɵkind: ClassResolverFeatureKind.AutoResolution, ɵproviders: []};
}

function refreshAllClassResolvers(tView: TView, lView: LView): void {
  refreshClassResolvers(tView, lView, refreshAutoResolvedClasses);
}

function setUpClassResolution(tView: TView, lView: LView, tNode: TElementNode): void {
  if (isRootView(lView)) {
    decideAutoResolution(lView, lView[INJECTOR].get(CLASS_RESOLVER, null), lView, tNode, false);
  }

  if (tView.firstCreatePass && tNode.classResolver === null) {
    createTClassResolver(tView, lView, tNode, ClassResolverSlot.AutoSources + 1);
  }
  const tClassResolver = tNode.classResolver;
  if (tClassResolver !== null && tClassResolver.owners.length === 0) {
    const resolver = autoResolvers.get(lView[DECLARATION_COMPONENT_VIEW]);
    if (resolver !== undefined) {
      lView[tClassResolver.index + ClassResolverSlot.AutoResolver] = resolver;
      seedHydratedClasses(tNode, lView);
    }
  }

  if (isComponentHost(tNode)) {
    // The component's template sees its `providers` and `viewProviders`.
    decideAutoResolution(
      getComponentLViewByIndex(tNode.index, lView),
      injectClassResolverConfig(tNode, lView, true),
      lView,
      tNode,
      autoResolvers.has(lView[DECLARATION_COMPONENT_VIEW]),
    );
  }
}

/**
 * Turns automatic resolution on for `view` when `config` declares it, as long as the root
 * providers declare it too.
 *
 * @param isOnInDeclarationView Whether automatic resolution is on in the view that declares the
 *     host, which means the root providers declare it.
 */
function decideAutoResolution(
  view: LView,
  config: ClassResolverConfig | null,
  hostLView: LView,
  hostTNode: TNode,
  isOnInDeclarationView: boolean,
): void {
  if (config === null || !config.hasAutoResolution) {
    return;
  }
  if (!isOnInDeclarationView && !hostLView[INJECTOR].get(AUTO_RESOLUTION_IN_ROOT, false)) {
    if (ngDevMode) {
      const component = hostLView[TVIEW].data[
        hostTNode.directiveStart + hostTNode.componentOffset
      ] as ComponentDef<unknown>;
      throw new RuntimeError(
        RuntimeErrorCode.AUTO_CLASS_RESOLUTION_BELOW_ROOT,
        `Automatic class resolution is turned on for \`${component.type.name}\` by ` +
          "`withAutoResolution()` in providers below the root, but the root providers don't " +
          'declare it. Provide `provideClassResolver(resolver, withAutoResolution())` in the root ' +
          'providers, such as those of `bootstrapApplication()`.',
      );
    }
    return;
  }
  autoResolvers.set(view, config.resolver);
}

function refreshAutoResolvedClasses(tView: TView, lView: LView, tNode: TNode): void {
  const tClassResolver = tNode.classResolver!;
  const index = tClassResolver.index;
  const resolver = lView[index + ClassResolverSlot.AutoResolver] as ClassResolver | null;
  if (resolver === null) {
    // Off in this instance; the styling instructions applied the classes.
    return;
  }
  const classes = collectClassSources(tView.data, lView, tClassResolver).map((classNames) =>
    classNames.join(' '),
  );
  const previous = lView[index + ClassResolverSlot.AutoSources] as string[] | null;
  if (
    previous !== null &&
    previous[0] === classes[0] &&
    previous[1] === classes[1] &&
    previous[2] === classes[2]
  ) {
    return;
  }
  applyResolvedClasses(tNode, lView, readClassNames(resolver(...classes)));
  lView[index + ClassResolverSlot.AutoSources] = classes;
}
