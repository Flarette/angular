/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {ParsedEventType} from '../expression_parser/ast';

/**
 * The form of an event binding that resolves the classes of its node: the shorthand `(class)` or
 * the full form `(attr.class)`.
 */
export type ClassResolverForm = 'shorthand' | 'fullForm';

/** The kind of node that declares an event binding. */
export type ClassResolverNodeKind = 'host' | 'element' | 'container';

/**
 * Gets the form of class resolver that an event binding declares, or `null` for an ordinary event
 * binding.
 */
export function getClassResolverForm(
  name: string,
  type: ParsedEventType,
  target: string | null,
  nodeKind: ClassResolverNodeKind,
): ClassResolverForm | null {
  return nodeKind === 'container' ? null : getClassResolverBindingForm(name, type, target);
}

/** Gets the form of class resolver that an event binding declares, whichever node declares it. */
export function getClassResolverBindingForm(
  name: string,
  type: ParsedEventType,
  target: string | null,
): ClassResolverForm | null {
  if (type !== ParsedEventType.Regular || target !== null) {
    return null;
  }

  if (name === 'class') {
    return 'shorthand';
  }

  if (name === 'attr.class') {
    return 'fullForm';
  }

  return null;
}
