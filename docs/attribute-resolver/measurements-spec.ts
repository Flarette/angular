/**
 * Scratch measurement, not for commit: how Angular resolves one attribute that several sources set.
 */
import {Component, Directive, signal, WritableSignal} from '../../../src/core';
import {TestBed} from '../../../testing';

type Kind = 'static' | 'attr' | 'prop' | 'style';
type Who = 'C' | 'H' | 'D1' | 'D2' | 'T';

const ATTRS = ['id', 'title', 'role', 'aria-describedby', 'data-x', 'tabindex', 'style'];

function hostFor(attr: string, kind: Kind, who: Who, expr: string): Record<string, string> {
  if (kind === 'static') return {[attr]: valueFor(attr, who)};
  if (kind === 'attr') return {[`[attr.${attr}]`]: expr};
  if (kind === 'style') return {'[style]': expr};
  return {[`[${attr}]`]: expr};
}

function valueFor(attr: string, who: Who): string {
  if (attr === 'style') {
    return {
      C: 'color: red; padding: 4px',
      H: 'color: orange; margin: 1px',
      D1: 'color: green',
      D2: 'color: teal; padding-left: 9px',
      T: 'color: blue; padding-left: 2px',
    }[who];
  }
  if (attr === 'tabindex') return {C: '1', H: '2', D1: '3', D2: '4', T: '5'}[who];
  return who.toLowerCase();
}

interface Case {
  attr: string;
  kinds: Record<Who, Kind | null>;
  importsOrder?: 'D1,D2' | 'D2,D1';
}

function build(c: Case) {
  const sig: Record<Who, WritableSignal<string | null>> = {
    C: signal(valueFor(c.attr, 'C')),
    H: signal(valueFor(c.attr, 'H')),
    D1: signal(valueFor(c.attr, 'D1')),
    D2: signal(valueFor(c.attr, 'D2')),
    T: signal(valueFor(c.attr, 'T')),
  };
  const host = (who: Who) => (c.kinds[who] ? hostFor(c.attr, c.kinds[who]!, who, 'v()') : {});

  const H = Directive({host: host('H')})(
    class {
      v = sig.H;
    },
  );
  const D1 = Directive({selector: '[d1]', host: host('D1')})(
    class {
      v = sig.D1;
    },
  );
  const D2 = Directive({selector: '[d2]', host: host('D2')})(
    class {
      v = sig.D2;
    },
  );
  const C = Component({
    selector: 'ui-box',
    template: '',
    host: host('C'),
    hostDirectives: c.kinds.H ? [H as any] : [],
  })(
    class {
      v = sig.C;
    },
  );
  const tk = c.kinds.T;
  let tAttr = '';
  if (tk === 'static') tAttr = `${c.attr}="${valueFor(c.attr, 'T')}"`;
  else if (tk === 'attr') tAttr = `[attr.${c.attr}]="v()"`;
  else if (tk === 'style') tAttr = `[style]="v()"`;
  else if (tk === 'prop') tAttr = `[${c.attr}]="v()"`;
  const dirs = [c.kinds.D1 ? 'd1' : '', c.kinds.D2 ? 'd2' : ''].join(' ');
  const App = Component({
    template: `<ui-box ${dirs} ${tAttr}></ui-box>`,
    imports: c.importsOrder === 'D2,D1' ? [C, D2, D1] : [C, D1, D2],
  })(
    class {
      v = sig.T;
    },
  );
  return {App, sig};
}

const rows: string[] = [];
function log(c: Case, step: string, el: Element) {
  const kinds = (Object.keys(c.kinds) as Who[])
    .filter((w) => c.kinds[w])
    .map((w) => `${w}:${c.kinds[w]}`)
    .join(' ');
  rows.push(
    JSON.stringify({
      attr: c.attr,
      kinds,
      order: c.importsOrder ?? 'D1,D2',
      step,
      value: el.getAttribute(c.attr),
      ...(c.attr === 'id' ? {prop: (el as HTMLElement).id} : {}),
      ...(c.attr === 'style'
        ? {
            eff: `color=${(el as HTMLElement).style.color} padding-left=${(el as HTMLElement).style.paddingLeft}`,
          }
        : {}),
    }),
  );
}

async function run(c: Case) {
  const {App, sig} = build(c);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(App as any);
  await fixture.whenStable();
  const el = fixture.nativeElement.querySelector('ui-box');
  log(c, 'create', el);
  // Change each bound source in turn, then the lowest one again.
  for (const who of ['T', 'D2', 'D1', 'H', 'C'] as Who[]) {
    const k = c.kinds[who];
    if (!k || k === 'static') continue;
    sig[who].set(valueFor(c.attr, who) + (c.attr === 'style' ? '; z-index: 1' : '2'));
    await fixture.whenStable();
    log(c, `after ${who} changes`, el);
  }
  const anyBound = (Object.values(c.kinds) as (Kind | null)[]).some((k) => k && k !== 'static');
  if (anyBound) {
    for (const who of ['C', 'T'] as Who[]) {
      const k = c.kinds[who];
      if (!k || k === 'static') continue;
      sig[who].set(null);
      await fixture.whenStable();
      log(c, `after ${who} -> null`, el);
    }
  }
  fixture.destroy();
}

const ALL = <K extends Kind>(k: K | null) => ({C: k, H: k, D1: k, D2: k, T: k});

