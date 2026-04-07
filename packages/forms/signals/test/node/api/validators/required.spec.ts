/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {Injector, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {form, required} from '../../../../public_api';
import {requiredError} from '../../../../src/api/rules/validation/validation_errors';

describe('required validator', () => {
  it('returns required Error when the value is not present', () => {
    const cat = signal({name: ''});
    const f = form(
      cat,
      (p) => {
        required(p.name);
      },
      {
        injector: TestBed.inject(Injector),
      },
    );

    expect(f.name().errors()).toEqual([requiredError({fieldTree: f.name})]);
    f.name().value.set('pirojok-the-cat');
    expect(f.name().errors()).toEqual([]);
  });

  it('supports custom errors', () => {
    const cat = signal({name: '', age: 5});
    const f = form(
      cat,
      (p) => {
        required(p.name, {
          error: (ctx) => ({kind: `required-${ctx.valueOf(p.age)}`}),
        });
      },
      {
        injector: TestBed.inject(Injector),
      },
    );

    expect(f.name().errors()).toEqual([{kind: 'required-5', fieldTree: f.name}]);
    f.name().value.set('pirojok-the-cat');
    expect(f.name().errors()).toEqual([]);
  });

  it('supports custom error messages', () => {
    const cat = signal({name: '', age: 5});
    const f = form(
      cat,
      (p) => {
        required(p.name, {
          message: 'required error',
        });
      },
      {
        injector: TestBed.inject(Injector),
      },
    );

    expect(f.name().errors()).toEqual([
      requiredError({message: 'required error', fieldTree: f.name}),
    ]);
    f.name().value.set('pirojok-the-cat');
    expect(f.name().errors()).toEqual([]);
  });

  it('supports custom error extras', () => {
    const cat = signal({name: '', age: 5});
    const f = form(
      cat,
      (p) => {
        required(p.name, {
          message: 'required error',
          extras: {
            severity: 'blocking',
            source: 'schema',
          },
        });
      },
      {
        injector: TestBed.inject(Injector),
      },
    );

    expect(f.name().errors()).toEqual([
      requiredError({
        message: 'required error',
        severity: 'blocking',
        source: 'schema',
        fieldTree: f.name,
      }),
    ]);
  });

  it('supports dynamic error extras', () => {
    const cat = signal({name: '', country: 'USA'});
    const f = form(
      cat,
      (p) => {
        required(p.name, {
          extras: ({valueOf}) => ({
            country: valueOf(p.country),
          }),
        });
      },
      {
        injector: TestBed.inject(Injector),
      },
    );

    expect(f.name().errors()).toEqual([
      requiredError({
        country: 'USA',
        fieldTree: f.name,
      }),
    ]);
  });

  for (const reservedKey of ['kind', 'message', 'fieldTree', 'formField'] as const) {
    it(`throws when extras contains reserved key "${reservedKey}"`, () => {
      expect(() => {
        const cat = signal({name: ''});
        const f = form(
          cat,
          (p) => {
            required(p.name, {
              extras: {[reservedKey]: 'reserved'} as any,
            });
          },
          {
            injector: TestBed.inject(Injector),
          },
        );

        f.name().errors();
      }).toThrowError(
        new RegExp(`Validator config extras cannot contain reserved key\\(s\\): ${reservedKey}`),
      );
    });
  }

  it('supports custom condition', () => {
    const cat = signal({name: '', age: 5});
    const f = form(
      cat,
      (p) => {
        required(p.name, {
          when({valueOf}) {
            return valueOf(p.age) > 10;
          },
        });
      },
      {
        injector: TestBed.inject(Injector),
      },
    );

    expect(f.name().errors()).toEqual([]);
    f.age().value.set(15);
    expect(f.name().errors()).toEqual([requiredError({fieldTree: f.name})]);
  });

  it('supports returning custom plain error, and wraps it as custom', () => {
    const cat = signal({name: 'meow', age: 5});
    const f = form(
      cat,
      (p) => {
        required(p.name, {
          error: () => {
            return {kind: 'pirojok-the-error'};
          },
        });
      },
      {
        injector: TestBed.inject(Injector),
      },
    );

    expect(f.name().errors()).toEqual([]);
    f.name().value.set('');
    expect(f.name().errors()).toEqual([{kind: 'pirojok-the-error', fieldTree: f.name}]);
  });
});
