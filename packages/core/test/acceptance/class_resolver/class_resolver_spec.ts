/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  ChangeDetectionStrategy,
  ClassBindingValue,
  ClassCallback,
  ClassResolveEvent,
  ClassSources,
  Component,
  Directive,
  ElementRef,
  EnvironmentProviders,
  ErrorHandler,
  EventEmitter,
  HostBinding,
  HostListener,
  inject,
  Input,
  Output,
  provideCheckNoChangesConfig,
  Provider,
  Renderer2,
  ResolvedClasses,
  signal,
  Type,
  ViewChild,
} from '@angular/core';
import {TestBed} from '@angular/core/testing';

/**
 * Stand-in for `cn` (`clsx` and `tailwind-merge`). It flattens nested arrays and lets a later class
 * replace an earlier one with the same prefix, so `px-4` after `px-2` wins.
 */
function cn(...inputs: unknown[]): string {
  const byPrefix = new Map<string, string>();
  const add = (input: unknown): void => {
    if (Array.isArray(input)) {
      input.forEach(add);
    } else if (typeof input === 'string') {
      for (const className of input.split(/\s+/).filter(Boolean)) {
        const prefix = className.split('-')[0];
        byPrefix.delete(prefix);
        byPrefix.set(prefix, className);
      }
    }
  };
  inputs.forEach(add);
  return [...byPrefix.values()].join(' ');
}

async function render<T>(component: Type<T>) {
  const fixture = TestBed.createComponent(component);
  await fixture.whenStable();
  return fixture;
}

function classesOf(element: Element): string[] {
  return Array.from(element.classList).sort();
}

