/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import ts from 'typescript';

import {ErrorCode, ngErrorCode} from '../../../../../diagnostics';
import {absoluteFrom, getSourceFileOrError} from '../../../../../file_system';
import {runInEachFileSystem} from '../../../../../file_system/testing';
import {getSourceCodeForDiagnostic} from '../../../../../testing';
import {getClass, setup} from '../../../../testing';
import {factory as classResolverShadowedByOutputFactory} from '../../../checks/class_resolver_shadowed_by_output';
import {ExtendedTemplateCheckerImpl} from '../../../src/extended_template_checker';
import {formatExtendedError} from '@angular/compiler-cli/src/ngtsc/typecheck/extended/api';

runInEachFileSystem(() => {
  describe('ClassResolverShadowedByOutputCheck', () => {
    it('should produce a diagnostic when a directive output named class claims a (class) binding', () => {
      const diags = diagnose(`<div dir (class)="resolve($event)"></div>`, {classEvent: 'class'});

      expect(diags.length).toBe(1);
      expect(diags[0].category).toBe(ts.DiagnosticCategory.Warning);
      expect(diags[0].code).toBe(ngErrorCode(ErrorCode.CLASS_RESOLVER_SHADOWED_BY_OUTPUT));
      expect(getSourceCodeForDiagnostic(diags[0])).toBe('class');
      expect(diags[0].messageText).toBe(
        formatExtendedError(
          ErrorCode.CLASS_RESOLVER_SHADOWED_BY_OUTPUT,
          'The `(class)` binding listens to the `class` output of `Dir` instead of resolving the ' +
            "element's classes. Rename the output to use `(class)` as a class resolver on this " +
            'element.',
        ),
      );
    });

    it('should not produce a diagnostic when no directive output is named class', () => {
      const diags = diagnose(`<div dir (class)="resolve($event)"></div>`, {classEvent: 'change'});

      expect(diags.length).toBe(0);
    });

    it('should not produce a diagnostic on <ng-container>', () => {
      const diags = diagnose(`<ng-container dir (class)="resolve($event)" />`, {
        classEvent: 'class',
      });

      expect(diags.length).toBe(0);
    });

    it('should not produce a diagnostic on <ng-container> inside <svg>', () => {
      const diags = diagnose(
        `<svg><ng-container dir (class)="resolve($event)"></ng-container></svg>`,
        {classEvent: 'class'},
      );

      expect(diags.length).toBe(0);
    });
  });
});

function diagnose(template: string, outputs: Record<string, string>) {
  const fileName = absoluteFrom('/main.ts');
  const {program, templateTypeChecker} = setup([
    {
      fileName,
      templates: {'TestCmp': template},
      source: `
        export class TestCmp {
          resolve(value: unknown) { return ''; }
        }

        export class Dir {
          classEvent: any;
        }
      `,
      declarations: [{type: 'directive', name: 'Dir', selector: '[dir]', outputs}],
    },
  ]);
  const sf = getSourceFileOrError(program, fileName);
  const component = getClass(sf, 'TestCmp');
  const extendedTemplateChecker = new ExtendedTemplateCheckerImpl(
    templateTypeChecker,
    program.getTypeChecker(),
    [classResolverShadowedByOutputFactory],
    {} /* options */,
  );
  return extendedTemplateChecker.getDiagnosticsForComponent(component);
}
