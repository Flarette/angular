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
  BoundClassResolver,
  Component,
  destroyPlatform,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import {TestBed} from '@angular/core/testing';

import {
  clearDocument,
  getAppContents,
  prepareEnvironmentAndHydrate,
  resetTViewsFor,
} from './dom_utils';
import {describeOffSubtreeHydration} from './class_resolver_hydration_cases';
import {
  clearConsole,
  getComponentRef,
  resetNgDevModeCounters,
  ssr,
  verifyAllNodesClaimedForHydration,
} from './hydration_utils';

describe('(class) binding with hydration', () => {
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

  /** Renders `template` on the server, hydrates it, and returns the classes of its `<div>`. */
  async function hydratedClasses(template: string): Promise<string[]> {
    @Component({selector: 'app', template})
    class App {
      private readonly isServer = isPlatformServer(inject(PLATFORM_ID));

      protected readonly resolve = (cn: BoundClassResolver) =>
        cn(this.isServer ? 'server-only' : 'client-only');
    }

    const html = await ssr(App);
    expect(getAppContents(html)).toContain('server-only');

    resetTViewsFor(App);
    const appRef = await prepareEnvironmentAndHydrate(doc, html, App);
    const host = getComponentRef<App>(appRef).location.nativeElement as HTMLElement;
    appRef.tick();

    verifyAllNodesClaimedForHydration(host);
    return Array.from(host.querySelector('div')!.classList).sort();
  }

  it('removes a class that only the server resolved', async () => {
    expect(await hydratedClasses(`<div class="p-2" (class)="resolve"></div>`)).toEqual([
      'client-only',
      'p-2',
    ]);
  });

  it('removes a class that only the server resolved on an element without static classes', async () => {
    expect(await hydratedClasses(`<div (class)="resolve"></div>`)).toEqual(['client-only']);
  });

  describeOffSubtreeHydration(
    () => [],
    () => doc,
  );
});
