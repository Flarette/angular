/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {InjectionToken} from '../di/injection_token';
import {InternalInjectFlags} from '../di/interface/injector';
import {inject} from '../di/injector_compatibility';
import {RuntimeError, RuntimeErrorCode} from '../errors';

import {CLASS_RESOLVER, ClassResolverConfig} from './class_resolver_provider';
import {getOrCreateInjectable, setIncludeViewProviders} from './di';
import {
  applyResolvedClasses,
  collectClassSources,
  createTClassResolver,
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
} from './interfaces/class_resolver';
import {ComponentDef} from './interfaces/definition';
import {TElementNode, TNode} from './interfaces/node';
import {RElement} from './interfaces/renderer_dom';
import {isComponentHost, isRootView} from './interfaces/type_checks';
import {
  DECLARATION_COMPONENT_VIEW,
  INJECTOR,
  LView,
  RENDERER,
  TView,
  TVIEW,
} from './interfaces/view';
import {getComponentLViewByIndex, getNativeByTNode} from './util/view_utils';

/**
 * Whether the root providers declare automatic resolution. Below the root, a provider can turn it
 * back on only if the root declares it.
 */
const AUTO_RESOLUTION_IN_ROOT = new InjectionToken<boolean>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'AUTO_RESOLUTION_IN_ROOT' : '',
  {
    providedIn: 'root',
    factory: () => inject(CLASS_RESOLVER, {self: true, optional: true})?.auto === true,
  },
);

/**
 * The resolver of each component view and root view where automatic resolution is on. The views of
 * a component's template take the setting of the component's view.
 */
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

/**
 * Sets up automatic resolution for an element that a component or directive matches, once its
 * directives are created, and looks up the setting of the component's view on a component host.
 */
function setUpClassResolution(tView: TView, lView: LView, tNode: TElementNode): void {
  if (isRootView(lView)) {
    // The root view of a component created in code holds only the component's host, which takes
    // the setting of the place where the component is inserted.
    decideAutoResolution(lView, lView[INJECTOR].get(CLASS_RESOLVER, null), lView, tNode, false);
  }

  // Every instance of the template shares the data, so every element that a component or directive
  // matches gets it, whatever this instance's setting is. An element whose host bindings registered
  // a resolver already has it, and a template's `(class)` binding registers after this.
  if (tView.firstCreatePass && tNode.classResolver === null) {
    createTClassResolver(tView, lView, tNode, 5);
  }
  const tClassResolver = tNode.classResolver;
  if (tClassResolver !== null && tClassResolver.owners.length === 0) {
    const resolver = autoResolvers.get(lView[DECLARATION_COMPONENT_VIEW]);
    if (resolver !== undefined) {
      lView[tClassResolver.index + 3] = resolver;
      seedHydratedClasses(tNode, lView, tClassResolver.index + 1);
    }
  }

  if (isComponentHost(tNode)) {
    // The component's template sees its `providers` and `viewProviders`.
    const previousIncludeViewProviders = setIncludeViewProviders(true);
    let config: ClassResolverConfig | null;
    try {
      config = getOrCreateInjectable<ClassResolverConfig>(
        tNode,
        lView,
        CLASS_RESOLVER,
        InternalInjectFlags.Optional,
      );
    } finally {
      setIncludeViewProviders(previousIncludeViewProviders);
    }
    decideAutoResolution(
      getComponentLViewByIndex(tNode.index, lView),
      config,
      lView,
      tNode,
      autoResolvers.has(lView[DECLARATION_COMPONENT_VIEW]),
    );
  }
}

/**
 * Turns automatic resolution on for a component view or a root view if its template sees a
 * provider with `withAutoResolution()` and the root providers declare it.
 *
 * @param view The component view or root view.
 * @param config The provider that the view's template sees.
 * @param hostLView The view that holds the component's host.
 * @param hostTNode The component's host.
 * @param isOnAbove Whether automatic resolution is on where the host is. The root check passed
 *     above it then.
 */
function decideAutoResolution(
  view: LView,
  config: ClassResolverConfig | null,
  hostLView: LView,
  hostTNode: TNode,
  isOnAbove: boolean,
): void {
  if (config === null || !config.auto) {
    return;
  }
  if (!isOnAbove && !hostLView[INJECTOR].get(AUTO_RESOLUTION_IN_ROOT, false)) {
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
    // In production, the provider is ignored.
    return;
  }
  autoResolvers.set(view, config.resolver);
}

/**
 * Resolves an element without a registration in an instance where automatic resolution is on.
 * Calls the resolver only when the classes of a source changed since the previous resolution.
 */
function refreshAutoResolvedClasses(tView: TView, lView: LView, tNode: TNode): void {
  const tClassResolver = tNode.classResolver!;
  const resolver = lView[tClassResolver.index + 3] as ClassResolver | null;
  if (resolver === null) {
    // Off in this instance; the styling instructions applied the classes.
    return;
  }
  const classes = collectClassSources(tView.data, lView, tClassResolver).map((classNames) =>
    classNames.join(' '),
  );
  const previous = lView[tClassResolver.index + 4] as string[] | null;
  if (
    previous !== null &&
    previous[0] === classes[0] &&
    previous[1] === classes[1] &&
    previous[2] === classes[2]
  ) {
    return;
  }
  applyResolvedClasses(
    lView[RENDERER],
    getNativeByTNode(tNode, lView) as RElement,
    tNode,
    lView,
    tClassResolver.index + 1,
    readClassNames(resolver(...classes)),
  );
  lView[tClassResolver.index + 4] = classes;
}
