/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

// Temporary benchmark: per-element cost of attribute resolvers (WP10 step 1). Not for commit.
// The mode comes from `--test_env=BENCH_MODE=<mode>`, because automatic resolution and its
// enrolled names are process-wide: each mode runs in its own process.

import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  createComponent,
  createEnvironmentInjector,
  Directive,
  EnvironmentInjector,
  provideAttributeResolvers,
  signal,
  Type,
  WritableSignal,
  withAutoResolution,
  ɵgetLContext as getLContext,
} from '@angular/core';
import {TestBed} from '@angular/core/testing';

const ENV = ((globalThis as any).process?.env ?? {}) as Record<string, string | undefined>;
const MODE = ENV['BENCH_MODE'] ?? 'class';
const SMOKE = ENV['BENCH_SMOKE'] === '1';

const N = SMOKE ? 20 : 1000;
const CREATE_WARMUP = SMOKE ? 1 : 10;
const CREATE_REPS = SMOKE ? 3 : 31;
// A 100-declaration style refresh costs about 100 times a class one, so that mode warms up and
// batches less to keep a process under ten minutes. It still takes 31 samples per phase.
const HEAVY = MODE === 'stylesize';
const REFRESH_WARMUP = SMOKE ? 5 : HEAVY ? 50 : 300;
const REFRESH_SAMPLES = SMOKE ? 3 : 31;
const REFRESH_BATCH = SMOKE ? 2 : HEAVY ? 5 : 30;

let resolverCalls = 0;
const counted =
  (fn: (...v: string[]) => string | null) =>
  (...v: string[]): any => {
    resolverCalls++;
    return fn(...v);
  };

interface Bench {
  readonly y: WritableSignal<boolean>;
}

interface Made {
  readonly component: Type<Bench>;
  readonly directive: Type<unknown> | null;
}

interface Scenario {
  readonly name: string;
  readonly make: () => Made;
  readonly made: Made;
  readonly env: EnvironmentInjector;
  /** Reads the measured attribute of element `i`, for validation. */
  readonly read: (el: Element) => string;
}

function scenario(
  name: string,
  make: () => Made,
  env: EnvironmentInjector,
  read: (el: Element) => string,
): Scenario {
  return {name, make, made: make(), env, read};
}

let componentSeq = 0;

function benchComponent(
  selector: string,
  element: string,
  imports: Type<unknown>[],
  providers: any[],
): Type<Bench> {
  @Component({
    // A unique selector per class, so fresh classes don't collide on their component ID (NG0912).
    selector: `${selector}-${componentSeq++}`,
    imports,
    changeDetection: ChangeDetectionStrategy.Eager,
    providers,
    template: Array.from({length: N}, () => element).join(''),
  })
  class BenchComponent implements Bench {
    readonly y = signal(true);
  }
  return BenchComponent;
}

