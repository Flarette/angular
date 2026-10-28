/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  AST,
  getClassResolverForm,
  isNgContainer,
  TmplAstElement,
  TmplAstNode,
} from '@angular/compiler';
import ts from 'typescript';

import {ErrorCode, ExtendedTemplateDiagnosticName} from '../../../../diagnostics';
import {NgTemplateDiagnostic} from '../../../api';
import {
  TemplateCheckFactory,
  TemplateCheckWithVisitor,
  TemplateContext,
  formatExtendedError,
} from '../../api';

/**
 * Ensures that a `(class)` binding on an element resolves the element's classes. When a directive
 * on the element declares an output named `class`, the binding listens to that output instead, for
 * example `<div withClassOutput (class)="cn($event)"></div>`.
 */
class ClassResolverShadowedByOutputCheck extends TemplateCheckWithVisitor<ErrorCode.CLASS_RESOLVER_SHADOWED_BY_OUTPUT> {
  override code = ErrorCode.CLASS_RESOLVER_SHADOWED_BY_OUTPUT as const;

  override visitNode(
    ctx: TemplateContext<ErrorCode.CLASS_RESOLVER_SHADOWED_BY_OUTPUT>,
    component: ts.ClassDeclaration,
    node: TmplAstNode | AST,
  ): NgTemplateDiagnostic<ErrorCode.CLASS_RESOLVER_SHADOWED_BY_OUTPUT>[] {
    if (!(node instanceof TmplAstElement)) return [];

    // `(class)` on `<ng-container>` is always a listener, in any namespace, because there's no
    // element to style.
    const nodeKind = isNgContainer(node.name) ? 'container' : 'element';
    const binding = node.outputs.find(
      (output) =>
        getClassResolverForm(output.name, output.type, output.target, nodeKind) === 'shorthand',
    );
    if (binding === undefined) return [];

    const directive = ctx.templateTypeChecker
      .getDirectivesOfNode(component, node)
      ?.find((dir) => dir.outputs.hasBindingPropertyName('class'));
    if (directive === undefined) return [];

    const errorString = formatExtendedError(
      ErrorCode.CLASS_RESOLVER_SHADOWED_BY_OUTPUT,
      `The \`(class)\` binding listens to the \`class\` output of \`${directive.name}\` instead ` +
        `of resolving the element's classes. Rename the output to use \`(class)\` as a class ` +
        `resolver on this element.`,
    );
    return [ctx.makeTemplateDiagnostic(binding.keySpan, errorString)];
  }
}

export const factory: TemplateCheckFactory<
  ErrorCode.CLASS_RESOLVER_SHADOWED_BY_OUTPUT,
  ExtendedTemplateDiagnosticName.CLASS_RESOLVER_SHADOWED_BY_OUTPUT
> = {
  code: ErrorCode.CLASS_RESOLVER_SHADOWED_BY_OUTPUT,
  name: ExtendedTemplateDiagnosticName.CLASS_RESOLVER_SHADOWED_BY_OUTPUT,
  create: () => new ClassResolverShadowedByOutputCheck(),
};
