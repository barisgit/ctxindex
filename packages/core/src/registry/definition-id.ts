const MAX_DEFINITION_ID_LENGTH = 128
const DEFINITION_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u

export function isDefinitionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_DEFINITION_ID_LENGTH &&
    DEFINITION_ID_PATTERN.test(value)
  )
}