function render(s: Scenario, made: Made = s.made): ComponentRef<Bench> {
  const ref = createComponent(made.component, {environmentInjector: s.env});
  ref.changeDetectorRef.detectChanges();
  return ref;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function child(ref: ComponentRef<Bench>, i: number): Element {
  return (ref.location.nativeElement as Element).children[i];
}

const readClasses = (el: Element) => Array.from(el.classList).sort().join(' ');
const readAttr = (name: string) => (el: Element) => String(el.getAttribute(name));

let warnings = 0;

/** Prints values and resolver calls before timing, and the LView length of the bench view. */
function validate(s: Scenario, baselineLength: number | null): number {
  resolverCalls = 0;
  const ref = render(s);
  const onRender = resolverCalls;
  expect((ref.location.nativeElement as Element).children.length).toBe(N);
  const onFirst = s.read(child(ref, 0));
  const onLast = s.read(child(ref, N - 1));

  resolverCalls = 0;
  ref.changeDetectorRef.detectChanges();
  const onNoChange = resolverCalls;

  resolverCalls = 0;
  ref.instance.y.set(false);
  ref.changeDetectorRef.detectChanges();
  const onChange = resolverCalls;
  const offFirst = s.read(child(ref, 0));
  const offLast = s.read(child(ref, N - 1));

  ref.instance.y.set(true);
  ref.changeDetectorRef.detectChanges();
  // Plain Angular runs host bindings after template bindings, so `back` can differ from `on` there.
  const backFirst = s.read(child(ref, 0));
  expect(onLast).toBe(onFirst);
  expect(offLast).toBe(offFirst);

  const length = getLContext(child(ref, 0))!.lView!.length;
  ref.destroy();

  console.log(
    `[validate] ${s.name}: resolver calls render=${onRender} ` +
      `refresh(no change)=${onNoChange} refresh(change)=${onChange} | ` +
      `on=${JSON.stringify(onFirst)} off=${JSON.stringify(offFirst)} back=${JSON.stringify(backFirst)}`,
  );
  console.log(
    `[memory] ${s.name}: lView.length=${length}` +
      (baselineLength === null
        ? ''
        : ` delta/element=${((length - baselineLength) / N).toFixed(3)}`),
  );
  return length;
}

type Samples = Map<string, {create: number[]; refresh: number[]; toggle: number[]}>;

/** Measures the scenarios interleaved, round by round, so drift affects them alike. */
function measure(scenarios: Scenario[]): Samples {
  const samples: Samples = new Map(
    scenarios.map((s) => [s.name, {create: [], refresh: [], toggle: []}]),
  );

  // (a) Creation on a warm `TView`: `createComponent` plus the first update pass, per element.
  for (let i = 0; i < CREATE_WARMUP; i++) {
    for (const s of scenarios) {
      render(s).destroy();
    }
  }
  for (let r = 0; r < CREATE_REPS; r++) {
    for (const s of scenarios) {
      const t0 = performance.now();
      const ref = createComponent(s.made.component, {environmentInjector: s.env});
      ref.changeDetectorRef.detectChanges();
      const t1 = performance.now();
      ref.destroy();
      samples.get(s.name)!.create.push(((t1 - t0) * 1000) / N);
    }
  }

  // (b) and (c) Refresh, on one live instance per scenario.
  const refs = scenarios.map((s) => render(s));
  for (let i = 0; i < REFRESH_WARMUP; i++) {
    for (const ref of refs) {
      ref.changeDetectorRef.detectChanges();
      ref.instance.y.set(!ref.instance.y());
      ref.changeDetectorRef.detectChanges();
    }
  }
  for (let r = 0; r < REFRESH_SAMPLES; r++) {
    scenarios.forEach((s, k) => {
      const cd = refs[k].changeDetectorRef;
      const t0 = performance.now();
      for (let i = 0; i < REFRESH_BATCH; i++) {
        cd.detectChanges();
      }
      const t1 = performance.now();
      samples.get(s.name)!.refresh.push(((t1 - t0) * 1000) / (REFRESH_BATCH * N));
    });
    scenarios.forEach((s, k) => {
      const cd = refs[k].changeDetectorRef;
      const y = refs[k].instance.y;
      const t0 = performance.now();
      for (let i = 0; i < REFRESH_BATCH; i++) {
        y.set(!y());
        cd.detectChanges();
      }
      const t1 = performance.now();
      samples.get(s.name)!.toggle.push(((t1 - t0) * 1000) / (REFRESH_BATCH * N));
    });
  }
  refs.forEach((ref) => ref.destroy());
  return samples;
}

/** Compiles a fresh component and its directive now, so that timing sees only the creation. */
function compiled(made: Made): Made {
  const types: any[] = [made.component, made.directive].filter((t) => t !== null);
  for (const type of types) {
    void (type.ɵcmp ?? type.ɵdir);
    void type.ɵfac;
  }
  const directiveDefs = (made.component as any).ɵcmp.directiveDefs;
  if (typeof directiveDefs === 'function') {
    directiveDefs();
  }
  return made;
}

/**
 * Measures the first creation of fresh components, whose `TView` runs its first creation pass,
 * interleaved round by round.
 */
function measureFirstCreate(scenarios: Scenario[]): Map<string, number[]> {
  const samples = new Map(scenarios.map((s) => [s.name, [] as number[]]));
  const fresh = new Map(
    scenarios.map((s) => [
      s.name,
      Array.from({length: CREATE_WARMUP + CREATE_REPS}, () => compiled(s.make())),
    ]),
  );
  for (let r = 0; r < CREATE_WARMUP + CREATE_REPS; r++) {
    for (const s of scenarios) {
      const made = fresh.get(s.name)![r];
      const t0 = performance.now();
      const ref = createComponent(made.component, {environmentInjector: s.env});
      ref.changeDetectorRef.detectChanges();
      const t1 = performance.now();
      ref.destroy();
      if (r >= CREATE_WARMUP) {
        samples.get(s.name)!.push(((t1 - t0) * 1000) / N);
      }
    }
  }
  return samples;
}

const fmt = (v: number[]) =>
  `${quantile(v, 0.5).toFixed(3)} [IQR ${quantile(v, 0.25).toFixed(3)}-${quantile(v, 0.75).toFixed(3)}]`;

function report(samples: Samples): void {
  for (const [name, s] of samples) {
    console.log(
      `[result] ${name}: create ${fmt(s.create)} | refresh-nochange ${fmt(s.refresh)} | ` +
        `refresh-change ${fmt(s.toggle)}  (us/element, median [IQR])`,
    );
  }
}

function reportFirstCreate(samples: Map<string, number[]>): void {
  for (const [name, v] of samples) {
    console.log(`[first-create] ${name}: ${fmt(v)}  (us/element, median [IQR])`);
  }
}

// ---------------------------------------------------------------------------------------------
// Main cells: plain, explicit, automatic, and automatic but off, per attribute.

interface AttrCase {
  readonly key: string;
  readonly stub: (...v: string[]) => string | null;
  readonly host: Record<string, string>;
  readonly hostX: unknown;
  readonly element: (resolverBinding: boolean) => string;
  readonly read: (el: Element) => string;
}

const ATTR_CASES: Record<string, AttrCase> = {
  class: {
    key: 'class',
    stub: (...c) => c.join(' '),
    host: {'class': 'h', '[class.x]': 'x'},
    hostX: true,
    element: (rb) =>
      `<div d class="t" [class.y]="y()"${rb ? ' (class)="(cn) => cn()"' : ''}></div>`,
    read: readClasses,
  },
  role: {
    key: 'role',
    stub: (...v) => (v.length === 0 ? null : v[v.length - 1]),
    host: {'role': 'h', '[attr.role]': 'x'},
    hostX: 'hx',
    element: (rb) =>
      `<div d role="t" [attr.role]="y() ? 'y' : 'n'"` +
      `${rb ? ' (attr.role)="$event.resolve($event.resolver())"' : ''}></div>`,
    read: readAttr('role'),
  },
  aria: {
    key: 'aria-describedby',
    stub: (...v) => v.join(' '),
    host: {'aria-describedby': 'h', '[attr.aria-describedby]': 'x'},
    hostX: 'hx',
    element: (rb) =>
      `<div d aria-describedby="t" [attr.aria-describedby]="y() ? 'y' : 'n'"` +
      `${rb ? ' (attr.aria-describedby)="$event.resolve($event.resolver())"' : ''}></div>`,
    read: readAttr('aria-describedby'),
  },
  style: {
    key: 'style',
    stub: (...d) => d.join('; '),
    host: {'style': 'color: red', '[style.width.px]': 'x'},
    hostX: 10,
    element: (rb) =>
      `<div d style="height: 1px" [style.padding.px]="y() ? 4 : 8"` +
      `${rb ? ' (style)="(s) => s()"' : ''}></div>`,
    read: readAttr('style'),
  },
};

type Variant = 'plain' | 'explicit' | 'auto' | 'off';

function makeAttrCase(c: AttrCase, variant: Variant, stub: any): () => Made {
  return () => {
    const hostX = c.hostX;
    @Directive({selector: '[d]', host: c.host})
    class D {
      x = hostX;
    }
    const providers =
      variant === 'off'
        ? [provideAttributeResolvers({[c.key]: stub}, withAutoResolution(false))]
        : [];
    const component = benchComponent(
      `bench-${variant}`,
      c.element(variant === 'explicit'),
      [D],
      providers,
    );
    return {component, directive: D};
  };
}

function runAttributeCells(c: AttrCase): void {
  const stub = counted(c.stub);

  // Plain and explicit, before anything calls `withAutoResolution()`.
  TestBed.configureTestingModule({});
  const rootEnv = TestBed.inject(EnvironmentInjector);
  const explicitEnv = createEnvironmentInjector(
    [provideAttributeResolvers({[c.key]: stub})],
    rootEnv,
  );
  const plain = scenario('1 plain', makeAttrCase(c, 'plain', stub), rootEnv, c.read);
  const explicit = scenario('2 explicit', makeAttrCase(c, 'explicit', stub), explicitEnv, c.read);
  const plainLength = validate(plain, null);
  validate(explicit, plainLength);
  report(measure([plain, explicit]));
  explicitEnv.destroy();

  // Automatic resolution on for the process, with the case's name enrolled.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideAttributeResolvers({[c.key]: stub}, withAutoResolution())],
  });
  const autoEnv = TestBed.inject(EnvironmentInjector);
  const auto = scenario('3 auto', makeAttrCase(c, 'auto', stub), autoEnv, c.read);
  const off = scenario('4 off subtree', makeAttrCase(c, 'off', stub), autoEnv, c.read);
  // The scenario 1 component, whose template was created before automatic resolution.
  const control: Scenario = {...plain, name: "1' plain (control)", env: autoEnv};
  const controlLength = validate(control, null);
  validate(auto, controlLength);
  validate(off, controlLength);
  report(measure([control, auto, off]));
}

