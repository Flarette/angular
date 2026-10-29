/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {InternalInjectFlags} from '../../di/interface/injector';
import {formatRuntimeError, RuntimeError, RuntimeErrorCode} from '../../errors';
import {KeyValueArray} from '../../util/array_utils';
import {EMPTY_ARRAY} from '../../util/empty';
import {CLASS_RESOLVER, ClassResolverConfig} from '../class_resolver_provider';
import {getOrCreateInjectable, setIncludeViewProviders} from '../di';
import {AttributeMarker} from '../interfaces/attribute_marker';
import {
  ClassBindingValue,
  ClassResolveEvent,
  ClassResolver,
  ClassResolverFlags,
  ClassResolverFn,
  ClassSource,
  ResolvedClasses,
  TClassResolver,
  TClassSourceSegment,
  ɵRESOLVED_CLASSES_BRAND,
} from '../interfaces/class_resolver';
import {DirectiveDef} from '../interfaces/definition';
import {TAttributes, TDirectiveHostNode, TNode, TNodeType} from '../interfaces/node';
import {Renderer} from '../interfaces/renderer';
import {RElement} from '../interfaces/renderer_dom';
import {TStylingKey} from '../interfaces/styling';
import {LView, OpaqueViewState, RENDERER, TData, TView} from '../interfaces/view';
import {applyStyling} from '../node_manipulation';
import {
  getCurrentDirectiveIndex,
  getCurrentTNode,
  getLView,
  getTView,
  wasLastNodeCreated,
  ɵɵrestoreView,
} from '../state';
import {NO_CHANGE} from '../tokens';
import {getNativeByTNode} from '../util/view_utils';
import {allocExpando} from '../view/construction';

import {enableClassResolverHooks} from './class_resolver_hook';
import {classKeyValueArraySet, classStringParser, toStylingKeyValueArray} from './styling';

/**
 * Registers the handler of a `(class)` or `(attr.class)` binding on the current element.
 *
 * Instead of applying class bindings directly, the element collects the classes from every source
 * (component, directives, template) once its host bindings have run. Its resolvers, `resolverFn`
 * among them, then run from the lowest to the highest priority: the lowest receives the collected
 * classes, and each later one receives the previous one's result folded back into `ClassSources`.
 * The classes that the highest one resolves become the element's classes.
 *
 * The binding resolves the element's classes even if a directive on the element declares an output
 * with the same name; the output's emissions don't reach it. On `<ng-container>` and
 * `<ng-template>`, which have no classes, the binding does nothing, and dev mode reports it.
 *
 * @param resolverFn Handler compiled from the binding, which receives a `ClassResolveEvent` as
 * `$event`.
 * @param flags `ClassResolverFlags` of the binding.
 *
 * @codeGenApi
 */
export function ɵɵclassResolver(
  resolverFn: ClassResolverFn,
  flags: number,
): typeof ɵɵclassResolver {
  const lView = getLView<{} | null>();
  const tView = getTView();
  const tNode = getCurrentTNode()!;
  const owner = getCurrentDirectiveIndex();
  if (!(tNode.type & TNodeType.Element)) {
    if (ngDevMode) {
      reportClassResolverOnContainer(tView, owner, flags);
    }
    return ɵɵclassResolver;
  }
  // Appending keeps the priority order: element creation runs the directives' host bindings in
  // match order, before the template's `(class)` registers.
  if (tView.firstCreatePass) {
    classResolverFirstCreatePass(tView, lView, tNode, owner, flags);
  }
  const tClassResolver = tNode.classResolver!;
  ((lView[tClassResolver.index] ??= []) as ClassResolverFn[]).push(resolverFn);
  ((lView[tClassResolver.index + 2] ??= []) as Array<ClassResolver | null>).push(
    injectClassResolver(tNode, lView, owner),
  );
  seedHydratedClasses(tNode, lView, tClassResolver.index + 1);
  return ɵɵclassResolver;
}

/**
 * Records the classes of an element that hydration claimed as the classes that the previous
 * resolution applied. Call it when the element is created.
 *
 * @param appliedIndex Index of the classes that the previous resolution applied.
 */
export function seedHydratedClasses(tNode: TNode, lView: LView, appliedIndex: number): void {
  if (!wasLastNodeCreated() && tNode.classes === null && lView[appliedIndex] === null) {
    // Hydration claimed the element. With static classes, the `class` attribute was rewritten to
    // them, which is where the first resolution starts anyway. Without them, the element keeps the
    // classes that the server resolved, so start from those and remove the ones that only the
    // server resolved. This also removes classes that a directive's constructor added.
    const element = getNativeByTNode(tNode, lView) as RElement;
    lView[appliedIndex] = toStylingKeyValueArray(
      classKeyValueArraySet,
      classStringParser,
      element.getAttribute('class'),
    );
  }
}

