export function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = left[Symbol.iterator]()
  const rightPoints = right[Symbol.iterator]()
  while (true) {
    const leftPoint = leftPoints.next()
    const rightPoint = rightPoints.next()
    if (leftPoint.done || rightPoint.done) {
      if (leftPoint.done && rightPoint.done) return 0
      return leftPoint.done ? -1 : 1
    }
    const difference =
      (leftPoint.value.codePointAt(0) ?? 0) -
      (rightPoint.value.codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
}