describe('(class) binding', () => {
  it('passes the classes of each source in priority order', async () => {
    @Directive({host: {class: 'ring'}})
    class Ring {}

    @Component({
      selector: 'ui-button',
      template: '',
      hostDirectives: [Ring],
      host: {class: 'cmp-static', '[class]': 'variant()'},
    })
    class UiButton {
      readonly variant = signal('cmp-map');
    }

    @Directive({selector: '[highlight]', host: {class: 'dir-static', '[class.dir-prop]': 'true'}})
    class Highlight {}

    @Component({
      imports: [UiButton, Highlight],
      template: `
        <ui-button
          highlight
          class="tpl-static"
          [class]="'tpl-map'"
          [class.tpl-prop]="true"
          (class)="capture($event)"
        />
      `,
    })
    class App {
      sources: ClassSources | null = null;

      capture(sources: ClassSources) {
        this.sources = sources;
        return cn(sources);
      }
    }

    const fixture = await render(App);

    expect(fixture.componentInstance.sources).toEqual([
      ['ring', 'cmp-static', 'cmp-map'],
      ['dir-static', 'dir-prop'],
      ['tpl-static', 'tpl-map', 'tpl-prop'],
    ]);
  });

  it('applies only the returned classes', async () => {
    @Component({
      selector: 'ui-button',
      template: '',
      host: {class: 'px-2 py-1', '[class.rounded-sm]': 'true'},
    })
    class UiButton {}

    @Component({
      imports: [UiButton],
      template: `<ui-button class="px-4 rounded-lg" (class)="cn($event)" />`,
    })
    class App {
      protected readonly cn = cn;
    }

    const fixture = await render(App);

    const button = fixture.nativeElement.querySelector('ui-button');
    expect(classesOf(button)).toEqual(['px-4', 'py-1', 'rounded-lg']);
  });

  it('reports a class under the highest-priority binding that turns it on', async () => {
    @Component({selector: 'ui-button', template: '', host: {class: 'px-2'}})
    class UiButton {}

    @Component({
      imports: [UiButton],
      template: `<ui-button class="px-4" [class.px-2]="true" (class)="capture($event)" />`,
    })
    class App {
      sources: ClassSources | null = null;

      capture(sources: ClassSources) {
        this.sources = sources;
        return cn(sources);
      }
    }

    const fixture = await render(App);

    expect(fixture.componentInstance.sources).toEqual([[], [], ['px-4', 'px-2']]);
    expect(classesOf(fixture.nativeElement.querySelector('ui-button'))).toEqual(['px-2']);
  });

  it('resolves again when a template or host binding changes', async () => {
    const tall = signal(false);
    const wide = signal(false);

    @Component({
      selector: 'ui-button',
      template: '',
      host: {class: 'px-2', '[class.py-2]': 'tall()'},
    })
    class UiButton {
      protected readonly tall = tall;
    }

    @Component({
      imports: [UiButton],
      template: `<ui-button [class.px-8]="wide()" (class)="cn($event)" />`,
    })
    class App {
      protected readonly cn = cn;
      protected readonly wide = wide;
    }

    const fixture = await render(App);
    const button = fixture.nativeElement.querySelector('ui-button');
    expect(classesOf(button)).toEqual(['px-2']);

    tall.set(true);
    wide.set(true);
    await fixture.whenStable();
    expect(classesOf(button)).toEqual(['px-8', 'py-2']);

    wide.set(false);
    await fixture.whenStable();
    expect(classesOf(button)).toEqual(['px-2', 'py-2']);
  });

  it('leaves out a class that a higher-priority binding turns off', async () => {
    @Component({selector: 'ui-card', template: '', host: {class: 'rounded shadow'}})
    class UiCard {}

    @Component({
      imports: [UiCard],
      template: `<ui-card [class.rounded]="false" (class)="capture($event)" />`,
    })
    class App {
      sources: ClassSources | null = null;

      capture(sources: ClassSources) {
        this.sources = sources;
        return cn(sources);
      }
    }

    const fixture = await render(App);

    expect(fixture.componentInstance.sources).toEqual([['shadow'], [], []]);
    expect(classesOf(fixture.nativeElement.querySelector('ui-card'))).toEqual(['shadow']);
  });

  it('leaves out a [class] binding that an input named "class" consumes', async () => {
    @Component({selector: 'ui-button', template: '', host: {class: 'px-2'}})
    class UiButton {
      // A decorator, because these JIT tests don't run the transform for signal-based inputs.
      @Input('class') userClass = '';
    }

    @Component({
      imports: [UiButton],
      template: `<ui-button class="py-1" [class]="'px-4'" (class)="capture($event)" />`,
    })
    class App {
      sources: ClassSources | null = null;

      capture(sources: ClassSources) {
        this.sources = sources;
        return cn(sources);
      }
    }

    const fixture = await render(App);

    expect(fixture.componentInstance.sources).toEqual([['px-2'], [], ['py-1']]);
  });

  for (const [form, handler] of [
    ['an expression that uses $event', `cn($event, 'm-1')`],
    ['an arrow function', `(sources) => cn(sources, 'm-1')`],
    ['a function reference', `withMargin`],
  ]) {
    it(`accepts ${form}`, async () => {
      // A variable, so that formatters don't rewrite the interpolated template.
      const template = `<div class="p-2 m-4" (class)="${handler}"></div>`;

      @Component({template})
      class App {
        protected readonly cn = cn;
        protected readonly withMargin = (sources: ClassSources) => cn(sources, 'm-1');
      }

      const fixture = await render(App);

      expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['m-1', 'p-2']);
    });
  }

  it('resolves again when state read by the handler changes', async () => {
    @Component({template: `<div class="p-2" (class)="cn($event, size())"></div>`})
    class App {
      protected readonly cn = cn;
      readonly size = signal('text-sm');
    }

    const fixture = await render(App);
    const div = fixture.nativeElement.querySelector('div');
    expect(classesOf(div)).toEqual(['p-2', 'text-sm']);

    fixture.componentInstance.size.set('text-lg');
    await fixture.whenStable();
    expect(classesOf(div)).toEqual(['p-2', 'text-lg']);
  });

  it('keeps classes that were added outside of class bindings', async () => {
    @Directive({selector: '[focusRing]'})
    class FocusRing {
      constructor() {
        inject(Renderer2).addClass(inject(ElementRef).nativeElement, 'focus-ring');
      }
    }

    @Component({
      imports: [FocusRing],
      template: `<div focusRing class="p-2" [class.p-4]="large()" (class)="cn($event)"></div>`,
    })
    class App {
      protected readonly cn = cn;
      readonly large = signal(false);
    }

    const fixture = await render(App);
    const div = fixture.nativeElement.querySelector('div');
    expect(classesOf(div)).toEqual(['focus-ring', 'p-2']);

    fixture.componentInstance.large.set(true);
    await fixture.whenStable();
    expect(classesOf(div)).toEqual(['focus-ring', 'p-4']);
  });

  it('resolves elements in embedded views with their own context', async () => {
    @Component({
      template: `
        @for (size of sizes(); track $index) {
          <span class="p-1 text-xs" (class)="cn($event, size)"></span>
        }
      `,
    })
    class App {
      protected readonly cn = cn;
      readonly sizes = signal(['text-sm', 'text-lg']);
    }

    const fixture = await render(App);
    const spans = () => Array.from<Element>(fixture.nativeElement.querySelectorAll('span'));
    expect(spans().map(classesOf)).toEqual([
      ['p-1', 'text-sm'],
      ['p-1', 'text-lg'],
    ]);

    fixture.componentInstance.sizes.set(['text-base', 'text-lg']);
    await fixture.whenStable();
    expect(spans().map(classesOf)).toEqual([
      ['p-1', 'text-base'],
      ['p-1', 'text-lg'],
    ]);
  });

  describe('in host bindings', () => {
    @Component({
      selector: 'ui-button',
      template: '',
      host: {class: 'px-2 py-1', '(class)': 'merge($event)'},
    })
    class UiButton {
      protected readonly merge = cn;
    }

    it('lets a component resolve the classes of its host element', async () => {
      @Component({imports: [UiButton], template: `<ui-button class="px-4" />`})
      class App {}

      const fixture = await render(App);

      expect(classesOf(fixture.nativeElement.querySelector('ui-button'))).toEqual(['px-4', 'py-1']);
    });

    it("passes the component's resolved classes to the template (class) binding", async () => {
      @Component({
        imports: [UiButton],
        template: `<ui-button class="px-4" (class)="keepAll($event)" />`,
      })
      class App {
        sources: ClassSources | null = null;

        protected keepAll(sources: ClassSources) {
          this.sources = sources;
          return sources.flat();
        }
      }

      const fixture = await render(App);

      expect(fixture.componentInstance.sources).toEqual([['py-1'], [], ['px-4']]);
      expect(classesOf(fixture.nativeElement.querySelector('ui-button'))).toEqual(['px-4', 'py-1']);
    });

    for (const tag of ['ng-container', 'ng-template']) {
      it(`runs no resolver on <${tag}>`, async () => {
        const received: unknown[] = [];

        @Directive({selector: '[recorder]', host: {'(class)': 'record($event)'}})
        class Recorder {
          protected record(value: unknown) {
            received.push(value);
            return ['by-recorder'];
          }
        }

        @Component({imports: [Recorder], template: `<${tag} recorder />`})
        class App {}

        await expectAsync(render(App)).toBeResolved();

        expect(received).toEqual([]);
      });
    }
  });

  describe('next to a directive output named "class"', () => {
    // Decorators, because these JIT tests don't run the transform for signal-based outputs and queries.
    @Directive({selector: '[emitter]'})
    class Emitter {
      @Output('class') readonly classEvent = new EventEmitter<string>();
    }

    it('keeps subscribing to the output on an element', async () => {
      const warn = spyOn(console, 'warn');

      @Component({
        imports: [Emitter],
        template: `<div emitter class="p-2" [class.p-4]="true" (class)="received = $event"></div>`,
      })
      class App {
        received = '';
        @ViewChild(Emitter) emitter!: Emitter;
      }

      const fixture = await render(App);
      fixture.componentInstance.emitter.classEvent.emit('sent');
      await fixture.whenStable();

      expect(fixture.componentInstance.received).toBe('sent');
      expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['p-2', 'p-4']);
      expect(warn).toHaveBeenCalledWith(jasmine.stringContaining('NG0319'));
    });

    it('keeps subscribing to the output of a host directive', async () => {
      const warn = spyOn(console, 'warn');

      @Component({
        selector: 'ui-card',
        template: '',
        hostDirectives: [{directive: Emitter, outputs: ['class']}],
      })
      class UiCard {}

      @Component({
        imports: [UiCard],
        template: `<ui-card class="p-2" (class)="received = $event" />`,
      })
      class App {
        received = '';
        @ViewChild(Emitter) emitter!: Emitter;
      }

      const fixture = await render(App);
      fixture.componentInstance.emitter.classEvent.emit('sent');
      await fixture.whenStable();

      expect(fixture.componentInstance.received).toBe('sent');
      expect(classesOf(fixture.nativeElement.querySelector('ui-card'))).toEqual(['p-2']);
      expect(warn).toHaveBeenCalledWith(jasmine.stringContaining('NG0319'));
    });

    it('keeps subscribing to the output on <ng-container>', async () => {
      const warn = spyOn(console, 'warn');

      @Component({
        imports: [Emitter],
        template: `<ng-container emitter (class)="received = $event" />`,
      })
      class App {
        received = '';
        @ViewChild(Emitter) emitter!: Emitter;
      }

      const fixture = await render(App);
      fixture.componentInstance.emitter.classEvent.emit('sent');
      await fixture.whenStable();

      expect(fixture.componentInstance.received).toBe('sent');
      expect(warn).not.toHaveBeenCalled();
    });

    for (const tag of ['ng-container', 'ng-template']) {
      it(`subscribes only the template binding to the output on <${tag}>`, async () => {
        const warn = spyOn(console, 'warn');
        const recorded: unknown[] = [];

        @Directive({selector: '[recorder]', host: {'(class)': 'record($event)'}})
        class Recorder {
          protected record(value: unknown) {
            recorded.push(value);
          }
        }

        @Component({
          imports: [Emitter, Recorder],
          template: `<${tag} emitter recorder (class)="received.push($event)" />`,
        })
        class App {
          readonly received: unknown[] = [];
          @ViewChild(Emitter) emitter!: Emitter;
        }

        const fixture = await render(App);
        fixture.componentInstance.emitter.classEvent.emit('sent');
        await fixture.whenStable();

        expect(recorded).toEqual([]);
        expect(fixture.componentInstance.received).toEqual(['sent']);
        expect(warn).not.toHaveBeenCalledWith(jasmine.stringContaining('NG0319'));
      });
    }
  });

  describe('with several resolvers on one element', () => {
    // Each resolver records that it ran and adds a class named after itself.
    let runs: string[] = [];
    beforeEach(() => (runs = []));

    function resolver(name: string) {
      return (sources: ClassSources) => {
        runs.push(name);
        return [...sources.flat(), `by-${name}`];
      };
    }

    function ranResolvers(): string[] {
      return [...new Set(runs)];
    }

    function captureErrors(providers: Array<Provider | EnvironmentProviders> = []): unknown[] {
      const errors: unknown[] = [];
      TestBed.configureTestingModule({
        rethrowApplicationErrors: false,
        providers: [
          {provide: ErrorHandler, useValue: {handleError: (e: unknown) => errors.push(e)}},
          ...providers,
        ],
      });
      return errors;
    }

    @Directive({host: {'(class)': 'resolve($event)'}})
    class Supplied {
      protected readonly resolve = resolver('supplied');
    }

    @Component({
      selector: 'ui-button',
      template: '',
      hostDirectives: [Supplied],
      host: {class: 'cmp', '(class)': 'resolve($event)'},
    })
    class UiButton {
      protected readonly resolve = resolver('cmp-host');
      private readonly listen = resolver('cmp-listener');

      @HostListener('class', ['$event'])
      onClass(sources: ClassSources) {
        return this.listen(sources);
      }
    }

    @Directive({selector: '[tooltip]', host: {'(class)': 'resolve($event)'}})
    class Tooltip {
      protected readonly resolve = resolver('tooltip');
    }

    @Directive({selector: '[ring]'})
    class Ring {
      @HostBinding('class') readonly ringClass = 'ring';
      private readonly resolve = resolver('ring');

      @HostListener('class', ['$event'])
      onClass(sources: ClassSources) {
        return this.resolve(sources);
      }
    }

    it('runs every resolver from the lowest to the highest priority', async () => {
      @Component({
        imports: [UiButton, Tooltip, Ring],
        template: `<ui-button tooltip ring class="tpl" (class)="capture($event)" />`,
      })
      class App {
        sources: ClassSources | null = null;
        private readonly resolve = resolver('template');

        protected capture(sources: ClassSources) {
          this.sources = sources;
          return this.resolve(sources);
        }
      }

      const fixture = await render(App);

      expect(ranResolvers()).toEqual(['supplied', 'cmp-listener', 'tooltip', 'ring', 'template']);
      expect(fixture.componentInstance.sources).toEqual([
        ['cmp', 'by-supplied', 'by-cmp-listener'],
        ['ring', 'by-tooltip', 'by-ring'],
        ['tpl'],
      ]);
      expect(classesOf(fixture.nativeElement.querySelector('ui-button'))).toEqual([
        'by-cmp-listener',
        'by-ring',
        'by-supplied',
        'by-template',
        'by-tooltip',
        'cmp',
        'ring',
        'tpl',
      ]);
    });

    it('runs directive resolvers in match order', async () => {
      @Component({imports: [UiButton, Tooltip, Ring], template: `<ui-button tooltip ring />`})
      class App {}

      await render(App);

      expect(ranResolvers()).toEqual(['supplied', 'cmp-listener', 'tooltip', 'ring']);
    });

    it('matches directives in the order of the imports', async () => {
      @Component({imports: [UiButton, Ring, Tooltip], template: `<ui-button tooltip ring />`})
      class App {}

      await render(App);

      expect(ranResolvers()).toEqual(['supplied', 'cmp-listener', 'ring', 'tooltip']);
    });

    it("runs the component's host directive resolver, then its @HostListener resolver", async () => {
      @Component({imports: [UiButton], template: `<ui-button />`})
      class App {}

      await render(App);

      expect(ranResolvers()).toEqual(['supplied', 'cmp-listener']);
    });

    it('passes the next resolver only the classes that a lower resolver returned', async () => {
      @Directive({selector: '[tidy]', host: {class: 'dir', '(class)': 'tidy($event)'}})
      class Tidy {
        protected tidy(sources: ClassSources) {
          return [...sources.flat().filter((className) => className !== 'drop'), 'added'];
        }
      }

      @Component({
        imports: [Tidy],
        template: `<div tidy class="keep drop" (class)="capture($event)"></div>`,
      })
      class App {
        sources: ClassSources | null = null;

        protected capture(sources: ClassSources) {
          this.sources = sources;
          return sources.flat();
        }
      }

      const fixture = await render(App);

      expect(fixture.componentInstance.sources).toEqual([[], ['dir', 'added'], ['keep']]);
      expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual([
        'added',
        'dir',
        'keep',
      ]);
    });

    it('keeps the order of the classes that a lower resolver returned', async () => {
      @Directive({selector: '[lower]', host: {class: 'x y', '(class)': 'resolve($event)'}})
      class Lower {
        protected resolve(sources: ClassSources) {
          return sources.flat().reverse();
        }
      }

      @Component({
        imports: [Lower],
        template: `<div lower class="a b" (class)="capture($event)"></div>`,
      })
      class App {
        sources: ClassSources | null = null;

        protected capture(sources: ClassSources) {
          this.sources = sources;
          return sources.flat();
        }
      }

      const fixture = await render(App);

      expect(fixture.componentInstance.sources).toEqual([[], ['y', 'x'], ['b', 'a']]);
    });

    it("ranks a class that a lower resolver appends at its owner's source", async () => {
      @Component({
        selector: 'ui-badge',
        template: '',
        host: {class: 'bg-primary', '(class)': 'resolve($event)'},
      })
      class UiBadge {
        protected resolve(sources: ClassSources) {
          return [...sources.flat(), 'bg-muted'];
        }
      }

      @Component({
        imports: [UiBadge],
        template: `<ui-badge class="bg-red-600" (class)="capture($event)" />`,
      })
      class App {
        sources: ClassSources | null = null;

        protected capture(sources: ClassSources) {
          this.sources = sources;
          return cn(sources);
        }
      }

      const fixture = await render(App);

      expect(fixture.componentInstance.sources).toEqual([
        ['bg-primary', 'bg-muted'],
        [],
        ['bg-red-600'],
      ]);
      expect(classesOf(fixture.nativeElement.querySelector('ui-badge'))).toEqual(['bg-red-600']);
    });

    for (const [form, value, expected] of [
      ['a string', 'a  b', ['a', 'b']],
      ['a string with a duplicate', 'a b a', ['a', 'b']],
      ['an array', ['a', '', 'b'], ['a', 'b']],
      ['an array with a duplicate', ['a', 'b', 'a'], ['a', 'b']],
      ['a Set', new Set(['a', 'b']), ['a', 'b']],
      ['an object map', {a: true, x: false, b: 1}, ['a', 'b']],
      ['null', null, []],
      ['a number', 42, []],
    ] as Array<[string, unknown, string[]]>) {
      it(`passes the next resolver only the classes of ${form} that a lower resolver returned`, async () => {
        @Directive({selector: '[lower]', host: {'(class)': 'resolve()'}})
        class Lower {
          protected resolve() {
            return value;
          }
        }

        @Component({
          imports: [Lower],
          template: `<div lower class="c" (class)="capture($event)"></div>`,
        })
        class App {
          sources: ClassSources | null = null;

          protected capture(sources: ClassSources) {
            this.sources = sources;
            return sources.flat();
          }
        }

        const fixture = await render(App);

        expect(fixture.componentInstance.sources!.flat()).toEqual(expected);
      });
    }

    it('calls a function that a lower resolver returned once with the same $event', async () => {
      const runs: Array<{sources: ClassSources; calls: unknown[]}> = [];

      @Directive({selector: '[lower]', host: {'(class)': 'resolve($event)'}})
      class Lower {
        protected resolve(sources: ClassSources) {
          const run = {sources, calls: [] as unknown[]};
          runs.push(run);
          return (received: unknown) => {
            run.calls.push(received);
            return ['a', 'b'];
          };
        }
      }

      @Component({
        imports: [Lower],
        template: `<div lower class="c" (class)="capture($event)"></div>`,
      })
      class App {
        sources: ClassSources | null = null;

        protected capture(sources: ClassSources) {
          this.sources = sources;
          return sources.flat();
        }
      }

      const fixture = await render(App);

      expect(runs.length).toBeGreaterThan(0);
      for (const run of runs) {
        expect(run.calls.length).toBe(1);
        expect(run.calls[0]).toBe(run.sources);
      }
      expect(fixture.componentInstance.sources!.flat()).toEqual(['a', 'b']);
    });

    it('keeps host resolvers next to a directive output named class', async () => {
      const warn = spyOn(console, 'warn');
      const received: Array<[string, unknown]> = [];

      @Directive({selector: '[emitter]'})
      class Emitter {
        @Output('class') readonly classEvent = new EventEmitter<string>();
      }

      @Component({
        selector: 'ui-card',
        template: '',
        host: {class: 'cmp', '(class)': 'record($event)'},
      })
      class UiCard {
        protected record(sources: ClassSources) {
          received.push(['component', sources]);
          return [...sources.flat(), 'by-cmp'];
        }
      }

      @Component({
        imports: [UiCard, Emitter],
        template: `<ui-card emitter class="tpl" (class)="record($event)" />`,
      })
      class App {
        @ViewChild(Emitter) emitter!: Emitter;

        protected record(value: unknown) {
          received.push(['template', value]);
        }
      }

      const fixture = await render(App);
      expect(received).toContain(['component', [['cmp'], [], ['tpl']]]);
      expect(received.every(([handler]) => handler === 'component')).toBeTrue();
      expect(classesOf(fixture.nativeElement.querySelector('ui-card'))).toEqual([
        'by-cmp',
        'cmp',
        'tpl',
      ]);

      fixture.componentInstance.emitter.classEvent.emit('sent');
      await fixture.whenStable();

      expect(received.filter(([, value]) => value === 'sent')).toEqual([['template', 'sent']]);
      expect(
        warn.calls.allArgs().filter(([message]) => String(message).includes('NG0319')).length,
      ).toBe(1);
    });

    it("runs the component's resolver next to a host directive output aliased as class", async () => {
      const warn = spyOn(console, 'warn');

      @Directive()
      class Emitter {
        @Output() readonly changed = new EventEmitter<string>();
      }

      @Component({
        selector: 'ui-card',
        template: '',
        hostDirectives: [{directive: Emitter, outputs: ['changed: class']}],
        host: {class: 'cmp', '(class)': 'resolve($event)'},
      })
      class UiCard {
        protected readonly resolve = resolver('cmp-host');
      }

      @Component({imports: [UiCard], template: `<ui-card />`})
      class App {}

      const fixture = await render(App);

      expect(ranResolvers()).toEqual(['cmp-host']);
      expect(classesOf(fixture.nativeElement.querySelector('ui-card'))).toEqual([
        'by-cmp-host',
        'cmp',
      ]);
      expect(warn).not.toHaveBeenCalledWith(jasmine.stringContaining('NG0319'));
    });

    it('reports a resolver that writes a signal', async () => {
      const errors = captureErrors();

      @Component({template: `<div class="p-2" (class)="record($event)"></div>`})
      class App {
        readonly received = signal<ClassSources | null>(null);

        protected record(sources: ClassSources) {
          this.received.set(sources);
          return sources.flat();
        }
      }

      await render(App);

      expect(errors.map(String).join('\n')).toContain('NG0600');
    });

    describe('when a resolver changes state that its own bindings read', () => {
      @Component({
        template: `<div [class.odd]="resolutions % 2 === 1" (class)="track($event)"></div>`,
      })
      class App {
        resolutions = 0;

        protected track(sources: ClassSources) {
          this.resolutions++;
          return sources.flat();
        }
      }

      it('leaves an OnPush element out of date without an error', async () => {
        const errors = captureErrors();

        const fixture = await render(App);

        // `resolutions` is now odd, but the binding read it before the resolver ran.
        expect(fixture.componentInstance.resolutions).toBe(1);
        expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual([]);
        expect(errors).toEqual([]);
      });

      it('reports the change when checkNoChanges is exhaustive', async () => {
        const errors = captureErrors([provideCheckNoChangesConfig({exhaustive: true})]);

        await render(App);

        expect(errors.map(String).join('\n')).toContain('NG0100');
      });

      it('reports the change in an eager view', async () => {
        const errors = captureErrors();

        @Component({
          template: `<div [class.odd]="resolutions % 2 === 1" (class)="track($event)"></div>`,
          changeDetection: ChangeDetectionStrategy.Eager,
        })
        class EagerApp extends App {}

        await render(EagerApp);

        expect(errors.map(String).join('\n')).toContain('NG0100');
      });
    });
  });
});