/**
 * Reports a `(class)` or `(attr.class)` binding on `<ng-container>` or `<ng-template>`, which has no
 * classes to resolve.
 *
 * @param owner Index of the directive whose host binding this is, or `-1` for the template.
 */
function reportClassResolverOnContainer(tView: TView, owner: number, flags: number): void {
  const form = flags & ClassResolverFlags.Shorthand ? '`(class)`' : '`(attr.class)`';
  const directiveName =
    owner === -1 ? null : (tView.data[owner] as DirectiveDef<unknown>).type.name;
  const binding =
    directiveName === null ? `${form} binding` : `${form} host binding of \`${directiveName}\``;
  console.error(
    formatRuntimeError(
      RuntimeErrorCode.CLASS_RESOLVER_ON_CONTAINER,
      `The ${binding} can't resolve classes on \`<ng-container>\` or \`<ng-template>\`, because ` +
        'neither is rendered as an element. ' +
        (directiveName === null
          ? 'Bind it on an element instead.'
          : `Apply \`${directiveName}\` to an element instead.`),
    ),
  );
}

/**
 * Looks up the registered `ClassResolver` from the element's injector, the way the registration's
 * owner injects it: only the component on the element sees its own `viewProviders`.
 */
function injectClassResolver(tNode: TNode, lView: LView, owner: number): ClassResolver | null {
  const isComponent =
    tNode.componentOffset > -1 && owner === tNode.directiveStart + tNode.componentOffset;
  const previousIncludeViewProviders = setIncludeViewProviders(isComponent);
  try {
    const config = getOrCreateInjectable<ClassResolverConfig>(
      tNode as TDirectiveHostNode,
      lView,
      CLASS_RESOLVER,
      InternalInjectFlags.Optional,
    );
    return config === null ? null : config.resolver;
  } finally {
    setIncludeViewProviders(previousIncludeViewProviders);
  }
}

function classResolverFirstCreatePass(
  tView: TView,
  lView: LView,
  tNode: TNode,
  owner: number,
  flags: ClassResolverFlags,
): void {
  if (tNode.classResolver !== null) {
    // Automatic resolution or an earlier registration set the element up. Only inheritance
    // registers a second resolver for one directive: its host bindings run its base class's first.
    if (ngDevMode && owner !== -1 && tNode.classResolver.owners.includes(owner)) {
      throw new RuntimeError(
        RuntimeErrorCode.MULTIPLE_CLASS_RESOLVERS,
        `\`${(tView.data[owner] as DirectiveDef<unknown>).type.name}\` has more than one class ` +
          'resolver, through inheritance. A directive can have at most one `(class)` or ' +
          '`(attr.class)` binding in its host, including the ones it inherits from its base ' +
          'classes.',
      );
    }
    tNode.classResolver.owners.push(owner);
    tNode.classResolver.flags.push(flags);
    return;
  }

  // Change detection and the styling instructions reach the runtime only through these hooks, and
  // only for nodes and views that have resolver data.
  enableClassResolverHooks(refreshClassResolvers, registerClassResolverBinding);
  const tClassResolver = createTClassResolver(tView, lView, tNode, 3);
  tClassResolver.owners.push(owner);
  tClassResolver.flags.push(flags);
}

/**
 * Creates the resolver data of an element, without registrations, and adds the element to the
 * view's elements with resolver data.
 *
 * @param slots Number of per-instance slots: 3 for registrations, 5 with automatic resolution.
 */
export function createTClassResolver(
  tView: TView,
  lView: LView,
  tNode: TNode,
  slots: number,
): TClassResolver {
  const tData = tView.data;
  const segments: TClassSourceSegment[] = [];
  for (let i = tNode.directiveStart; i < tNode.directiveEnd; i++) {
    segments.push({
      source: classSourceOf(tNode, i),
      directiveIndex: i,
      statics: readStaticClasses((tData[i] as DirectiveDef<unknown>).hostAttrs),
      bindings: [],
    });
  }
  segments.push({
    source: ClassSource.Template,
    directiveIndex: -1,
    statics: readStaticClasses(tNode.attrs),
    bindings: [],
  });

  const tClassResolver: TClassResolver = {
    index: allocExpando(tView, lView, slots, null),
    owners: [],
    flags: [],
    segments,
  };
  (tView.classResolvers ??= []).push(tNode.index);
  return (tNode.classResolver = tClassResolver);
}

