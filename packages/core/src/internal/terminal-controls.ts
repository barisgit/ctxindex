export function containsTerminalControlCharacters(content: string): boolean {
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index)
    if (code === 13) {
      if (content.charCodeAt(index + 1) !== 10) return true
      continue
    }
    if (
      code <= 8 ||
      (code >= 11 && code <= 12) ||
      (code >= 14 && code <= 31) ||
      (code >= 127 && code <= 159)
    )
      return true
  }
  return false
}
