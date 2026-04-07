/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {ɵRuntimeError as RuntimeError} from '@angular/core';
import {RuntimeErrorCode} from '../../../errors';
import {LogicFn, OneOrMany, PathKind, type FieldContext} from '../../types';
import {type ValidationError} from './validation_errors';

/** Represents a value that has a length or size, such as an array or string, or set. */
export type ValueWithLengthOrSize = {length: number} | {size: number};

/** Extra properties that will be spread onto the built-in validation error. */
export type ValidationErrorExtras = Readonly<Record<string, unknown>> & {
  kind?: never;
  message?: never;
  fieldTree?: never;
  formField?: never;
};

/** Common options available on the standard validators. */
export type BaseValidatorConfig<TValue, TPathKind extends PathKind = PathKind.Root> =
  | {
      /** A user-facing error message to include with the error. */
      message?: string | LogicFn<TValue, string, TPathKind>;
      /** Additional properties that will be spread onto the error. */
      extras?: ValidationErrorExtras | LogicFn<TValue, ValidationErrorExtras, TPathKind>;
      error?: never;
    }
  | {
      /**
       * Custom validation error(s) to report instead of the default,
       * or a function that receives the `FieldContext` and returns custom validation error(s).
       */
      error?: OneOrMany<ValidationError> | LogicFn<TValue, OneOrMany<ValidationError>, TPathKind>;
      message?: never;
      extras?: never;
    };

const RESERVED_VALIDATION_ERROR_EXTRA_KEYS = ['kind', 'message', 'fieldTree', 'formField'] as const;

/** Gets the length or size of the given value. */
export function getLengthOrSize(value: ValueWithLengthOrSize) {
  const v = value as {length: number; size: number};
  return typeof v.length === 'number' ? v.length : v.size;
}

/**
 * Gets the value for an option that may be either a static value or a logic function that produces
 * the option value.
 *
 * @param opt The option from BaseValidatorConfig.
 * @param ctx The current FieldContext.
 * @returns The value for the option.
 */
export function getOption<TOption, TValue, TPathKind extends PathKind = PathKind.Root>(
  opt: Exclude<TOption, Function> | LogicFn<TValue, TOption, TPathKind> | undefined,
  ctx: FieldContext<TValue, TPathKind>,
): TOption | undefined {
  return opt instanceof Function ? opt(ctx) : opt;
}

/** Resolves and sanitizes validator config extras for the built-in validation error factories. */
export function getValidationErrorExtras<TValue, TPathKind extends PathKind = PathKind.Root>(
  extras: ValidationErrorExtras | LogicFn<TValue, ValidationErrorExtras, TPathKind> | undefined,
  ctx: FieldContext<TValue, TPathKind>,
) {
  const resolvedExtras = getOption(extras, ctx);
  if (resolvedExtras === undefined) {
    return {};
  }

  const reservedKeys = RESERVED_VALIDATION_ERROR_EXTRA_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(resolvedExtras, key),
  );

  if (reservedKeys.length === 0) {
    return resolvedExtras;
  }

  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    throw new RuntimeError(
      RuntimeErrorCode.INVALID_VALIDATOR_EXTRAS,
      `Validator config extras cannot contain reserved key(s): ${reservedKeys.join(', ')}.`,
    );
  }

  const sanitizedExtras = {...resolvedExtras};
  for (const key of reservedKeys) {
    delete sanitizedExtras[key];
  }
  return sanitizedExtras;
}

/**
 * Checks if the given value is considered empty. Empty values are: null, undefined, '', false, NaN.
 */
export function isEmpty(value: unknown): boolean {
  if (typeof value === 'number') {
    return isNaN(value);
  }
  return value === '' || value === false || value == null;
}

/**
 * Normalizes validation errors (which can be a single error, an array of errors, or undefined)
 * into a list of errors.
 */
export function normalizeErrors<T>(error: OneOrMany<T> | undefined): readonly T[] {
  if (error === undefined) {
    return [];
  }
  if (Array.isArray(error)) {
    return error as readonly T[];
  }
  return [error as T];
}
