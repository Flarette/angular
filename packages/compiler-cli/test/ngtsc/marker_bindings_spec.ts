/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import ts from 'typescript';

import {ErrorCode, ngErrorCode} from '../../src/ngtsc/diagnostics';
import {runInEachFileSystem} from '../../src/ngtsc/file_system/testing';
import {loadStandardTestFiles} from '../../src/ngtsc/testing';

import {NgtscTestEnvironment} from './env';

const testFiles = loadStandardTestFiles({fakeCommon: true});

/**
 * Wraps bindings in both tags. Each entry of a case's expectations lists the diagnostics of the
 * `<ng-container>` variant first and the `<ng-template>` variant second.
 */
const TAGS: Array<[name: string, wrap: (bindings: string) => string]> = [
  ['ng-container', (b) => `<ng-container ${b}><span>c</span></ng-container>`],
  ['ng-template', (b) => `<ng-template ${b}><span>c</span></ng-template>`],
];

runInEachFileSystem(() => {
  describe('bindings on ng-container and ng-template', () => {
    let env!: NgtscTestEnvironment;

    beforeEach(() => {
      env = NgtscTestEnvironment.setup(testFiles);
    });

    /**
     * Compiles `template` and returns its diagnostics as `error NG8002` or `warning NG8111`,
     * leaving out unused imports. `metadata` adds fields to the test component's decorator. The
     * result is sorted, because compiler backends report diagnostics in different orders.
     */
    function diagnose(
      template: string,
      options: Record<string, unknown> = {},
      metadata = '',
    ): string[] {
      env.tsconfig({strictTemplates: true, ...options});
      env.write(
        'test.ts',
        `
        import {Component, CUSTOM_ELEMENTS_SCHEMA, Directive, EventEmitter, Input, NO_ERRORS_SCHEMA, Output} from '@angular/core';
        import {CommonModule} from '@angular/common';

        @Directive({selector: '[out-dir]'})
        export class OutDir {
          @Output() out = new EventEmitter<string>();
        }

        @Directive({selector: '[class-input-dir]'})
        export class ClassInputDir {
          @Input() class = '';
        }

        @Directive({
          selector: '[host-dir]',
          host: {'class': 'st', '[class.x]': 'true', '(click)': 'h()'},
        })
        export class HostDir {
          h() {}
        }

        @Component({selector: '[cmp]', template: ''})
        export class Cmp {}

        @Directive({selector: '[static-input-dir]'})
        export class StaticInputDir {
          @Input() foo = '';
        }

        @Component({
          selector: 'proj',
          template: '<ng-content select="[card-header]" /><ng-content />',
        })
        export class Proj {}

        @Component({
          selector: 'test',
          template: \`${template}\`,
          imports: [OutDir, ClassInputDir, HostDir, Cmp, StaticInputDir, Proj, CommonModule],
          ${metadata}
        })
        export class TestCmp {
          v = true;
          h(value?: unknown) {}
        }
      `,
      );
      return env
        .driveDiagnostics()
        .filter((diag) => diag.code !== ngErrorCode(ErrorCode.UNUSED_STANDALONE_IMPORTS))
        .map(
          (diag) =>
            `${diag.category === ts.DiagnosticCategory.Error ? 'error' : 'warning'} ${String(
              diag.code,
            ).replace(/^-99/, 'NG')}`,
        )
        .sort();
    }

    /** Per binding: diagnostics today, `[ng-container, ng-template]`. */
    const CASES: Array<[bindings: string, expected: [string[], string[]]]> = [
      ['class="s"', [['warning NG8031'], ['warning NG8031']]],
      ['style="color: red"', [['warning NG8031'], ['warning NG8031']]],
      ['[class.p]="v"', [['warning NG8031'], ['warning NG8031']]],
      [`[class]="'b'"`, [['warning NG8031'], ['warning NG8031']]],
      [`[style.color]="'red'"`, [['warning NG8031'], ['warning NG8031']]],
      [`[style]="'color: red'"`, [['warning NG8031'], ['warning NG8031']]],
      [`[title]="'t'"`, [['error NG8002'], ['error NG8002']]],
      [`[attr.title]="'t'"`, [['error NG5002'], ['warning NG8031']]],
      ['(click)="h()"', [['warning NG8031'], ['warning NG8031']]],
      [
        '(click)="h"',
        [
          ['warning NG8031', 'warning NG8111'],
          ['warning NG8031', 'warning NG8111'],
        ],
      ],
      [
        '(click)="missing()"',
        [
          ['error 2339', 'warning NG8031'],
          ['error 2339', 'warning NG8031'],
        ],
      ],
      [
        '[title]="missing"',
        [
          ['error 2339', 'error NG8002'],
          ['error 2339', 'error NG8002'],
        ],
      ],
      ['animate.enter="fade"', [['warning NG8031'], ['warning NG8031']]],
      ['host-dir', [[], []]],
      ['cmp', [['warning NG8031'], ['warning NG8031']]],
    ];

    for (const [bindings, expected] of CASES) {
      TAGS.forEach(([tag, wrap], i) => {
        it(`${tag} ${bindings}`, () => {
          expect(diagnose(wrap(bindings))).toEqual(expected[i]);
        });
      });
    }

    it('checks unclaimed camelCase event names', () => {
      const options = {strictUnclaimedEventNames: true};
      expect(diagnose(TAGS[0][1]('out-dir (fooBar)="h()"'), options)).toEqual([
        'error NG8030',
        'warning NG8031',
      ]);
      expect(diagnose(TAGS[1][1]('out-dir (fooBar)="h()"'), options)).toEqual([
        'error NG8030',
        'warning NG8031',
      ]);
    });

    describe('what survives on Angular marker elements', () => {
      const SURVIVAL: Array<[template: string, metadata: string, expected: string[]]> = [
        [`<div *ngIf="v" [class.a]="v" (click)="h()" title="t">D</div>`, '', []],
        [`<ng-container *ngIf="v" [class.a]="v">C</ng-container>`, '', ['warning NG8031']],
        [`<proj><ng-container card-header>H</ng-container></proj>`, '', []],
        [`<proj>@if (v) {<ng-container card-header>H</ng-container>}</proj>`, '', []],
        [`<proj><ng-container *ngIf="v" card-header>H</ng-container></proj>`, '', []],
        [`<proj><ng-container foo>H</ng-container></proj>`, '', ['warning NG8031']],
        [`<proj>@if (v) {<b card-header></b><b></b>}</proj>`, '', ['warning NG8011']],
        [
          `<proj><ng-container ngProjectAs="[card-header]" foo>H</ng-container></proj>`,
          '',
          ['warning NG8031'],
        ],
        [`<ng-container static-input-dir foo="bar"></ng-container>`, '', []],
        [`<ng-template static-input-dir foo="bar"></ng-template>`, '', []],
        [`<ng-container ngNonBindable>{{ v }}</ng-container>`, '', []],
        [`<ng-content [foo]="v" />`, '', ['warning NG8031']],
        [`<ng-content (click)="h()" />`, '', ['warning NG8031']],
        [`<ng-content class="c" title="t" />`, '', ['warning NG8031', 'warning NG8031']],
        [`<ng-content select="[a]" ngProjectAs="b" />`, '', []],
        [`<ng-content SELECT="[a]" />`, '', []],
        [`<ng-content *ngIf="v" />`, '', []],
        [`<ng-container [animate.enter]="'fade'"></ng-container>`, '', ['warning NG8031']],
        [`<ng-template [animate.enter]="'fade'"></ng-template>`, '', ['warning NG8031']],
        [`<ng-container (animate.leave)="h()"></ng-container>`, '', ['warning NG8031']],
        [`<ng-template (animate.enter)="h()"></ng-template>`, '', ['warning NG8031']],
        [`<svg><ng-container [attr.x]="'1'"></ng-container></svg>`, '', ['error NG5002']],
        [`<svg><ng-container [class.a]="v"></ng-container></svg>`, '', ['warning NG8031']],
        [
          `<ng-container [foo]="v"></ng-container>`,
          'schemas: [NO_ERRORS_SCHEMA],',
          ['error NG8002'],
        ],
        [`<ng-template [foo]="v"></ng-template>`, 'schemas: [NO_ERRORS_SCHEMA],', ['error NG8002']],
      ];

      for (const [template, metadata, expected] of SURVIVAL) {
        it(`${template} ${metadata}`, () => {
          expect(diagnose(template, {}, metadata)).toEqual(expected);
        });
      }
    });

    describe('configuration', () => {
      it('reports errors when configured to', () => {
        const options = {extendedDiagnostics: {checks: {noOpMarkerBinding: 'error'}}};
        expect(diagnose(TAGS[0][1]('[class.p]="v"'), options)).toEqual(['error NG8031']);
      });

      it('reports nothing when suppressed', () => {
        const options = {extendedDiagnostics: {checks: {noOpMarkerBinding: 'suppress'}}};
        expect(diagnose(TAGS[0][1]('[class.p]="v"'), options)).toEqual([]);
      });

      it('needs strictTemplates, like extended diagnostics', () => {
        expect(diagnose(TAGS[0][1]('[class.p]="v"'), {strictTemplates: false})).toEqual([]);
      });
    });

    describe('schemas and modes', () => {
      const NO_ERRORS = 'schemas: [NO_ERRORS_SCHEMA],';
      const CASES: Array<
        [template: string, metadata: string, options: object, expected: string[]]
      > = [
        [`<ng-container [class.p]="v"></ng-container>`, NO_ERRORS, {}, ['warning NG8031']],
        [`<ng-template [class.p]="v"></ng-template>`, NO_ERRORS, {}, ['warning NG8031']],
        [`<ng-container (click)="h()"></ng-container>`, NO_ERRORS, {}, ['warning NG8031']],
        [`<ng-template (click)="h()"></ng-template>`, NO_ERRORS, {}, ['warning NG8031']],
        [`<ng-container title="t"></ng-container>`, NO_ERRORS, {}, ['warning NG8031']],
        [`<ng-template title="t"></ng-template>`, NO_ERRORS, {}, ['warning NG8031']],
        [
          `<ng-template [foo]="v"></ng-template>`,
          'schemas: [CUSTOM_ELEMENTS_SCHEMA],',
          {},
          ['error NG8002'],
        ],
        [
          `<ng-template [title]="v" (click)="missing()"></ng-template>`,
          '',
          {strictTemplates: false},
          [],
        ],
        [
          `<ng-container [foo]="v"></ng-container>`,
          NO_ERRORS,
          {strictTemplates: false},
          ['error NG8002'],
        ],
        [`<ng-component [class.x]="v"></ng-component>`, '', {}, ['error NG8001']],
      ];

      for (const [template, metadata, options, expected] of CASES) {
        it(`${template} ${metadata} ${JSON.stringify(options)}`, () => {
          expect(diagnose(template, options as Record<string, unknown>, metadata)).toEqual(
            expected,
          );
        });
      }
    });

    describe('legitimate uses that must stay valid', () => {
      const VALID: string[] = [
        'out-dir (out)="h($event)"',
        '(document:ping)="h()"',
        '(window:resize)="h($event)"',
        `class-input-dir [class]="'b'"`,
        'static-input-dir class="foo" role="tab"',
        'ngProjectAs="[card-header]"',
        'i18n',
      ];

      for (const bindings of VALID) {
        TAGS.forEach(([tag, wrap]) => {
          it(`${tag} ${bindings}`, () => {
            expect(diagnose(wrap(bindings))).toEqual([]);
          });
        });
      }

      it('accepts ngTemplateOutlet, references, and let- variables', () => {
        expect(
          diagnose(
            `<ng-template #t let-x><span>{{x}}</span></ng-template>` +
              `<ng-container [ngTemplateOutlet]="t" [ngTemplateOutletContext]="{$implicit: v}"/>`,
          ),
        ).toEqual([]);
      });

      it('accepts structural directives on both tags', () => {
        expect(
          diagnose(
            `<ng-container *ngTemplateOutlet="t"/><ng-template #t><span>c</span></ng-template>`,
          ),
        ).toEqual([]);
      });
    });
  });
});