/**
 * Records a class binding with the source that owns it, so that the element's `(class)` binding
 * can group the binding's classes by source.
 *
 * @param tClassResolver Resolver data of the element.
 * @param directiveIndex Index of the directive whose host binding this is, or `-1` for the
 *     template.
 * @param bindingIndex Index of the binding.
 */
export function registerClassResolverBinding(
  tClassResolver: TClassResolver,
  directiveIndex: number,
  bindingIndex: number,
): void {
  for (const segment of tClassResolver.segments) {
    if (segment.directiveIndex === directiveIndex) {
      segment.bindings.push(bindingIndex);
      return;
    }
  }
}

function classSourceOf(tNode: TNode, directiveIndex: number): ClassSource {
  if (directiveIndex === -1) {
    return ClassSource.Template;
  }
  // The component's host directives are matched before the component, so they're part of the
  // component's source.
  const componentIndex =
    tNode.componentOffset > -1 ? tNode.directiveStart + tNode.componentOffset : -1;
  return directiveIndex <= componentIndex ? ClassSource.Component : ClassSource.Directives;
}

function readStaticClasses(attrs: TAttributes | null): string[] {
  const classes: string[] = [];
  if (attrs !== null) {
    let marker = AttributeMarker.ImplicitAttributes;
    for (let i = 0; i < attrs.length; i++) {
      const item = attrs[i];
      if (typeof item === 'number') {
        marker = item;
      } else if (marker === AttributeMarker.Classes) {
        classes.push(item as string);
      } else if (marker === AttributeMarker.Styles) {
        // Styles are stored as key/value pairs.
        i++;
      }
    }
  }
  return classes;
}

/**
 * Resolves the classes of every element in the view that has a `(class)` or `(attr.class)` binding.
 *
 * Runs after the view's host bindings so the resolvers see the latest values from all sources.
 * The resolvers run on every refresh because they may read state other than their argument.
 *
 * @param refreshAutomatic Resolves an element that automatic resolution set up without a
 *     registration. Only automatic resolution creates such elements, and it passes this function.
 */
export function refreshClassResolvers(
  tView: TView,
  lView: LView,
  refreshAutomatic?: (tView: TView, lView: LView, tNode: TNode) => void,
): void {
  const resolverNodes = tView.classResolvers!;
  try {
    for (let i = 0; i < resolverNodes.length; i++) {
      const tNode = tView.data[resolverNodes[i]] as TNode;
      const tClassResolver = tNode.classResolver!;
      if (tClassResolver.owners.length === 0) {
        refreshAutomatic!(tView, lView, tNode);
        continue;
      }
      const resolverFns = lView[tClassResolver.index] as ClassResolverFn[];
      const classResolvers = lView[tClassResolver.index + 2] as Array<ClassResolver | null>;
      const lastLevel = resolverFns.length - 1;
      let sources = collectClassSources(tView.data, lView, tClassResolver);
      for (let level = 0; level < lastLevel; level++) {
        const ownerSource = classSourceOf(tNode, tClassResolver.owners[level]);
        const classNames = resolveThroughEvent(
          resolverFns[level],
          tClassResolver.flags[level],
          classResolvers[level],
          sources,
          ownerSource,
        );
        sources = foldClassNames(sources, classNames, ownerSource);
      }
      const resolved = resolveThroughEvent(
        resolverFns[lastLevel],
        tClassResolver.flags[lastLevel],
        classResolvers[lastLevel],
        sources,
        classSourceOf(tNode, tClassResolver.owners[lastLevel]),
      );
      applyResolvedClasses(
        lView[RENDERER],
        getNativeByTNode(tNode, lView) as RElement,
        tNode,
        lView,
        tClassResolver.index + 1,
        resolved,
      );
    }
  } finally {
    // Compiled handlers restore their declaration view and reset it when they return.
    ɵɵrestoreView(lView as unknown as OpaqueViewState);
  }
}

export type CollectedClassSources = [component: string[], directives: string[], template: string[]];

/**
 * Calls the handler of a `(class)` or `(attr.class)` binding with a new `ClassResolveEvent` and
 * returns the classes that it resolved. If the handler doesn't call `resolve()`, the sources pass
 * through.
 *
 * @param classResolver The `ClassResolver` that the event's resolver calls, or `null` for the plain
 *     merge.
 */