// ---------------------------------------------------------------------------------------------
// Micro mode: the `styling.ts` lookup and `ɵɵattribute` on an element with a `role` resolver.

function makeMicro(kind: 'class' | 'attr', k: number, withResolver: boolean): () => Made {
  return () => {
    const bindings = Array.from({length: k}, (_, i) =>
      kind === 'class' ? `[class.c${i}]="y()"` : `[attr.data-a${i}]="y() ? 'a' : 'b'"`,
    ).join(' ');
    const rb = withResolver ? ' (attr.role)="$event.resolve($event.resolver())"' : '';
    const component = benchComponent(
      `bench-micro`,
      `<div role="r" ${bindings}${rb}></div>`,
      [],
      [],
    );
    return {component, directive: null};
  };
}

function runMicro(): void {
  const stub = counted((...v) => (v.length === 0 ? null : v[v.length - 1]));
  TestBed.configureTestingModule({});
  const rootEnv = TestBed.inject(EnvironmentInjector);
  const env = createEnvironmentInjector([provideAttributeResolvers({role: stub})], rootEnv);
  const read = (kind: 'class' | 'attr') => (el: Element) =>
    `${readClasses(el)}|${el.getAttribute('role')}|${kind === 'attr' ? el.getAttribute('data-a0') : ''}`;
  const scenarios: Scenario[] = [];
  for (const kind of ['class', 'attr'] as const) {
    for (const k of [1, 8]) {
      for (const withResolver of [false, true]) {
        scenarios.push(
          scenario(
            `${kind}-k${k} ${withResolver ? 'role-resolver' : 'plain'}`,
            makeMicro(kind, k, withResolver),
            env,
            read(kind),
          ),
        );
      }
    }
  }
  for (const s of scenarios) {
    validate(s, null);
  }
  report(measure(scenarios));
}

