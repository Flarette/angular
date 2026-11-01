/*!
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {NO_ERRORS_SCHEMA} from '../../core';
import {CssSelector, SelectorMatcher} from '../../directive_matching';
import {BindingType, ParsedEventType} from '../../expression_parser/ast';
import {isNgContainer, isNgTemplate} from '../../ml_parser/tags';
import {
  BoundAttribute,
  BoundEvent,
  Content,
  Element,
  Node,
  RecursiveVisitor,
  Template,
  TextAttribute,
  visitAll,
} from '../../render3/r3_ast';
import {createCssSelectorFromNode} from '../../render3/view/util';
import {TcbDirectiveMetadata} from '../api';
import {OutOfBandDiagnosticCategory} from '../oob';
import {TcbOp} from './base';
import type {Context} from './context';

/** An `<ng-container>`, an explicit `<ng-template>`, or an `<ng-content>`. */
export type MarkerNode = Element | Template | Content;

/** Attributes that Angular itself reads on marker elements, see `template_preparser.ts`. */
const MARKER_ATTRIBUTES = new Set(['ngNonBindable', 'ngProjectAs']);

/** Prefixes of attribute names that `<ng-content>` keeps as text but that are meant as bindings. */
const BINDING_PREFIXES = ['[', '(', 'bind-', 'on-', 'bindon-'];

/**
 * A `TcbOp` which reports what Angular drops from an `<ng-container>`, an explicit
 * `<ng-template>`, or an `<ng-content>`: none of them renders an element, so a binding or
 * attribute on them only takes effect if a directive, a content projection slot, or Angular
 * itself uses it.
 *
 * It only reports. Type-checking the expressions of these bindings is left to other ops.
 */
export class TcbMarkerBindingsOp extends TcbOp {
  private readonly category: OutOfBandDiagnosticCategory;

  constructor(
    private tcb: Context,
    private node: MarkerNode,
    private directives: TcbDirectiveMetadata[],
  ) {
    super();
    // `suppress` never creates this op.
    this.category =
      tcb.env.config.noOpMarkerBinding === 'error'
        ? OutOfBandDiagnosticCategory.Error
        : OutOfBandDiagnosticCategory.Warning;
  }

  override readonly optional = false;

  private get isProjected(): boolean {
    return this.tcb.nodesInProjectionSlots.has(this.node);
  }

  override execute(): null {
    const node = this.node;
    if (node instanceof Content) {
      this.checkContent(node);
      return null;
    }

    const claimedInputs = new Set<string>();
    const claimedOutputs = new Set<string>();
    for (const dir of this.directives) {
      for (const name of dir.inputs.propertyNames) claimedInputs.add(name);
      for (const name of dir.outputs.propertyNames) claimedOutputs.add(name);
      if (dir.isComponent) {
        this.tcb.oobRecorder.componentOnMarker(this.tcb.id, this.category, node, dir.name);
      }
    }

    for (const input of node.inputs) {
      const isProperty = input.type === BindingType.Property || input.type === BindingType.TwoWay;
      if (isProperty && claimedInputs.has(input.name)) {
        continue;
      }
      if (this.isDroppedInput(input, isProperty)) {
        this.tcb.oobRecorder.noOpMarkerBinding(this.tcb.id, this.category, node, input);
      }
    }

    for (const output of node.outputs) {
      // Global targets such as `(document:keydown)` work on markers. The `Change` half of an
      // unclaimed `[(x)]` is reported through its property half. `(animate.enter)` and
      // `(animate.leave)` callbacks never run on markers; legacy `(@trigger.done)` callbacks
      // aren't covered, because they haven't been measured.
      const isDroppedEvent =
        output.type === ParsedEventType.Regular || output.type === ParsedEventType.Animation;
      if (!claimedOutputs.has(output.name) && output.target === null && isDroppedEvent) {
        this.tcb.oobRecorder.noOpMarkerBinding(this.tcb.id, this.category, node, output);
      }
    }

    // A matched directive can read any static attribute through `HostAttributeToken`, so only
    // nodes without one are checked.
    if (this.directives.length === 0 && !this.isProjected) {
      for (const attr of node.attributes) {
        if (!isMarkerAttribute(attr.name)) {
          this.tcb.oobRecorder.noOpMarkerBinding(this.tcb.id, this.category, node, attr);
        }
      }
    }

    return null;
  }

  private isDroppedInput(input: BoundAttribute, isProperty: boolean): boolean {
    const isContainer = this.node instanceof Element;
    switch (input.type) {
      case BindingType.Attribute:
        // `[attr.x]` on `<ng-container>` is already a template parse error.
        return !isContainer;
      case BindingType.Class:
      case BindingType.Style:
      case BindingType.Animation:
        return true;
      case BindingType.LegacyAnimation:
        return false;
    }
    if (isProperty && (input.name === 'class' || input.name === 'style')) {
      return true;
    }
    // Unknown properties of `<ng-container>` already get NG8002, unless a schema silences it.
    return !isContainer || this.tcb.schemas.some((s) => s.name === NO_ERRORS_SCHEMA.name);
  }

  private checkContent(node: Content): void {
    for (const attr of node.attributes) {
      const isBinding = BINDING_PREFIXES.some((prefix) => attr.name.startsWith(prefix));
      if (isBinding || (!this.isProjected && isDroppedContentAttribute(attr))) {
        this.tcb.oobRecorder.noOpMarkerBinding(this.tcb.id, this.category, node, attr);
      }
    }
  }
}

function isMarkerAttribute(name: string): boolean {
  return MARKER_ATTRIBUTES.has(name) || name === 'i18n' || name.startsWith('i18n-');
}

