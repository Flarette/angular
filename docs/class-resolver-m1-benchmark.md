# M1: per-element cost of class resolution

Measured on 2026-10-29 for the proposal's notes for maintainers ("Angular's cost per element"). The
benchmark is temporary and isn't part of the change. To rerun it, save the spec below as
`packages/core/test/acceptance/class_resolver/m1_benchmark_spec.ts`, apply the BUILD diff, and run:

```bash
pnpm bazel test //packages/core/test/acceptance/class_resolver:m1_benchmark --test_output=all --runs_per_test=2 --local_test_jobs=1 --nocache_test_results
```

Setup: Apple M4, Node v24.21.0, Bazel `fastbuild`, JIT, dev mode, Domino through platform-server,
N = 1000 elements, medians of 31 samples, two separate processes.

## BUILD diff

```diff
@@ -19,6 +19,7 @@
         ["**/*.ts"],
         exclude = [
             "auto_resolution_spec.ts",
+            "m1_benchmark_spec.ts",
             "off_subtree_cases.ts",
         ],
     ),
@@ -57,3 +58,22 @@
         ":auto_resolution_lib",
     ],
 )
+
+# Temporary benchmark target.
+ts_project(
+    name = "m1_benchmark_lib",
+    testonly = True,
+    srcs = ["m1_benchmark_spec.ts"],
+    deps = [
+        "//packages/core",
+        "//packages/core/testing",
+    ],
+)
+
+zoneless_jasmine_test(
+    name = "m1_benchmark",
+    timeout = "long",
+    data = [
+        ":m1_benchmark_lib",
+    ],
+)
```

## Spec

