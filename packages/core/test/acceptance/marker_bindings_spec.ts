/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {NgTemplateOutlet} from '@angular/common';
import {
  Component,
  Directive,
  EventEmitter,
  HostAttributeToken,
  inject,
  Input,
  Output,
  Type,
} from '@angular/core';
import {TestBed} from '@angular/core/testing';

/** What a template did to the DOM, the console, and its handler once rendered. */
interface Probe {
  /** Classes found on any rendered element. */
  classes: string[];
  /** Number of rendered elements that carry a `style` or `title` attribute. */
  styledOrTitled: number;
  /** `NG0xxx` codes logged through `console.error`. */
  logged: string[];
  /** `NG0xxx` code or message of the error thrown while rendering, if any. */
  thrown: string | null;
  /** How often `h()` ran after a `click` on every rendered node and a `ping` on `document`. */
  hits: number;
}

function errorCode(message: string): string {
  if (message.startsWith('Errors during JIT compilation')) {
    return 'JIT parse error';
  }
  return /NG0\d+/.exec(message)?.[0] ?? message.split('\n')[0];
}

async function probe(template: string, imports: Type<unknown>[] = []): Promise<Probe> {
  const logged: string[] = [];
  const consoleError = jasmine.isSpy(console.error)
    ? (console.error as jasmine.Spy)
    : spyOn(console, 'error');
  consoleError.and.callFake((first: unknown) => logged.push(errorCode(String(first))));

  let hits = 0;
  @Component({template, imports: [NgTemplateOutlet, ...imports]})
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
    return {classes: [], styledOrTitled: 0, logged, thrown: errorCode((e as Error).message), hits};
  }

  const nodes: Node[] = [];
  const walk = (node: Node) => {
    nodes.push(node);
    node.childNodes.forEach(walk);
  };
  walk(root);
  for (const node of nodes) {
    node.dispatchEvent(new Event('click', {bubbles: true}));
  }
  root.ownerDocument.dispatchEvent(new Event('ping'));

  const elements = Array.from(root.querySelectorAll('*'));
  return {
    classes: elements.flatMap((el) => Array.from(el.classList)),
    styledOrTitled: elements.filter((el) => el.hasAttribute('style') || el.hasAttribute('title'))
      .length,
    logged,
    thrown: null,
    hits,
  };
}

const NOTHING: Probe = {classes: [], styledOrTitled: 0, logged: [], thrown: null, hits: 0};

@Directive({selector: '[out-dir]'})
class OutDir {
  @Output() out = new EventEmitter<void>();
  ngOnInit() {
    this.out.emit();
  }
}

@Directive({selector: '[p-input-dir]'})
class PInputDir {
  static last: unknown;
  @Input() set p(value: unknown) {
    PInputDir.last = value;
  }
}

@Directive({selector: '[class-input-dir]'})
class ClassInputDir {
  static last: unknown;
  @Input() set class(value: unknown) {
    ClassInputDir.last = value;
  }
}

@Directive({
  selector: '[host-dir]',
  host: {'class': 'st', '[class.x]': 'true', '[style.color]': '"red"', '(click)': 'h()'},
})
class HostDir {
  static hits = 0;
  h() {
    HostDir.hits++;
  }
}

@Directive({selector: '[host-title-dir]', host: {'[title]': '"t"'}})
class HostTitleDir {}

@Directive({selector: '[host-attr-dir]', host: {'[attr.data-x]': '"x"'}})
class HostAttrDir {}

@Directive({selector: '[host-window-dir]', host: {'(document:ping)': 'h()'}})
class HostWindowDir {
  static hits = 0;
  h() {
    HostWindowDir.hits++;
  }
}

@Directive({selector: '.foo'})
class ClassSelectorDir {
  static created = 0;
  constructor() {
    ClassSelectorDir.created++;
  }
}

@Component({selector: '[cmp]', template: 'cmp'})
class Cmp {}

@Component({
  selector: 'proj',
  template: `<header><ng-content select="[card-header]" /></header>
    <section><ng-content select=".x" /></section>
    <footer><ng-content /></footer>`,
})
class Proj {}

/**
 * Wraps bindings `X` in both tags. The `<ng-template>` gets rendered through an outlet so a
 * binding that reached the rendered nodes would show up.
 */
const TAGS: Array<[name: string, wrap: (bindings: string) => string]> = [
  ['ng-container', (b) => `<ng-container ${b}><span>c</span></ng-container>`],
  [
    'ng-template',
    (b) =>
      `<ng-template #t ${b}><span>c</span></ng-template><ng-container [ngTemplateOutlet]="t"/>`,
  ],
];

