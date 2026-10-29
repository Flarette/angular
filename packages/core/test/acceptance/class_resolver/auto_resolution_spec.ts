/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  ClassResolver,
  Component,
  Directive,
  inject,
  provideClassResolver,
  signal,
  ViewChild,
  ViewContainerRef,
  withAutoResolution,
} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {provideRouter, Router, RouterOutlet} from '@angular/router';

import {classesOf, cn, describeOffSubtree} from './off_subtree_cases';

// Automatic resolution turns its runtime on for the whole process and a component caches its
// `TView`, so every spec here declares its own components and provides `withAutoResolution()`
// before it renders.
describe('automatic resolution', () => {
  /** A resolver that records the classes it receives and merges them with `cn`. */
  function recordingResolver() {
    return jasmine.createSpy<ClassResolver>('resolver').and.callFake(cn);
  }

  /** The calls of `resolver` that received `className`. */
  function callsWith(resolver: jasmine.Spy<ClassResolver>, className: string): string[][] {
    return resolver.calls
      .allArgs()
      .filter((classes) => classes.join(' ').split(' ').includes(className));
  }

  it('resolves a component host and an element with a directive, but not a plain element', async () => {
    @Component({selector: 'ui-button', template: '', host: {class: 'bg-primary px-2'}})
    class UiButton {}

    @Directive({selector: '[tone]', host: {class: 'px-2'}})
    class Tone {}

    @Component({
      imports: [UiButton, Tone],
      template: `<ui-button class="px-4" />
        <div tone class="px-4"></div>
        <span class="px-2 px-4"></span>`,
    })
    class App {}

    TestBed.configureTestingModule({providers: [provideClassResolver(cn, withAutoResolution())]});
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(classesOf(fixture.nativeElement.querySelector('ui-button'))).toEqual([
      'bg-primary',
      'px-4',
    ]);
    expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['px-4']);
    expect(classesOf(fixture.nativeElement.querySelector('span'))).toEqual(['px-2', 'px-4']);
  });

  it('turns off in a component that provides the resolver without it, and back on below it', async () => {
    @Directive({selector: '[tone]', host: {class: 'px-2'}})
    class Tone {}

    @Component({
      selector: 'modern-card',
      imports: [Tone],
      template: `<div id="modern" tone class="px-4"></div>`,
      viewProviders: [provideClassResolver(cn, withAutoResolution())],
    })
    class ModernCard {}

    @Component({
      selector: 'legacy-table',
      imports: [Tone, ModernCard],
      template: `
        <div id="legacy" tone class="px-4"></div>
        @if (true) {
          <div id="legacy-nested" tone class="px-4"></div>
        }
        <modern-card tone class="px-4" />
      `,
      providers: [provideClassResolver(cn)],
    })
    class LegacyTable {}

    @Component({
      imports: [Tone, LegacyTable],
      template: `
        <legacy-table id="table" tone class="px-4" />
        @if (true) {
          <div id="app-nested" tone class="px-4"></div>
        }
      `,
    })
    class App {}

    TestBed.configureTestingModule({providers: [provideClassResolver(cn, withAutoResolution())]});
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = (selector: string) => fixture.nativeElement.querySelector(selector) as Element;

    expect(classesOf(element('#table'))).toEqual(['px-4']);
    expect(classesOf(element('#app-nested'))).toEqual(['px-4']);
    expect(classesOf(element('#legacy'))).toEqual(['px-2', 'px-4']);
    expect(classesOf(element('#legacy-nested'))).toEqual(['px-2', 'px-4']);
    expect(classesOf(element('modern-card'))).toEqual(['px-2', 'px-4']);
    expect(classesOf(element('#modern'))).toEqual(['px-4']);
  });

  it('resolves a routed component and its host directives', async () => {
    @Directive({selector: '[elevated]', host: {class: 'shadow-sm'}})
    class Elevated {}

    @Component({
      selector: 'app-page',
      template: '',
      host: {class: 'px-2 shadow-lg'},
      hostDirectives: [Elevated],
    })
    class Page {}

    @Component({imports: [RouterOutlet], template: '<router-outlet />'})
    class App {}

    TestBed.configureTestingModule({
      providers: [
        provideClassResolver(cn, withAutoResolution()),
        provideRouter([{path: '', component: Page}]),
      ],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();

    expect(classesOf(fixture.nativeElement.querySelector('app-page'))).toEqual([
      'px-2',
      'shadow-lg',
    ]);
  });

  it('resolves a component created in code with the setting where it is inserted', async () => {
    @Component({selector: 'app-badge', template: '', host: {class: 'px-2 px-4'}})
    class Badge {}

    @Component({
      selector: 'legacy-host',
      template: '<ng-container #slot />',
      providers: [provideClassResolver(cn)],
    })
    class LegacyHost {
      @ViewChild('slot', {read: ViewContainerRef, static: true}) slot!: ViewContainerRef;
    }

    @Component({imports: [LegacyHost], template: '<legacy-host />'})
    class App {
      readonly viewContainer = inject(ViewContainerRef);
      @ViewChild(LegacyHost, {static: true}) legacyHost!: LegacyHost;
    }

    TestBed.configureTestingModule({providers: [provideClassResolver(cn, withAutoResolution())]});
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const resolved = fixture.componentInstance.viewContainer.createComponent(Badge);
    const notResolved = fixture.componentInstance.legacyHost.slot.createComponent(Badge);
    await fixture.whenStable();

    expect(classesOf(resolved.location.nativeElement)).toEqual(['px-4']);
    expect(classesOf(notResolved.location.nativeElement)).toEqual(['px-2', 'px-4']);
  });

  it('reports NG0322 when a lazy route turns it on and the root providers do not', async () => {
    @Component({selector: 'app-page', template: ''})
    class Page {}

    @Component({imports: [RouterOutlet], template: '<router-outlet />'})
    class App {}

    TestBed.configureTestingModule({
      providers: [
        provideClassResolver(cn),
        provideRouter([
          {
            path: 'lazy',
            providers: [provideClassResolver(cn, withAutoResolution())],
            loadChildren: () => [{path: '', component: Page}],
          },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    await expectAsync(TestBed.inject(Router).navigateByUrl('/lazy')).toBeRejectedWithError(
      /^NG0322: /,
    );
  });

  it('resolves an element with a (class) binding only through that binding', async () => {
    const resolver = recordingResolver();

    @Directive({selector: '[tone]', host: {class: 'px-2'}})
    class Tone {}

    @Component({
      imports: [Tone],
      template: `<div tone class="px-4" (class)="(cn) => cn('shadow-lg')"></div>`,
    })
    class App {}

    TestBed.configureTestingModule({
      providers: [provideClassResolver(resolver, withAutoResolution())],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const calls = callsWith(resolver, 'px-4');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls).toEqual(calls.map(() => ['', 'px-2', 'px-4 shadow-lg']));
    expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['px-4', 'shadow-lg']);
  });

  it('calls the resolver again only when the classes of a source change', async () => {
    const resolver = recordingResolver();

    @Directive({selector: '[tone]', host: {class: 'px-2'}})
    class Tone {}

    @Component({
      imports: [Tone],
      template: `<div tone class="px-4" [class.active]="active()"></div>
        {{ count() }}`,
    })
    class App {
      readonly active = signal(false);
      readonly count = signal(0);
    }

    TestBed.configureTestingModule({
      providers: [provideClassResolver(resolver, withAutoResolution())],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(callsWith(resolver, 'px-4')).toEqual([['', 'px-2', 'px-4']]);

    fixture.componentInstance.count.set(1);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('1');
    expect(callsWith(resolver, 'px-4')).toEqual([['', 'px-2', 'px-4']]);

    fixture.componentInstance.active.set(true);
    await fixture.whenStable();

    expect(callsWith(resolver, 'px-4')).toEqual([
      ['', 'px-2', 'px-4'],
      ['', 'px-2', 'px-4 active'],
    ]);
    expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['active', 'px-4']);
  });

  describeOffSubtree(() => [provideClassResolver(cn, withAutoResolution())]);
});
