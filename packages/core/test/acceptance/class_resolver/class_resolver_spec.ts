/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  ChangeDetectionStrategy,
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

    it('listens instead of resolving on <ng-container>', async () => {
      const received: unknown[] = [];

      @Directive({selector: '[recorder]', host: {'(class)': 'record($event)'}})
      class Recorder {
        protected record(value: unknown) {
          received.push(value);
          return ['by-recorder'];
        }
      }

      @Component({imports: [Recorder], template: `<ng-container recorder />`})
      class App {}

      await expectAsync(render(App)).toBeResolved();

      expect(received).toEqual([]);
    });
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

      expect(fixture.componentInstance.received).toBe('sent');
      expect(classesOf(fixture.nativeElement.querySelector('div'))).toEqual(['p-2', 'p-4']);
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

      expect(fixture.componentInstance.received).toBe('sent');
      expect(warn).not.toHaveBeenCalled();
    });

    it('keeps subscribing a host binding to the output on <ng-container>', async () => {
      const warn = spyOn(console, 'warn');
      const received: unknown[] = [];

      @Directive({selector: '[recorder]', host: {'(class)': 'record($event)'}})
      class Recorder {
        protected record(value: unknown) {
          received.push(value);
        }
      }

      @Component({
        imports: [Emitter, Recorder],
        template: `<ng-container emitter recorder />`,
      })
      class App {
        @ViewChild(Emitter) emitter!: Emitter;
      }

      const fixture = await render(App);
      fixture.componentInstance.emitter.classEvent.emit('sent');

      expect(received).toEqual(['sent']);
      expect(warn).not.toHaveBeenCalledWith(jasmine.stringContaining('NG0319'));
    });
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
      it(`passes the next resolver the classes of ${form} that a lower resolver returned`, async () => {
        @Directive({selector: '[lower]', host: {'(class)': 'resolve()'}})
        class Lower {
          protected resolve() {
            return value;
          }
        }

        // The class `c` shows that the lower resolver's result replaces the collected classes.
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
      // One entry per run of the lower resolver: its `$event`, and each argument of the function
      // it returned.
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