function isContentAttribute(name: string): boolean {
  // The preparser matches `select` in any case.
  return isMarkerAttribute(name) || name.toLowerCase() === 'select';
}

function isDroppedContentAttribute(attr: TextAttribute): boolean {
  // `*x`, `#x`, and `let-x` are handled by the template transform, not kept as attributes.
  return (
    !isContentAttribute(attr.name) &&
    !attr.name.startsWith('*') &&
    !attr.name.startsWith('#') &&
    !attr.name.startsWith('ref-') &&
    !attr.name.startsWith('let-')
  );
}

/** Whether `node` is an `<ng-container>`, an explicit `<ng-template>`, or an `<ng-content>`. */
export function isMarkerNode(node: Node): node is MarkerNode {
  if (node instanceof Element) return isNgContainer(node.name);
  if (node instanceof Template) return isExplicitNgTemplate(node);
  return node instanceof Content;
}

/** Whether `template` was written as `<ng-template>`, rather than created by `*` syntax. */
function isExplicitNgTemplate(template: Template): boolean {
  return template.tagName !== null && isNgTemplate(template.tagName);
}

/**
 * Finds the nodes that a specific content projection slot of a component selects among its
 * content, looking through control flow blocks the way content projection does. Static attributes
 * of those nodes take part in projection, so they aren't dropped.
 */
export function getNodesInProjectionSlots(
  children: Node[],
  ngContentSelectors: string[] | null,
): Set<Node> {
  const matcher = new SelectorMatcher<string>();
  for (const selector of ngContentSelectors ?? []) {
    // `*` is the catch-all slot, which doesn't read any attribute.
    if (selector !== '*') {
      matcher.addSelectables(CssSelector.parse(selector), selector);
    }
  }

  const collector = new ProjectionCandidateCollector();
  visitAll(collector, children);

  const result = new Set<Node>();
  for (const candidate of collector.candidates) {
    // A structural wrapper is projected by the tag and attributes of the node it wraps.
    const target =
      candidate instanceof Template &&
      !isExplicitNgTemplate(candidate) &&
      candidate.children.length === 1
        ? candidate.children[0]
        : candidate;
    if (target instanceof Content || ngContentSelectors === null) {
      // An `<ng-content>` can be projected again, and a component whose slots are unknown may
      // select any of its content; keep their attributes conservatively.
      result.add(target);
    } else if (
      (target instanceof Element || target instanceof Template) &&
      matcher.match(createCssSelectorFromNode(target), null)
    ) {
      result.add(target);
    }
  }
  return result;
}

/** Collects the nodes at the root of a component's content, descending only into blocks. */
class ProjectionCandidateCollector extends RecursiveVisitor {
  readonly candidates: Node[] = [];

  override visitElement(element: Element): void {
    this.candidates.push(element);
  }

  override visitTemplate(template: Template): void {
    this.candidates.push(template);
  }

  override visitContent(content: Content): void {
    this.candidates.push(content);
  }

  override visitComponent(): void {}
}

/** Builds the message of a no-op marker binding diagnostic, shared by the diagnostic recorders. */
export function getNoOpMarkerBindingMessage(
  node: MarkerNode,
  binding: BoundAttribute | BoundEvent | TextAttribute,
): string {
  const tagName = getMarkerTagName(node);
  const reason =
    node instanceof Content
      ? `because Angular replaces <ng-content> with projected content`
      : `because <${tagName}> doesn't render an element`;

  if (binding instanceof TextAttribute) {
    if (BINDING_PREFIXES.some((prefix) => binding.name.startsWith(prefix))) {
      return (
        `The '${binding.name}' binding has no effect on <${tagName}>, ${reason}. ` +
        `Angular never evaluates bindings on <ng-content>.`
      );
    }
    return (
      `The '${binding.name}' attribute has no effect on <${tagName}>, ${reason}, and no ` +
      `directive or content projection slot reads it.`
    );
  }

  const displayName = getBindingDisplayName(binding);
  if (
    binding instanceof BoundAttribute &&
    (binding.type === BindingType.Property || binding.type === BindingType.TwoWay) &&
    binding.name !== 'class' &&
    binding.name !== 'style'
  ) {
    // An unclaimed property usually means that a directive is missing from the imports.
    return (
      `The '${displayName}' binding has no effect on <${tagName}>, ${reason}. If '${binding.name}' ` +
      `is an input of a directive, add the directive to the component's imports.`
    );
  }
  return (
    `The '${displayName}' binding has no effect on <${tagName}>, ${reason}. ` +
    `Move the binding to an element.`
  );
}

/** Builds the message of a component-on-marker diagnostic, shared by the diagnostic recorders. */
export function getComponentOnMarkerMessage(
  node: Element | Template,
  componentName: string,
): string {
  const tagName = getMarkerTagName(node);
  return (
    `Component '${componentName}' matches <${tagName}>, but <${tagName}> can't host a ` +
    `component because it doesn't render an element. Use an element that matches the ` +
    `component's selector instead.`
  );
}

function getMarkerTagName(node: MarkerNode): string {
  if (node instanceof Content) return 'ng-content';
  return node instanceof Element ? 'ng-container' : 'ng-template';
}

function getBindingDisplayName(binding: BoundAttribute | BoundEvent): string {
  if (binding instanceof BoundEvent) {
    return `(${binding.name})`;
  }
  switch (binding.type) {
    case BindingType.Attribute:
      return `[attr.${binding.name}]`;
    case BindingType.Class:
      return `[class.${binding.name}]`;
    case BindingType.Style:
      return `[style.${binding.name}${binding.unit ? '.' + binding.unit : ''}]`;
    case BindingType.TwoWay:
      return `[(${binding.name})]`;
    default:
      return `[${binding.name}]`;
  }
}