describe('(attr.class) binding', () => {
  @Component({selector: 'ui-button', template: '', host: {class: 'btn px-2'}})
  class UiButton {}

  it('applies the classes that the handler resolves', async () => {
    @Component({
      imports: [UiButton],
      template: `<ui-button
        class="px-4"
        (attr.class)="$event.resolve($event.resolver('shadow-lg'))"
      />`,
    })
    class App {}

    const fixture = await render(App);

    expect(classesOf(fixture.nativeElement.querySelector('ui-button'))).toEqual([
      'btn',
      'px-2',
      'px-4',
      'shadow-lg',
    ]);
  });

  it("passes the sources through when the handler doesn't call resolve()", async () => {
    @Component({
      imports: [UiButton],
      template: `<ui-button class="px-4" (attr.class)="track($event.sources)" />`,
    })
    class App {
      sources: ClassSources | null = null;

      protected track(sources: ClassSources) {
        this.sources = sources;
        return ['ignored'];
      }
    }

    const fixture = await render(App);

    expect(fixture.componentInstance.sources).toEqual([['btn', 'px-2'], [], ['px-4']]);
    expect(classesOf(fixture.nativeElement.querySelector('ui-button'))).toEqual([
      'btn',
      'px-2',
      'px-4',
    ]);
  });

  it('replaces every class with the classes passed to resolve()', async () => {
    @Component({
      imports: [UiButton],
      template: `<ui-button class="px-4" (attr.class)="$event.resolve(['only'])" />`,
    })
    class App {}

    const fixture = await render(App);

    expect(classesOf(fixture.nativeElement.querySelector('ui-button'))).toEqual(['only']);
  });

  describe("ranks the resolver's extras at the end of the caller's source", () => {
    @Directive({selector: '[tooltip]', host: {class: 'dir'}})
    class Tooltip {}

    it('from the template', async () => {
      @Component({selector: 'ui-card', template: '', host: {class: 'cmp'}})
      class UiCard {}

      @Component({
        imports: [UiCard, Tooltip],
        template: `<ui-card
          tooltip
          class="tpl"
          (attr.class)="$event.resolve(record($event.resolver('extra')))"
        />`,
      })
      class App {
        merged = '';

        protected record(classes: ResolvedClasses) {
          this.merged = String(classes);
          return classes;
        }
      }

      const fixture = await render(App);

      expect(fixture.componentInstance.merged).toBe('cmp dir tpl extra');
      expect(classesOf(fixture.nativeElement.querySelector('ui-card'))).toEqual([
        'cmp',
        'dir',
        'extra',
        'tpl',
      ]);
    });

    it("from a component's host", async () => {
      let merged = '';

      @Component({
        selector: 'ui-card',
        template: '',
        host: {class: 'cmp', '(attr.class)': `$event.resolve(record($event.resolver('extra')))`},
      })
      class UiCard {
        protected record(classes: ResolvedClasses) {
          merged = String(classes);
          return classes;
        }
      }

      @Component({
        imports: [UiCard, Tooltip],
        template: `<ui-card tooltip class="tpl" (attr.class)="capture($event.sources)" />`,
      })
      class App {
        sources: ClassSources | null = null;

        protected capture(sources: ClassSources) {
          this.sources = sources;
        }
      }

      const fixture = await render(App);

      expect(merged).toBe('cmp extra dir tpl');
      expect(fixture.componentInstance.sources).toEqual([['cmp', 'extra'], ['dir'], ['tpl']]);
    });

    it("from a directive's host", async () => {
      let merged = '';

      @Component({selector: 'ui-card', template: '', host: {class: 'cmp'}})
      class UiCard {}

      @Directive({
        selector: '[elevated]',
        host: {class: 'dir', '(attr.class)': `$event.resolve(record($event.resolver('extra')))`},
      })
      class Elevated {
        protected record(classes: ResolvedClasses) {
          merged = String(classes);
          return classes;
        }
      }

      @Component({
        imports: [UiCard, Elevated],
        template: `<ui-card elevated class="tpl" (attr.class)="capture($event.sources)" />`,
      })
      class App {
        sources: ClassSources | null = null;

        protected capture(sources: ClassSources) {
          this.sources = sources;
        }
      }

      const fixture = await render(App);

      expect(merged).toBe('cmp dir extra tpl');
      expect(fixture.componentInstance.sources).toEqual([['cmp'], ['dir', 'extra'], ['tpl']]);
    });
  });

  for (const [form, value, expected] of [
    ['a string', 'a  b', ['a', 'b']],
    ['an array', ['a', 'b'], ['a', 'b']],
    ['a Set', new Set(['a', 'b']), ['a', 'b']],
    ['an object map', {a: true, x: false, b: 1}, ['a', 'b']],
    ['null', null, []],
    ['undefined', undefined, []],
    ['false', false, []],
    ['an empty string', '', []],
  ] as Array<[string, ClassBindingValue, string[]]>) {
    it(`resolves the classes of ${form}`, async () => {
      @Component({template: `<div class="c" (attr.class)="$event.resolve(value)"></div>`})
      class App {
        protected readonly value = value;
      }

      const fixture = await render(App);

      expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(expected);
    });
  }

  describe('leaves out names that contain a space', () => {
    for (const [form, value] of [
      ['an array', ['a b', 'c']],
      ['a Set', new Set(['a b', 'c'])],
      ['an object map', {'a b': true, c: true}],
    ] as Array<[string, ClassBindingValue]>) {
      it(`of ${form} passed to resolve()`, async () => {
        @Component({template: `<div class="d" (attr.class)="$event.resolve(value)"></div>`})
        class App {
          protected readonly value = value;
        }

        const fixture = await render(App);

        expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['c']);
      });

      it(`of ${form} passed to the resolver`, async () => {
        @Component({
          template: `<div class="d" (attr.class)="$event.resolve($event.resolver(value))"></div>`,
        })
        class App {
          protected readonly value = value;
        }

        const fixture = await render(App);

        expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['c', 'd']);
      });

      it(`of ${form} that a lower registration resolves`, async () => {
        @Directive({selector: '[lower]', host: {'(attr.class)': '$event.resolve(value)'}})
        class Lower {
          protected readonly value = value;
        }

        @Component({
          imports: [Lower],
          template: `<div lower class="d" (attr.class)="capture($event.sources)"></div>`,
        })
        class App {
          sources: ClassSources | null = null;

          protected capture(sources: ClassSources) {
            this.sources = sources;
          }
        }

        const fixture = await render(App);

        expect(fixture.componentInstance.sources).toEqual([[], ['c'], []]);
      });
    }
  });

  it('keeps names that contain a space for the next (class) shorthand', async () => {
    @Directive({selector: '[lower]', host: {'(class)': 'resolve()'}})
    class Lower {
      protected resolve() {
        return ['a b', 'c'];
      }
    }

    @Component({imports: [Lower], template: `<div lower (class)="capture($event)"></div>`})
    class App {
      sources: ClassSources | null = null;

      protected capture(sources: ClassSources) {
        this.sources = sources;
        return sources.flat();
      }
    }

    const fixture = await render(App);

    expect(fixture.componentInstance.sources).toEqual([[], ['a b', 'c'], []]);
  });

  it('receives the classes that a lower (class) shorthand returned', async () => {
    @Component({
      selector: 'ui-badge',
      template: '',
      host: {class: 'bg-primary', '(class)': 'resolve($event)'},
    })
    class UiBadge {
      protected resolve(sources: ClassSources) {
        return [...sources.flat(), 'by-host'];
      }
    }

    @Component({
      imports: [UiBadge],
      template: `<ui-badge class="tpl" (attr.class)="resolveWith($event)" />`,
    })
    class App {
      sources: ClassSources | null = null;
      merged = '';

      protected resolveWith(event: ClassResolveEvent) {
        this.sources = event.sources;
        const classes = event.resolver('extra');
        this.merged = String(classes);
        event.resolve(classes);
      }
    }

    const fixture = await render(App);

    expect(fixture.componentInstance.sources).toEqual([['bg-primary', 'by-host'], [], ['tpl']]);
    expect(fixture.componentInstance.merged).toBe('bg-primary by-host tpl extra');
    expect(classesOf(fixture.nativeElement.querySelector('ui-badge'))).toEqual([
      'bg-primary',
      'by-host',
      'extra',
      'tpl',
    ]);
  });

  it('resolves again on each refresh with a new event', async () => {
    @Component({template: `<div class="c" (attr.class)="resolveWith($event, size())"></div>`})
    class App {
      readonly size = signal('text-sm');
      readonly events: ClassResolveEvent[] = [];

      protected resolveWith(event: ClassResolveEvent, size: string) {
        this.events.push(event);
        event.resolve(event.resolver(size));
      }
    }

    const fixture = await render(App);
    const div = fixture.nativeElement.querySelector('div');
    const {events} = fixture.componentInstance;
    const firstRefreshes = events.length;
    expect(classesOf(div)).toEqual(['c', 'text-sm']);

    fixture.componentInstance.size.set('text-lg');
    await fixture.whenStable();

    expect(classesOf(div)).toEqual(['c', 'text-lg']);
    expect(events.length).toBeGreaterThan(firstRefreshes);
    expect(new Set(events).size).toBe(events.length);
    expect(() => events[0].resolve('late')).toThrowError(/NG0320/);
  });

  it('seals the event of a handler that throws', async () => {
    const events: ClassResolveEvent[] = [];

    @Component({template: `<div (attr.class)="fail($event)"></div>`})
    class App {
      protected fail(event: ClassResolveEvent) {
        events.push(event);
        throw new Error('Handler failed');
      }
    }

    await expectAsync(render(App)).toBeRejectedWithError(/Handler failed/);

    expect(() => events[0].resolve('late')).toThrowError(/NG0320/);
  });

  /** Resolves classes with a value whose getter calls `resolve()` again while it's read. */
  @Component({template: `<div (attr.class)="$event.resolve(reentrant($event))"></div>`})
  class ReentrantApp {
    protected reentrant(event: ClassResolveEvent) {
      return {
        get outer() {
          event.resolve('inner');
          return true;
        },
      };
    }
  }

  it('reports a call to resolve() from a value that resolve() reads in dev mode', async () => {
    await expectAsync(render(ReentrantApp)).toBeRejectedWithError(/NG0320/);
  });

  describe('in production mode', () => {
    const _global: {ngDevMode: unknown} = globalThis as any;
    let savedNgDevMode: unknown;
    beforeEach(() => {
      savedNgDevMode = _global.ngDevMode;
      _global.ngDevMode = false;
    });
    afterEach(() => (_global.ngDevMode = savedNgDevMode));

    it('ignores a call to resolve() after the handler returns', async () => {
      @Component({template: `<div class="c" (attr.class)="keep($event)"></div>`})
      class App {
        event: ClassResolveEvent | null = null;

        protected keep(event: ClassResolveEvent) {
          this.event = event;
        }
      }

      const fixture = await render(App);

      expect(() => fixture.componentInstance.event!.resolve('late')).not.toThrow();
      expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['c']);
    });

    it('applies the last call to resolve() while the handler runs', async () => {
      @Component({template: `<div (attr.class)="$event.resolve('a'); $event.resolve('b')"></div>`})
      class App {}

      const fixture = await render(App);

      expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['b']);
    });

    it('applies the call to resolve() from a value that resolve() reads', async () => {
      const fixture = await render(ReentrantApp);

      expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['inner']);
    });
  });

  it('reports a second call to resolve() in dev mode', async () => {
    @Component({template: `<div (attr.class)="$event.resolve('a'); $event.resolve('b')"></div>`})
    class App {}

    await expectAsync(render(App)).toBeRejectedWithError(/NG0320/);
  });

  it('reports a call to resolve() after the handler returns in dev mode', async () => {
    @Component({template: `<div (attr.class)="keep($event)"></div>`})
    class App {
      event: ClassResolveEvent | null = null;

      protected keep(event: ClassResolveEvent) {
        this.event = event;
      }
    }

    const fixture = await render(App);

    expect(() => fixture.componentInstance.event!.resolve('late')).toThrowError(/NG0320/);
  });
});

/**
 * Typing tests.
 */

// @ts-expect-error: only a resolver creates `ResolvedClasses`, so a string isn't one.
const resolveToString: ClassCallback = (cn) => 'x';

function resolveNumber(event: ClassResolveEvent) {
  // @ts-expect-error: a number is neither a class value nor `ResolvedClasses`.
  event.resolve(42);
}