// ---------------------------------------------------------------------------------------------
// Style size mode: a style result of 10 and 100 declarations.

function makeStyleSize(count: number, variant: Variant): () => Made {
  return () => {
    @Directive({selector: '[d]'})
    class D {}
    const statics = Array.from({length: count - 1}, (_, i) => `--v${i}: ${i}`).join('; ');
    const rb = variant === 'explicit' ? ' (style)="(s) => s()"' : '';
    const component = benchComponent(
      `bench-style-${count}`,
      `<div d style="${statics}" [style.width.px]="y() ? 1 : 2"${rb}></div>`,
      [D],
      [],
    );
    return {component, directive: D};
  };
}

function runStyleSize(): void {
  const stub = counted((...d) => d.join('; '));
  const read = (el: Element) => {
    const style = el.getAttribute('style') ?? '';
    return `${style.split(';').filter((d) => d.trim() !== '').length} decls, width ${(el as HTMLElement).style.getPropertyValue('width')}`;
  };

  TestBed.configureTestingModule({});
  const rootEnv = TestBed.inject(EnvironmentInjector);
  const explicitEnv = createEnvironmentInjector(
    [provideAttributeResolvers({style: stub})],
    rootEnv,
  );
  const phase1: Scenario[] = [];
  for (const count of [10, 100]) {
    phase1.push(scenario(`s${count} plain`, makeStyleSize(count, 'plain'), rootEnv, read));
    phase1.push(
      scenario(`s${count} explicit`, makeStyleSize(count, 'explicit'), explicitEnv, read),
    );
  }
  for (const s of phase1) {
    validate(s, null);
  }
  report(measure(phase1));
  explicitEnv.destroy();

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideAttributeResolvers({style: stub}, withAutoResolution())],
  });
  const autoEnv = TestBed.inject(EnvironmentInjector);
  const phase2: Scenario[] = [];
  for (const count of [10, 100]) {
    const plain = phase1.find((s) => s.name === `s${count} plain`)!;
    phase2.push({...plain, name: `s${count} plain (control)`, env: autoEnv});
    phase2.push(scenario(`s${count} auto`, makeStyleSize(count, 'auto'), autoEnv, read));
  }
  for (const s of phase2) {
    validate(s, null);
  }
  report(measure(phase2));
}

