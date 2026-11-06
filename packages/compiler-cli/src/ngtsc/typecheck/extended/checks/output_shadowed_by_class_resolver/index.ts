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
 * Warns when a `(class)` or `(attr.class)` binding on an element sits next to a directive output of
 * the same name.
 */
class OutputShadowedByClassResolverCheck extends TemplateCheckWithVisitor<ErrorCode.OUTPUT_SHADOWED_BY_CLASS_RESOLVER> {
  override code = ErrorCode.OUTPUT_SHADOWED_BY_CLASS_RESOLVER as const;

  override visitNode(
    ctx: TemplateContext<ErrorCode.OUTPUT_SHADOWED_BY_CLASS_RESOLVER>,
    component: ts.ClassDeclaration,
    node: TmplAstNode | AST,
  ): NgTemplateDiagnostic<ErrorCode.OUTPUT_SHADOWED_BY_CLASS_RESOLVER>[] {
    // A class resolver on `<ng-container>` is reported by type checking instead.
    if (!(node instanceof TmplAstElement) || isNgContainer(node.name)) return [];

    const bindings = node.outputs.filter(
      (output) => getClassResolverForm(output.name, output.type, output.target) !== null,
    );
    if (bindings.length === 0) return [];

    const directives = ctx.templateTypeChecker.getDirectivesOfNode(component, node) ?? [];
    const diagnostics: NgTemplateDiagnostic<ErrorCode.OUTPUT_SHADOWED_BY_CLASS_RESOLVER>[] = [];

    for (const binding of bindings) {
      const directive = directives.find((dir) => dir.outputs.hasBindingPropertyName(binding.name));
      if (directive === undefined) continue;

      const errorString = formatExtendedError(
        ErrorCode.OUTPUT_SHADOWED_BY_CLASS_RESOLVER,
        `The \`(${binding.name})\` binding resolves the element's classes, so it doesn't listen ` +
          `to the \`${binding.name}\` output of \`${directive.name}\`. Rename the output to ` +
          `listen to it.`,
      );
      diagnostics.push(ctx.makeTemplateDiagnostic(binding.keySpan, errorString));
    }

    return diagnostics;
  }
}

export const factory: TemplateCheckFactory<
  ErrorCode.OUTPUT_SHADOWED_BY_CLASS_RESOLVER,
  ExtendedTemplateDiagnosticName.OUTPUT_SHADOWED_BY_CLASS_RESOLVER
> = {
  code: ErrorCode.OUTPUT_SHADOWED_BY_CLASS_RESOLVER,
  name: ExtendedTemplateDiagnosticName.OUTPUT_SHADOWED_BY_CLASS_RESOLVER,
  create: () => new OutputShadowedByClassResolverCheck(),
};
