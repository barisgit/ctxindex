import { compareUnicodeCodePoints } from '../internal/code-point-order'

export const compareStrings = compareUnicodeCodePoints

export function compareReferences(
  left: { readonly id: string; readonly version: number },
  right: { readonly id: string; readonly version: number },
): number {
  return compareStrings(left.id, right.id) || left.version - right.version
}
