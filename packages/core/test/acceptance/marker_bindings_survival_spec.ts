/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {NgIf, NgTemplateOutlet} from '@angular/common';
import {AnimationCallbackEvent, Component, Directive, Input, signal, Type} from '@angular/core';
import {isNode, nextAnimationFrame} from '@angular/private/testing';
import {TestBed} from '@angular/core/testing';
import {provideRouter, RouterOutlet} from '@angular/router';

/** What rendering a template left behind. */
interface Outcome {
  /** Text of the root element, without whitespace. */
  text: string;
  /** Classes found on any rendered element, as `tag.class`. */
  classes: string[];
  /** Attributes other than `class` found on any rendered element, as `tag[name]`. */
  attrs: string[];
  /** `NG0xxx` codes logged through `console.error`. */
  logged: string[];
  /** `NG0xxx` code or first line of the error thrown while rendering, if any. */
  thrown: string | null;
  /** How often `h()` ran after a `click` on every rendered node. */
  hits: number;
}

function errorCode(message: string): string {
  if (message.startsWith('Errors during JIT compilation')) {
    return 'JIT parse error';
  }
  return /NG0\d+/.exec(message)?.[0] ?? message.split('\n')[0];
}

async function render(template: string, imports: Type<unknown>[] = []): Promise<Outcome> {
  const logged: string[] = [];
  const consoleError = jasmine.isSpy(console.error)
    ? (console.error as jasmine.Spy)
    : spyOn(console, 'error');
  consoleError.and.callFake((first: unknown) => logged.push(errorCode(String(first))));

  let hits = 0;
  @Component({template, imports: [NgIf, NgTemplateOutlet, ...imports]})
  class App {
    v = true;
    h() {
      hits++;
    }
  }

  let root: HTMLElement;
  try {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    root = fixture.nativeElement;
  } catch (e) {
    const thrown = errorCode((e as Error).message);
    return {text: '', classes: [], attrs: [], logged, thrown, hits};
  }

  const nodes: Node[] = [];
  const walk = (node: Node) => {
    nodes.push(node);
    node.childNodes.forEach(walk);
  };
  walk(root);
  for (const node of nodes) {
    node.dispatchEvent(new Event('click', {bubbles: false}));
  }

  const elements = Array.from(root.querySelectorAll('*'));
  const tag = (el: Element) => el.tagName.toLowerCase();
  return {
    text: (root.textContent ?? '').replace(/\s+/g, ''),
    classes: elements.flatMap((el) => Array.from(el.classList).map((c) => `${tag(el)}.${c}`)),
    attrs: elements.flatMap((el) =>
      el
        .getAttributeNames()
        .filter((name) => name !== 'class' && !name.startsWith('ng-') && !name.startsWith('_ng'))
        .map((name) => `${tag(el)}[${name}]`),
    ),
    logged,
    thrown: null,
    hits,
  };
}

@Component({
  selector: 'proj',
  template: `<header><ng-content select="[card-header]" /></header>
    |
    <footer><ng-content /></footer>`,
})
class Proj {}

@Directive({selector: '[static-input-dir]'})
class StaticInputDir {
  static last: unknown;
  @Input() set foo(value: unknown) {
    StaticInputDir.last = value;
  }
}

/** Builds a component whose template is `template` and that wraps `<b class="kid">X</b>`. */
function wrapperWith(template: string, imports: Type<unknown>[] = []): Type<unknown> {
  @Component({selector: 'wrap', template, imports})
  class Wrap {
    v = false;
    h() {}
  }
  return Wrap;
}

