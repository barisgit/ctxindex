export function json(value: unknown): string {
  return JSON.stringify(value)
}

const RENDERED_CONSTRAINT_KEYS = new Set([
  'type',
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'exclusiveMinimum',
  'maximum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'uniqueItems',
  'enum',
  'const',
  'pattern',
  'default',
  'items',
  'description',
  'title',
  '$schema',
  '$id',
])

export function unrenderedSchema(
  schema: Record<string, unknown>,
  additionallyRendered: readonly string[] = [],
): Record<string, unknown> | undefined {
  const rendered = new Set([
    ...RENDERED_CONSTRAINT_KEYS,
    ...additionallyRendered,
  ])
  const entries = Object.entries(schema).filter(([key]) => !rendered.has(key))
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function schemaType(schema: Record<string, unknown>): string {
  if (schema.type === 'array') {
    const items = record(schema.items)
    return `${items ? schemaType(items) : 'unknown'}[]`
  }
  if (typeof schema.type === 'string') return schema.type
  if (Array.isArray(schema.type)) return schema.type.join(' | ')
  for (const key of ['oneOf', 'anyOf'] as const) {
    if (!Array.isArray(schema[key])) continue
    const types = schema[key]
      .map((item) => record(item))
      .filter((item): item is Record<string, unknown> => item !== undefined)
      .map(schemaType)
    if (types.length > 0) return types.join(' | ')
  }
  return schema.properties ? 'object' : 'unknown'
}

export function schemaConstraints(
  schema: Record<string, unknown>,
  includeItems = true,
): string[] {
  const constraints: string[] = []
  const labels: [string, string][] = [
    ['minLength', 'min length'],
    ['maxLength', 'max length'],
    ['minimum', 'minimum'],
    ['exclusiveMinimum', 'exclusive minimum'],
    ['maximum', 'maximum'],
    ['exclusiveMaximum', 'exclusive maximum'],
    ['multipleOf', 'multiple of'],
    ['minItems', 'min items'],
    ['maxItems', 'max items'],
    ['minProperties', 'min properties'],
    ['maxProperties', 'max properties'],
  ]
  if (typeof schema.title === 'string')
    constraints.push(`title: ${schema.title}`)
  if (typeof schema.description === 'string')
    constraints.push(schema.description)
  if (typeof schema.format === 'string')
    constraints.push(`format: ${schema.format}`)
  for (const [key, label] of labels) {
    const value = schema[key]
    if (typeof value === 'number') constraints.push(`${label}: ${value}`)
  }
  if (schema.uniqueItems === true) constraints.push('unique items')
  if (Array.isArray(schema.enum))
    constraints.push(`one of: ${json(schema.enum)}`)
  if (schema.const !== undefined)
    constraints.push(`constant: ${json(schema.const)}`)
  if (typeof schema.pattern === 'string')
    constraints.push(`pattern: ${json(schema.pattern)}`)
  if (schema.default !== undefined)
    constraints.push(`default: ${json(schema.default)}`)
  if (includeItems) {
    const items = record(schema.items)
    if (items) {
      const itemConstraints = schemaConstraints(items, false)
      const remainder = unrenderedSchema(items)
      if (remainder) itemConstraints.push(`schema fragment: ${json(remainder)}`)
      constraints.push(
        `items: <${schemaType(items)}>${itemConstraints.length > 0 ? `; ${itemConstraints.join('; ')}` : ''}`,
      )
    }
  }
  return constraints
}