describe('bindings on ng-container and ng-template', () => {
  beforeEach(() => {
    HostDir.hits = 0;
    HostWindowDir.hits = 0;
    ClassSelectorDir.created = 0;
    PInputDir.last = undefined;
    ClassInputDir.last = undefined;
  });

  /** Per binding: what each tag does today, `[ng-container, ng-template]`. */
  const NO_OP_CASES: Array<[bindings: string, expected: [Partial<Probe>, Partial<Probe>]]> = [
    ['class="s"', [{}, {}]],
    ['style="color: red"', [{}, {}]],
    ['[class.p]="v"', [{}, {logged: ['NG0303']}]],
    [`[class]="'b'"`, [{}, {}]],
    [`[style.color]="'red'"`, [{}, {logged: ['NG0303']}]],
    [`[style]="'color: red'"`, [{}, {}]],
    [`[title]="'t'"`, [{logged: ['NG0303']}, {logged: ['NG0303']}]],
    [`[attr.title]="'t'"`, [{thrown: 'JIT parse error'}, {logged: ['NG0303']}]],
    ['(click)="h()"', [{}, {}]],
  ];

  for (const [bindings, expected] of NO_OP_CASES) {
    TAGS.forEach(([tag, wrap], i) => {
      it(`${tag} ${bindings}`, async () => {
        expect(await probe(wrap(bindings))).toEqual({...NOTHING, ...expected[i]});
      });
    });
  }

  describe('host bindings of a directive', () => {
    TAGS.forEach(([tag, wrap]) => {
      it(`${tag}: class, [class.x], [style.color], and (click) do nothing`, async () => {
        expect(await probe(wrap('host-dir'), [HostDir])).toEqual(NOTHING);
        expect(HostDir.hits).toBe(0);
      });

      it(`${tag}: [title] logs NG0303`, async () => {
        expect(await probe(wrap('host-title-dir'), [HostTitleDir])).toEqual({
          ...NOTHING,
          logged: ['NG0303'],
        });
      });

      it(`${tag}: [attr.data-x] throws`, async () => {
        const result = await probe(wrap('host-attr-dir'), [HostAttrDir]);
        expect(result.thrown).toContain(
          'Host bindings are not valid on ng-container or ng-template',
        );
      });
    });
  });

  describe('components', () => {
    TAGS.forEach(([tag, wrap]) => {
      it(`${tag} can't host a component`, async () => {
        const result = await probe(wrap('cmp'), [Cmp]);
        expect(result.thrown).toContain(`tags cannot be used as component hosts`);
      });
    });
  });

  it(`doesn't feed a static class or [class.p] into a directive's class input`, async () => {
    expect(
      await probe(TAGS[0][1]('class-input-dir class="s" [class.p]="v"'), [ClassInputDir]),
    ).toEqual(NOTHING);
    expect(ClassInputDir.last).toBeUndefined();
    expect(
      await probe(TAGS[1][1]('class-input-dir class="s" [class.p]="v"'), [ClassInputDir]),
    ).toEqual({...NOTHING, logged: ['NG0303']});
    expect(ClassInputDir.last).toBeUndefined();
  });

  it('feeds [class.p] on ng-template into a directive input named `p`', async () => {
    expect(await probe(TAGS[1][1]('p-input-dir [class.p]="v"'), [PInputDir])).toEqual(NOTHING);
    expect(PInputDir.last).toBe(true);
  });

  describe('legitimate uses that must stay valid', () => {
    TAGS.forEach(([tag, wrap]) => {
      it(`${tag}: directive outputs fire`, async () => {
        expect(await probe(wrap('out-dir (out)="h()"'), [OutDir])).toEqual({...NOTHING, hits: 1});
      });

      it(`${tag}: global event targets fire`, async () => {
        expect(await probe(wrap('(document:ping)="h()"'))).toEqual({...NOTHING, hits: 1});
      });

      it(`${tag}: global host listeners fire`, async () => {
        expect(await probe(wrap('host-window-dir'), [HostWindowDir])).toEqual(NOTHING);
        expect(HostWindowDir.hits).toBe(1);
      });

      it(`${tag}: [class] feeds a directive's class input`, async () => {
        expect(await probe(wrap(`class-input-dir [class]="'b'"`), [ClassInputDir])).toEqual(
          NOTHING,
        );
        expect(ClassInputDir.last).toBe('b');
      });

      it(`${tag}: a static class matches a class selector`, async () => {
        await probe(wrap('class="foo"'), [ClassSelectorDir]);
        expect(ClassSelectorDir.created).toBe(1);
      });
    });

    it('projects ng-container by static attribute, class, and ngProjectAs', async () => {
      @Component({
        template: `<proj>
          <ng-container card-header>H</ng-container>
          <ng-container class="x">X</ng-container>
          <ng-container ngProjectAs="[card-header]">P</ng-container>
        </proj>`,
        imports: [Proj],
      })
      class App {}

      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('header')!.textContent).toBe('HP');
      expect(root.querySelector('section')!.textContent).toBe('X');
    });

    TAGS.forEach(([tag, wrap]) => {
      it(`${tag}: directives read static attributes`, async () => {
        const seen: string[] = [];
        @Directive({selector: '[attr-reader]'})
        class AttrReader {
          constructor() {
            seen.push(inject(new HostAttributeToken('role')));
          }
        }

        expect(await probe(wrap('attr-reader role="tab"'), [AttrReader])).toEqual(NOTHING);
        expect(seen).toEqual(['tab']);
      });
    });
  });
});
