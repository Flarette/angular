/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {formatRuntimeError, RuntimeErrorCode} from '../../errors';
import {KeyValueArray} from '../../util/array_utils';
import {EMPTY_ARRAY} from '../../util/empty';
import {AttributeMarker} from '../interfaces/attribute_marker';
import {
  ClassResolverFn,
  ClassSource,
  ClassSources,
  TClassResolver,
  TClassSourceSegment,
} from '../interfaces/class_resolver';
import {DirectiveDef} from '../interfaces/definition';
import {TAttributes, TNode} from '../interfaces/node';
import {Renderer} from '../interfaces/renderer';
import {RElement} from '../interfaces/renderer_dom';
import {TStylingKey} from '../interfaces/styling';
import {LView, OpaqueViewState, RENDERER, TData, TView} from '../interfaces/view';
import {applyStyling} from '../node_manipulation';
import {getCurrentTNode, getLView, getTView, wasLastNodeCreated, ɵɵrestoreView} from '../state';
import {NO_CHANGE} from '../tokens';
import {getNativeByTNode} from '../util/view_utils';
import {allocExpando} from '../view/construction';

import {listenerInternal} from './listener';
import {classKeyValueArraySet, classStringParser, toStylingKeyValueArray} from './styling';

/**
 * Registers the handler of a `(class)` binding on the current element.
 *
 * Instead of applying class bindings directly, the element collects the classes from every source
 * (component, directives, template) and passes them to `resolverFn` once its host bindings have
 * run. The value that `resolverFn` returns becomes the element's classes.
 *
 * If a directive on the element declares an output named `class`, the binding keeps its existing
 * meaning and subscribes to that output instead.
 *
 * @param resolverFn Handler compiled from the binding. Receives the `ClassSources` as `$event`.
 *
 * @codeGenApi
 */
export function ɵɵclassResolver(resolverFn: ClassResolverFn): typeof ɵɵclassResolver {
  const lView = getLView<{} | null>();
  const tView = getTView();
  const tNode = getCurrentTNode()!;
  // The template and host bindings of several directives can each register a resolver for the
  // same element. They share the element's state, and the last one registered wins: the
  // template's over the directives', and later directives' over earlier ones.
  if (tView.firstCreatePass && tNode.classResolver === null) {
    classResolverFirstCreatePass(tView, lView, tNode);
  }
  const tClassResolver = tNode.classResolver;
  if (tClassResolver === null) {
    listenerInternal(tView, lView, lView[RENDERER], tNode, 'class', resolverFn);
    return ɵɵclassResolver;
  }
  lView[tClassResolver.index] = resolverFn;
  const appliedIndex = tClassResolver.index + 1;
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
  return ɵɵclassResolver;
}

function classResolverFirstCreatePass(tView: TView, lView: LView, tNode: TNode): void {
  if (tNode.outputs?.['class'] || tNode.hostDirectiveOutputs?.['class']) {
    if (ngDevMode) {
      console.warn(
        formatRuntimeError(
          RuntimeErrorCode.CLASS_RESOLVER_OUTPUT_CONFLICT,
          `The \`(class)\` binding on <${tNode.value}> listens to a directive output named ` +
            `\`class\` instead of resolving the element's classes. Rename the output to use ` +
            `\`(class)\` as a class resolver on this element.`,
        ),
      );
    }
    return;
  }

  const tData = tView.data;
  const componentIndex =
    tNode.componentOffset > -1 ? tNode.directiveStart + tNode.componentOffset : -1;
  const segments: TClassSourceSegment[] = [];
  for (let i = tNode.directiveStart; i < tNode.directiveEnd; i++) {
    segments.push({
      // The component's host directives are matched before the component, so they're part of
      // the component's source.
      source: i <= componentIndex ? ClassSource.Component : ClassSource.Directives,
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

  tNode.classResolver = {index: allocExpando(tView, lView, 2, null), segments};
  (tView.classResolvers ??= []).push(tNode.index);
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
 * Resolves the classes of every element in the view that has a `(class)` binding.
 *
 * Runs after the view's host bindings so the resolver sees the latest values from all sources.
 * The resolver runs on every refresh because it may read state other than its argument.
 */
export function refreshClassResolvers(tView: TView, lView: LView): void {
  const resolverNodes = tView.classResolvers!;
  try {
    for (let i = 0; i < resolverNodes.length; i++) {
      const tNode = tView.data[resolverNodes[i]] as TNode;
      const tClassResolver = tNode.classResolver!;
      const resolverFn = lView[tClassResolver.index] as ClassResolverFn;
      const sources = collectClassSources(tView.data, lView, tClassResolver);
      let resolved = resolverFn(sources);
      if (typeof resolved === 'function') {
        resolved = resolved(sources);
      }
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

/**
 * Groups the element's classes by source.
 *
 * Each class takes the value of the highest-priority binding that has an opinion about it, which
 * matches how class bindings are resolved without a `(class)` binding: a later segment wins over
 * an earlier one, a binding wins over the statics of its segment, and `undefined` defers to lower
 * priorities. A class is reported under the source that decided its value, at that binding's
 * position, so tools like `tailwind-merge` that let later classes win see the right order.
 */
function collectClassSources(
  tData: TData,
  lView: LView,
  tClassResolver: TClassResolver,
): ClassSources {
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

  const sources: [string[], string[], string[]] = [[], [], []];
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
function applyResolvedClasses(
  renderer: Renderer,
  element: RElement,
  tNode: TNode,
  lView: LView,
  appliedIndex: number,
  resolved: unknown,
): void {
  const next = toStylingKeyValueArray(
    classKeyValueArraySet,
    classStringParser,
    resolved as string | string[] | Set<string> | {[key: string]: unknown} | null | undefined,
  );
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