describe('attribute measurement', () => {
  afterAll(() => {
    console.log('ATTR_MEASURE_BEGIN\n' + rows.join('\n') + '\nATTR_MEASURE_END');
  });

  for (const attr of ATTRS) {
    const bound: Kind = attr === 'style' ? 'style' : 'attr';
    const cases: Case[] = [
      {attr, kinds: ALL('static')},
      {attr, kinds: ALL('static'), importsOrder: 'D2,D1'},
      {attr, kinds: {C: 'static', H: null, D1: 'static', D2: null, T: 'static'}},
      {attr, kinds: ALL(bound)},
      {attr, kinds: ALL(bound), importsOrder: 'D2,D1'},
      {attr, kinds: {C: bound, H: null, D1: bound, D2: null, T: 'static'}},
      {attr, kinds: {C: 'static', H: null, D1: 'static', D2: null, T: bound}},
      {attr, kinds: {C: bound, H: null, D1: null, D2: null, T: bound}},
    ];
    cases.push({attr, kinds: {C: 'static', H: 'static', D1: 'static', D2: 'static', T: null}});
    cases.push({attr, kinds: {C: 'static', H: 'static', D1: null, D2: null, T: null}});
    cases.push({attr, kinds: {C: 'static', H: null, D1: 'static', D2: null, T: null}});
    if (attr === 'id') {
      cases.push({attr, kinds: {C: 'prop', H: null, D1: 'prop', D2: null, T: 'prop'}});
      cases.push({attr, kinds: {C: 'attr', H: null, D1: null, D2: null, T: 'prop'}});
    }
    if (attr === 'style') {
      cases.push({attr, kinds: {C: 'attr', H: null, D1: 'attr', D2: null, T: 'attr'}});
    }
    for (const c of cases) {
      it(`${attr} ${JSON.stringify(c.kinds)} ${c.importsOrder ?? ''}`, async () => {
        try {
          await run(c);
        } catch (e) {
          rows.push(JSON.stringify({attr, kinds: c.kinds, error: String(e).slice(0, 200)}));
        }
      });
    }
  }
});

describe('attribute measurement 2', () => {
  const out: string[] = [];
  afterAll(() => console.log('ATTR2_BEGIN\n' + out.join('\n') + '\nATTR2_END'));

  it('directive bindings against template statics', async () => {
    const Dir = Directive({
      selector: '[dir]',
      host: {'[style.color]': '"green"', '[class.foo]': 'false', '[class.bar]': 'true'},
    })(class {});
    const App = Component({
      template: `<div dir class="foo" style="color: blue"></div>`,
      imports: [Dir],
    })(class {});
    TestBed.resetTestingModule();
    const f = TestBed.createComponent(App as any);
    await f.whenStable();
    const el = f.nativeElement.querySelector('div') as HTMLElement;
    out.push(
      JSON.stringify({
        case: 'dir [style.color]=green, [class.foo]=false vs T static',
        class: el.className,
        style: el.getAttribute('style'),
      }),
    );
  });

  it('concatenated declarations', () => {
    const el = document.createElement('div');
    for (const s of [
      'padding: 4px; padding-left: 2px',
      'padding-left: 2px; padding: 4px',
      'color: red !important; color: blue',
      '--x: 1; --x: 2',
      'margin: 1px; margin: 2px',
      'border: 1px solid red; border-color: blue',
    ]) {
      el.setAttribute('style', s);
      out.push(
        JSON.stringify({
          case: s,
          normalized: el.getAttribute('style'),
          paddingLeft: el.style.paddingLeft,
          color: el.style.color,
          x: el.style.getPropertyValue('--x'),
          margin: el.style.margin,
          borderColor: el.style.borderColor,
        }),
      );
    }
  });
});

describe('attribute measurement 3', () => {
  it('css attr() lists', () => {
    const out: string[] = [navigator.userAgent];
    const style = document.createElement('style');
    style.textContent = `
      .a { transition-duration: attr(data-d type(<time>#)); }
      .b { padding: attr(data-p type(<length>+)); }
      .c { width: attr(data-w type(<length>)); }
      .d { transition-duration: attr(data-d type(<time>)); }
      .e { content: attr(data-s); }
    `;
    document.head.appendChild(style);
    const cases: [string, string, string, string][] = [
      ['a', 'data-d', '1s, 2s', 'transition-duration'],
      ['a', 'data-d', '1s 2s', 'transition-duration'],
      ['b', 'data-p', '1px 2px', 'padding'],
      ['b', 'data-p', '1px, 2px', 'padding'],
      ['c', 'data-w', '10px', 'width'],
      ['d', 'data-d', '1s, 2s', 'transition-duration'],
      ['e', 'data-s', 'a, b', 'content'],
    ];
    for (const [cls, attr, value, prop] of cases) {
      const el = document.createElement('div');
      el.className = cls;
      el.setAttribute(attr, value);
      document.body.appendChild(el);
      out.push(
        JSON.stringify({
          css: cls,
          attr,
          value,
          prop,
          computed: getComputedStyle(el).getPropertyValue(prop),
        }),
      );
      el.remove();
    }
    style.remove();
    console.log('ATTR3_BEGIN\n' + out.join('\n') + '\nATTR3_END');
  });
});