```ts
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

// Temporary benchmark: per-element cost of the class resolver. Not for commit.

import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  createComponent,
  createEnvironmentInjector,
  Directive,
  EnvironmentInjector,
  provideClassResolver,
  signal,
  Type,
  WritableSignal,
  withAutoResolution,
} from '@angular/core';
import {TestBed} from '@angular/core/testing';

const N = 1000;
const CREATE_WARMUP = 10;
const CREATE_REPS = 31;
const REFRESH_WARMUP = 300;
const REFRESH_SAMPLES = 31;
const REFRESH_BATCH = 30;

let resolverCalls = 0;
/** The stub resolver, with a call counter that validates which path runs. */
const stub = (...c: string[]) => {
  resolverCalls++;
  return c.join(' ');
};

type Variant = 'plain' | 'explicit' | 'auto' | 'off';

interface Bench {
  readonly y: WritableSignal<boolean>;
}

/** A fresh directive and component, so no `TView` is shared between scenarios. */
function makeComponent(variant: Variant): Type<Bench> {
  @Directive({selector: '[d]', host: {'class': 'h', '[class.x]': 'x'}})
  class D {
    x = true;
  }

  const resolverBinding = variant === 'explicit' ? ' (class)="(cn) => cn()"' : '';
  const element = `<div d class="t" [class.y]="y()"${resolverBinding}></div>`;

  @Component({
    selector: `bench-${variant}`,
    imports: [D],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: variant === 'off' ? [provideClassResolver(stub)] : [],
    template: Array.from({length: N}, () => element).join(''),
  })
  class BenchComponent implements Bench {
    readonly y = signal(true);
  }
  return BenchComponent;
}

interface Scenario {
  readonly name: string;
  readonly component: Type<Bench>;
  readonly env: EnvironmentInjector;
}

function render(scenario: Scenario): ComponentRef<Bench> {
  const ref = createComponent(scenario.component, {environmentInjector: scenario.env});
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

function classesOf(ref: ComponentRef<Bench>, i: number): string {
  const el = (ref.location.nativeElement as Element).children[i];
  return Array.from(el.classList).sort().join(' ');
}

/** Checks classes and resolver calls before timing, and prints the calls. */
function validate(scenario: Scenario): void {
  resolverCalls = 0;
  const ref = render(scenario);
  const onRender = resolverCalls;
  expect((ref.location.nativeElement as Element).children.length).toBe(N);
  expect(classesOf(ref, 0)).toBe('h t x y');
  expect(classesOf(ref, N - 1)).toBe('h t x y');

  resolverCalls = 0;
  ref.changeDetectorRef.detectChanges();
  const onNoChange = resolverCalls;

  resolverCalls = 0;
  ref.instance.y.set(false);
  ref.changeDetectorRef.detectChanges();
  const onChange = resolverCalls;
  expect(classesOf(ref, 0)).toBe('h t x');
  expect(classesOf(ref, N - 1)).toBe('h t x');

  ref.instance.y.set(true);
  ref.changeDetectorRef.detectChanges();
  expect(classesOf(ref, 0)).toBe('h t x y');
  ref.destroy();

  console.log(
    `[validate] ${scenario.name}: resolver calls render=${onRender} ` +
      `refresh(no change)=${onNoChange} refresh(change)=${onChange}`,
  );
}

type Samples = Map<string, {create: number[]; refresh: number[]; toggle: number[]}>;

/** Measures the scenarios interleaved, round by round, so drift affects them alike. */
function measure(scenarios: Scenario[]): Samples {
  const samples: Samples = new Map(
    scenarios.map((s) => [s.name, {create: [], refresh: [], toggle: []}]),
  );

  // (a) Creation: `createComponent` plus the first update pass, per element.
  for (let i = 0; i < CREATE_WARMUP; i++) {
    for (const s of scenarios) {
      render(s).destroy();
    }
  }
  for (let r = 0; r < CREATE_REPS; r++) {
    for (const s of scenarios) {
      const t0 = performance.now();
      const ref = createComponent(s.component, {environmentInjector: s.env});
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

function report(samples: Samples): void {
  const fmt = (v: number[]) =>
    `${quantile(v, 0.5).toFixed(3)} [IQR ${quantile(v, 0.25).toFixed(3)}-${quantile(v, 0.75).toFixed(3)}]`;
  for (const [name, s] of samples) {
    console.log(
      `[result] ${name}: create ${fmt(s.create)} | refresh-nochange ${fmt(s.refresh)} | ` +
        `refresh-change ${fmt(s.toggle)}  (us/element, median [IQR])`,
    );
  }
}

describe('class resolver benchmark', () => {
  it(
    'measures per-element cost',
    () => {
      const g = globalThis as any;
      console.log(
        `[context] node=${g.process?.version} arch=${g.process?.arch} ` +
          `ngDevMode=${typeof g.ngDevMode !== 'undefined' && !!g.ngDevMode} N=${N} ` +
          `createReps=${CREATE_REPS} refreshSamples=${REFRESH_SAMPLES}x${REFRESH_BATCH}`,
      );

      // Scenarios 1 and 2, before anything calls `withAutoResolution()`.
      TestBed.configureTestingModule({});
      const rootEnv = TestBed.inject(EnvironmentInjector);
      const explicitEnv = createEnvironmentInjector([provideClassResolver(stub)], rootEnv);
      const plain: Scenario = {name: '1 plain', component: makeComponent('plain'), env: rootEnv};
      const explicit: Scenario = {
        name: '2 explicit (class)',
        component: makeComponent('explicit'),
        env: explicitEnv,
      };
      validate(plain);
      validate(explicit);
      report(measure([plain, explicit]));
      explicitEnv.destroy();

      // Scenarios 3 and 4, with automatic resolution on for the process.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideClassResolver(stub, withAutoResolution())],
      });
      const autoEnv = TestBed.inject(EnvironmentInjector);
      const auto: Scenario = {name: '3 auto', component: makeComponent('auto'), env: autoEnv};
      const off: Scenario = {name: '4 off subtree', component: makeComponent('off'), env: autoEnv};
      // Control: the scenario 1 component, whose template was created before automatic
      // resolution, rendered in the same run as 3 and 4 to show drift.
      const control: Scenario = {
        name: "1' plain (control)",
        component: plain.component,
        env: autoEnv,
      };
      validate(auto);
      validate(off);
      validate(control);
      report(measure([control, auto, off]));
    },
    30 * 60_000,
  );
});
```