// ---------------------------------------------------------------------------------------------
// Setup modes: automatic resolution with 1, 4, or 16 enrolled names, on elements that a directive
// matches but that have no sources for any enrolled name.

const EXTRA_NAMES = [
  'role',
  'aria-describedby',
  'title',
  'aria-label',
  'aria-labelledby',
  'aria-controls',
  'aria-owns',
  'tabindex',
  'lang',
  'dir',
  'data-n0',
  'data-n1',
  'data-n2',
  'data-n3',
  'data-n4',
  'data-n5',
];

function makeSetup(variant: Variant, stub: any, names: string[]): () => Made {
  return () => {
    @Directive({selector: '[d]'})
    class D {}
    const providers =
      variant === 'off'
        ? [
            provideAttributeResolvers(
              Object.fromEntries(names.map((n) => [n, stub])),
              withAutoResolution(false),
            ),
          ]
        : [];
    const component = benchComponent(
      `bench-setup-${variant}`,
      `<div d [attr.data-y]="y() ? 'a' : 'b'"></div>`,
      [D],
      providers,
    );
    return {component, directive: D};
  };
}

function runSetup(count: number): void {
  const names = EXTRA_NAMES.slice(0, count);
  const stub = counted((...v) => (v.length === 0 ? null : v[v.length - 1]));
  const read = (el: Element) => `${el.getAttribute('data-y')}|${el.getAttribute('class')}`;

  TestBed.configureTestingModule({});
  const rootEnv = TestBed.inject(EnvironmentInjector);
  const plain = scenario('1 plain', makeSetup('plain', stub, names), rootEnv, read);
  const plainLength = validate(plain, null);
  reportFirstCreate(measureFirstCreate([plain]));
  report(measure([plain]));

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideAttributeResolvers(
        Object.fromEntries(names.map((n) => [n, stub])),
        withAutoResolution(),
      ),
    ],
  });
  const autoEnv = TestBed.inject(EnvironmentInjector);
  const control: Scenario = {...plain, name: "1' plain (control)", env: autoEnv};
  const auto = scenario('3 auto', makeSetup('auto', stub, names), autoEnv, read);
  const off = scenario('4 off subtree', makeSetup('off', stub, names), autoEnv, read);
  validate(control, plainLength);
  validate(auto, plainLength);
  validate(off, plainLength);
  reportFirstCreate(measureFirstCreate([auto, off]));
  report(measure([control, auto, off]));
}

describe('attribute resolver benchmark', () => {
  let originalWarn: typeof console.warn;
  beforeEach(() => {
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings++;
      if (warnings <= 3) {
        originalWarn(...args);
      }
    };
  });
  afterEach(() => {
    console.warn = originalWarn;
  });

  it(
    'measures per-element cost',
    () => {
      const g = globalThis as any;
      console.log(
        `[context] mode=${MODE} smoke=${SMOKE} node=${g.process?.version} arch=${g.process?.arch} ` +
          `ngDevMode=${typeof g.ngDevMode !== 'undefined' && !!g.ngDevMode} N=${N} ` +
          `createReps=${CREATE_REPS} refreshSamples=${REFRESH_SAMPLES}x${REFRESH_BATCH}`,
      );
      if (MODE in ATTR_CASES) {
        runAttributeCells(ATTR_CASES[MODE]);
      } else if (MODE === 'micro') {
        runMicro();
      } else if (MODE === 'stylesize') {
        runStyleSize();
      } else if (MODE.startsWith('setup')) {
        runSetup(Number(MODE.slice('setup'.length)));
      } else {
        fail(`unknown BENCH_MODE ${MODE}`);
      }
      console.log(`[warnings] console.warn calls: ${warnings}`);
    },
    60 * 60_000,
  );
});