function resolveThroughEvent(
  resolverFn: ClassResolverFn,
  flags: ClassResolverFlags,
  classResolver: ClassResolver | null,
  sources: CollectedClassSources,
  ownerSource: ClassSource,
): string[] {
  let resolved: string[] | null = null;
  let calls = 0;
  let sealed = false;
  // `resolver` and `resolve` close over this refresh, so they work when called on their own.
  const event: ClassResolveEvent = {
    sources,
    resolver: (...extras) =>
      new ResolvedClassesImpl(
        mergeClassSources(sources, extras, ownerSource, classResolver),
        event,
      ),
    resolve: (classes) => {
      if (ngDevMode && (sealed || calls > 0)) {
        const form = flags & ClassResolverFlags.Shorthand ? '`(class)`' : '`(attr.class)`';
        throw new RuntimeError(
          RuntimeErrorCode.INVALID_CLASS_RESOLUTION,
          sealed
            ? `The ${form} handler called \`resolve()\` after it returned. Call it while the ` +
                'handler runs.'
            : `The ${form} handler called \`resolve()\` more than once. Call it at most once.`,
        );
      }
      // In production, a late call is ignored.
      if (sealed) {
        return;
      }
      if (
        ngDevMode &&
        flags & ClassResolverFlags.Shorthand &&
        !(classes instanceof ResolvedClassesImpl && classes.event === event)
      ) {
        throw new RuntimeError(
          RuntimeErrorCode.INVALID_CLASS_RESOLUTION,
          "The `(class)` callback returned a value that its own resolver didn't create. Return " +
            "the result of the resolver that the callback receives, such as `(cn) => cn('px-4')`.",
        );
      }
      // Count the call before reading `classes`, whose getters can call `resolve()` again. In
      // production, the call that starts last wins.
      const call = ++calls;
      const classNames = readClassNames(classes);
      if (call === calls) {
        resolved = classNames;
      }
    },
  };
  try {
    resolverFn(event);
  } finally {
    sealed = true;
  }
  return resolved ?? sources.flat();
}

/** Classes that a `ClassResolveEvent`'s resolver merged, with the event that created them. */
class ResolvedClassesImpl implements ResolvedClasses {
  declare readonly [ɵRESOLVED_CLASSES_BRAND]: true;

  constructor(
    readonly classNames: string[],
    readonly event: ClassResolveEvent,
  ) {}

  toString(): string {
    return this.classNames.join(' ');
  }
}

/**
 * Merges the sources with the extras of a `ClassResolveEvent`'s resolver, with `classResolver` or
 * the plain merge. The extras rank at the end of the source of the binding's owner.
 */
function mergeClassSources(
  sources: CollectedClassSources,
  extras: ClassBindingValue[],
  ownerSource: ClassSource,
  classResolver: ClassResolver | null,
): string[] {
  const classes = sources.map((classNames, source) => {
    const names =
      source === ownerSource ? [...classNames, ...extras.flatMap(readClassNames)] : classNames;
    return names.join(' ');
  });
  return readClassNames((classResolver ?? mergeClasses)(...classes));
}

/**
 * The resolver without a registration: flattens the classes in order, drops empty and repeated
 * names, keeping the first position, and joins them with spaces.
 */
function mergeClasses(...classes: string[]): string {
  return readClassNames(classes.join(' ')).join(' ');
}

/**
 * Reads classes for the extras, `resolve()`, and the plain merge the way a `[class]` binding reads
 * them: names without empty and repeated ones, and without the names of an array, a `Set`, or an
 * object map that contain a space. A `ResolvedClasses` gives its own names.
 */
export function readClassNames(value: unknown): string[] {
  if (value instanceof ResolvedClassesImpl) {
    return value.classNames;
  }
  const classNames = new Set<string>();
  const add = (className: unknown) => {
    const name = String(className);
    // A string splits on whitespace, so only the names of an array, a `Set`, or an object map can
    // contain a space.
    if (name !== '' && !name.includes(' ')) {
      classNames.add(name);
    }
  };
  if (typeof value === 'string') {
    for (const className of value.split(/\s+/)) {
      add(className);
    }
  } else if (Array.isArray(value) || value instanceof Set) {
    for (const className of value) {
      add(className);
    }
  } else if (value !== null && typeof value === 'object') {
    const classMap = value as {[className: string]: unknown};
    for (const className of Object.keys(classMap)) {
      if (classMap[className]) {
        add(className);
      }
    }
  }
  return Array.from(classNames);
}

