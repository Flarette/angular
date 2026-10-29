/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {DOCUMENT, isPlatformServer} from '@angular/common';
import {
  ApplicationRef,
  Component,
  destroyPlatform,
  Directive,
  inject,
  PLATFORM_ID,
  provideClassResolver,
  withAutoResolution,
} from '@angular/core';
import {TestBed} from '@angular/core/testing';

import {
  cn,
  describeOffSubtreeHydration,
  describeRootHostHydration,
} from './class_resolver_hydration_cases';
import {
  clearDocument,
  getAppContents,
  prepareEnvironmentAndHydrate,
  resetTViewsFor,
} from './dom_utils';
import {
  clearConsole,
  getComponentRef,
  resetNgDevModeCounters,
  ssr,
  verifyAllNodesClaimedForHydration,
} from './hydration_utils';

describe('automatic class resolution with hydration', () => {
  const originalWindow = globalThis.window;
  let doc: Document;

  beforeAll(async () => {
    globalThis.window = globalThis as unknown as Window & typeof globalThis;
    await import('../../core/primitives/event-dispatch/contract_bundle_min.js' as string);
  });

  afterAll(() => {
    globalThis.window = originalWindow;
  });

  beforeEach(() => {
    resetNgDevModeCounters();
    doc = TestBed.inject(DOCUMENT);
    clearConsole(TestBed.inject(ApplicationRef));
  });

  afterEach(() => {
    destroyPlatform();
    window._ejsas = {};
    clearDocument(doc);
    clearConsole(TestBed.inject(ApplicationRef));
  });

  it('hydrates an automatically resolved element without a class mismatch', async () => {
    @Directive({selector: '[tone]', host: {class: 'px-2'}})
    class Tone {}

    @Directive({selector: '[marker]', host: {'[class]': 'classes'}})
    class Marker {
      readonly classes = isPlatformServer(inject(PLATFORM_ID)) ? 'server-only' : 'client-only';
    }

    @Component({
      selector: 'app',
      imports: [Tone, Marker],
      template: `<div tone class="px-4"></div>
        <span marker></span>`,
    })
    class App {}

    const envProviders = () => [provideClassResolver(cn, withAutoResolution())];
    const html = await ssr(App, {envProviders: envProviders()});
    expect(getAppContents(html)).toContain('<div tone="" class="px-4">');
    expect(getAppContents(html)).toContain('server-only');

    resetTViewsFor(App);
    const appRef = await prepareEnvironmentAndHydrate(doc, html, App, {
      envProviders: envProviders(),
    });
    const host = getComponentRef<App>(appRef).location.nativeElement as HTMLElement;
    appRef.tick();

    verifyAllNodesClaimedForHydration(host);
    expect(Array.from(host.querySelector('div')!.classList)).toEqual(['px-4']);
    expect(Array.from(host.querySelector('span')!.classList)).toEqual(['client-only']);
  });

  describeOffSubtreeHydration(
    () => [provideClassResolver(cn, withAutoResolution())],
    () => doc,
  );

  describeRootHostHydration(
    () => [provideClassResolver(cn, withAutoResolution())],
    () => doc,
    {'[class]': 'classes'},
  );
});