describe('what survives on Angular marker elements', () => {
  describe('structural wrappers', () => {
    it('projects a structural element by its copied attributes and binds it once', async () => {
      expect(
        await render(
          `<proj><div *ngIf="v" card-header [class.a]="v" (click)="h()" title="t">D</div></proj>`,
          [Proj],
        ),
      ).toEqual({
        text: 'D|',
        classes: ['div.a'],
        attrs: ['div[card-header]', 'div[title]'],
        logged: [],
        thrown: null,
        hits: 1,
      });
    });

    it('projects a structural ng-container by its copied attributes', async () => {
      expect(
        await render(
          `<proj><ng-container *ngIf="v" card-header [class.a]="v">C</ng-container></proj>`,
          [Proj],
        ),
      ).toEqual({text: 'C|', classes: [], attrs: [], logged: [], thrown: null, hits: 0});
    });
  });

  describe('binding names', () => {
    it('projects ng-container by the name of an unclaimed property binding', async () => {
      expect(
        await render(`<proj><ng-container [card-header]="v">B</ng-container></proj>`, [Proj]),
      ).toEqual({text: 'B|', classes: [], attrs: [], logged: ['NG0303'], thrown: null, hits: 0});
    });
  });

  describe('static attributes', () => {
    for (const tag of ['ng-container', 'ng-template']) {
      it(`${tag}: sets a directive input from a static attribute`, async () => {
        StaticInputDir.last = undefined;
        await render(`<${tag} static-input-dir foo="bar"></${tag}>`, [StaticInputDir]);
        expect(StaticInputDir.last).toBe('bar');
      });
    }

    it('keeps ngNonBindable on ng-container', async () => {
      expect((await render(`<ng-container ngNonBindable>{{ v }}</ng-container>`)).text).toBe(
        '{{v}}',
      );
    });
  });

  describe('ng-content', () => {
    async function project(wrapperTemplate: string, imports: Type<unknown>[] = []) {
      return render(`<wrap><b class="kid">X</b></wrap>`, [wrapperWith(wrapperTemplate, imports)]);
    }

    it('drops a property binding', async () => {
      expect(await project(`<ng-content [foo]="v" />`)).toEqual({
        text: 'X',
        classes: ['b.kid'],
        attrs: [],
        logged: [],
        thrown: null,
        hits: 0,
      });
    });

    it('drops class, style, and attribute bindings', async () => {
      expect(
        await project(`<ng-content [class.a]="v" [style.color]="'red'" [attr.title]="'t'" />`),
      ).toEqual({text: 'X', classes: ['b.kid'], attrs: [], logged: [], thrown: null, hits: 0});
    });

    it('drops an event binding', async () => {
      expect(await project(`<ng-content (click)="h()" />`)).toEqual({
        text: 'X',
        classes: ['b.kid'],
        attrs: [],
        logged: [],
        thrown: null,
        hits: 0,
      });
    });

    it('drops static class and title', async () => {
      expect(await project(`<ng-content class="c" title="t" />`)).toEqual({
        text: 'X',
        classes: ['b.kid'],
        attrs: [],
        logged: [],
        thrown: null,
        hits: 0,
      });
    });

    it('applies a structural directive', async () => {
      expect((await project(`<ng-content *ngIf="v" />`, [NgIf])).text).toBe('');
    });
  });

  describe('animations', () => {
    for (const tag of ['ng-container', 'ng-template']) {
      for (const binding of [
        `[animate.enter]="'fade'"`,
        `animate.enter="fade"`,
        `(animate.leave)="h()"`,
      ]) {
        it(`${tag} ${binding}`, async () => {
          const template =
            tag === 'ng-container'
              ? `<ng-container ${binding}><i>c</i></ng-container>`
              : `<ng-template #t ${binding}><i>c</i></ng-template><ng-container [ngTemplateOutlet]="t" />`;
          expect(await render(template)).toEqual({
            text: 'c',
            classes: [],
            attrs: [],
            logged: [],
            thrown: null,
            hits: 0,
          });
        });
      }
    }
  });

  describe('svg', () => {
    it('reports [attr.x] on ng-container inside svg as a parse error', async () => {
      const outcome = await render(`<svg><ng-container [attr.x]="'1'"></ng-container></svg>`);
      expect(outcome.thrown).toBe('JIT parse error');
    });

    it('drops [class.a] on ng-container inside svg', async () => {
      expect(await render(`<svg><ng-container [class.a]="v"></ng-container></svg>`)).toEqual({
        text: '',
        classes: [],
        attrs: [],
        logged: [],
        thrown: null,
        hits: 0,
      });
    });
  });

  describe('router-outlet', () => {
    it('is a real element that keeps its bindings', async () => {
      TestBed.configureTestingModule({providers: [provideRouter([])]});
      expect(await render(`<router-outlet [class.a]="v" title="t" />`, [RouterOutlet])).toEqual({
        text: '',
        classes: ['router-outlet.a'],
        attrs: ['router-outlet[title]'],
        logged: [],
        thrown: null,
        hits: 0,
      });
    });
  });

  describe('animation callbacks', () => {
    // Animations only run in a browser, like in `animation_spec.ts`.
    if (isNode) {
      it('should pass', () => expect(true).toBe(true));
      return;
    }

    const CASES: Array<[label: string, content: string]> = [
      ['element', `<i (animate.enter)="enter($event)" (animate.leave)="leave($event)">c</i>`],
      [
        'ng-container',
        `<ng-container (animate.enter)="enter($event)" (animate.leave)="leave($event)">` +
          `<i>c</i></ng-container>`,
      ],
      [
        'ng-template',
        `<ng-template #t (animate.enter)="enter($event)" (animate.leave)="leave($event)">` +
          `<i>c</i></ng-template><ng-container [ngTemplateOutlet]="t" />`,
      ],
    ];

    for (const [label, content] of CASES) {
      it(`${label}: runs (animate.enter) and (animate.leave)`, async () => {
        TestBed.configureTestingModule({animationsEnabled: true});
        const calls = {enter: 0, leave: 0};
        const template = `@if (show()) {${content}}`;
        @Component({template, imports: [NgTemplateOutlet]})
        class App {
          show = signal(true);
          enter(event: AnimationCallbackEvent) {
            calls.enter++;
            event.animationComplete();
          }
          leave(event: AnimationCallbackEvent) {
            calls.leave++;
            event.animationComplete();
          }
        }

        const fixture = TestBed.createComponent(App);
        await fixture.whenStable();
        await nextAnimationFrame();
        fixture.componentInstance.show.set(false);
        await fixture.whenStable();
        await nextAnimationFrame();

        expect(fixture.nativeElement.textContent.trim()).toBe('');
        if (label === 'element') {
          expect(calls.enter).toBeGreaterThan(0);
          expect(calls.leave).toBeGreaterThan(0);
        } else {
          expect(calls).toEqual({enter: 0, leave: 0});
        }
      });
    }
  });
});
