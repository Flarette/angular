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

/**
 * The kind of node that declares an event binding. A host binding resolves the classes of the host
 * element. A container, such as `<ng-container>`, has no classes to resolve.
 */
export type ClassResolverNodeKind = 'host' | 'element' | 'container';

/**
 * Gets the form of class resolver that an event binding declares, or `null` for an ordinary event
 * binding. A binding with a target, such as `(window:class)`, never resolves.
 */
export function getClassResolverForm(
  name: string,
  type: ParsedEventType,
  target: string | null,
  nodeKind: ClassResolverNodeKind,
): ClassResolverForm | null {
  if (nodeKind === 'container' || type !== ParsedEventType.Regular || target !== null) {
    return null;
  }

  if (name === 'class') {
    return 'shorthand';
  }

  if (name === 'attr.class') {
    return 'fullForm';
  }

  // Other `attr.*` names stay ordinary event bindings. Reserving the whole namespace, for resolvers
  // of other attributes, would be this check:
  // if (name.startsWith('attr.')) {
  //   return 'reserved';
  // }

  return null;
}