function foldClassNames(
  sources: CollectedClassSources,
  classNames: string[],
  ownerSource: ClassSource,
): CollectedClassSources {
  const origins = new Map<string, ClassSource>();
  for (let source = ClassSource.Component; source <= ClassSource.Template; source++) {
    for (const className of sources[source]) {
      origins.set(className, source);
    }
  }
  const folded: CollectedClassSources = [[], [], []];
  for (const className of classNames) {
    folded[origins.get(className) ?? ownerSource].push(className);
  }
  return folded;
}

/**
 * Groups the element's classes by source.
 *
 * Each class takes the value of the highest-priority binding that has an opinion about it, which
 * matches how class bindings are resolved without a `(class)` binding: a later segment wins over
 * an earlier one, a binding wins over the statics of its segment, and `undefined` defers to lower
 * priorities. A class is reported under the source that decided its value, at that binding's
 * position, so tools like `tailwind-merge` that let later classes win see the right order.
 */
export function collectClassSources(
  tData: TData,
  lView: LView,
  tClassResolver: TClassResolver,
): CollectedClassSources {
  // Insertion order of the map is the priority order. `-1` marks a class turned off.
  const decided = new Map<string, ClassSource | -1>();
  for (const segment of tClassResolver.segments) {
    for (const className of segment.statics) {
      decideClass(decided, className, true, segment.source);
    }
    for (const bindingIndex of segment.bindings) {
      const rawKey = tData[bindingIndex] as TStylingKey;
      const key = Array.isArray(rawKey) ? rawKey[1] : rawKey;
      const value = lView[bindingIndex + 1];
      if (value === NO_CHANGE) {
        // The binding hasn't executed yet.
        continue;
      }
      if (key === null) {
        // `[class]` binding, normalized to a `KeyValueArray`.
        const classes = value as KeyValueArray<unknown>;
        for (let j = 0; j < classes.length; j += 2) {
          decideClass(decided, classes[j] as string, classes[j + 1], segment.source);
        }
      } else {
        // `[class.name]` binding.
        decideClass(decided, key as string, value, segment.source);
      }
    }
  }

  const sources: CollectedClassSources = [[], [], []];
  for (const [className, source] of decided) {
    if (source !== -1) {
      sources[source].push(className);
    }
  }
  return sources;
}

function decideClass(
  decided: Map<string, ClassSource | -1>,
  className: string,
  value: unknown,
  source: ClassSource,
): void {
  if (value === undefined) {
    // No opinion; a lower-priority value stands.
    return;
  }
  // Re-insert so the class moves to the position of the binding that decided it.
  decided.delete(className);
  decided.set(className, value ? source : -1);
}

/**
 * Applies the difference between the previously applied classes and the resolved ones.
 *
 * Only classes managed by the resolver are touched, so classes added by other means (for example
 * `Renderer2.addClass` or animations) stay on the element.
 */
export function applyResolvedClasses(
  renderer: Renderer,
  element: RElement,
  tNode: TNode,
  lView: LView,
  appliedIndex: number,
  resolved: string[],
): void {
  const next = toStylingKeyValueArray(classKeyValueArraySet, classStringParser, resolved);
  // Before the first resolution, an element that wasn't hydrated has the static classes from all
  // sources. `ɵɵclassResolver` records the classes of a hydrated element instead.
  const previous =
    (lView[appliedIndex] as KeyValueArray<unknown> | null) ??
    (tNode.classes === null
      ? (EMPTY_ARRAY as unknown as KeyValueArray<unknown>)
      : toStylingKeyValueArray(classKeyValueArraySet, classStringParser, tNode.classes));

  // Both arrays are sorted by class name, which lets us diff them in one pass.
  let previousIndex = 0;
  let nextIndex = 0;
  while (previousIndex < previous.length || nextIndex < next.length) {
    const previousKey =
      previousIndex < previous.length ? (previous[previousIndex] as string) : null;
    const nextKey = nextIndex < next.length ? (next[nextIndex] as string) : null;
    if (previousKey === nextKey) {
      const isOn = !!next[nextIndex + 1];
      if (!!previous[previousIndex + 1] !== isOn) {
        applyStyling(renderer, true, element, nextKey!, isOn);
      }
      previousIndex += 2;
      nextIndex += 2;
    } else if (nextKey === null || (previousKey !== null && previousKey < nextKey)) {
      if (previous[previousIndex + 1]) {
        applyStyling(renderer, true, element, previousKey!, false);
      }
      previousIndex += 2;
    } else {
      if (next[nextIndex + 1]) {
        applyStyling(renderer, true, element, nextKey, true);
      }
      nextIndex += 2;
    }
  }
  lView[appliedIndex] = next;
}
