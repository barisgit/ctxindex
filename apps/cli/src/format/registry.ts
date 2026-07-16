import {
  compareReferences,
  type RegistryDescription,
} from '@ctxindex/core/registry'

function json(value: unknown): string {
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

function unrenderedSchema(
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

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function schemaType(schema: Record<string, unknown>): string {
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

function schemaConstraints(
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

function formatInputText(input: object): string[] {
  const schema = record(input)
  if (!schema) return [`    schema: ${json(input)}`]
  const properties = record(schema.properties)
  if (schema.type !== 'object' || !properties)
    return [
      `    <${schemaType(schema)}>`,
      ...schemaConstraints(schema).map((part) => `      ${part}`),
    ]
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
  )
  const lines: string[] = []
  if (typeof schema.title === 'string') lines.push(`    title: ${schema.title}`)
  if (typeof schema.description === 'string')
    lines.push(`    ${schema.description}`)
  for (const [name, value] of Object.entries(properties)) {
    const property = record(value)
    if (!property) {
      lines.push(
        `    ${name} <unknown>${required.has(name) ? ' required' : ''}`,
        `      schema fragment: ${json(value)}`,
      )
      continue
    }
    lines.push(
      `    ${name} <${schemaType(property)}>${required.has(name) ? ' required' : ''}`,
    )
    lines.push(...schemaConstraints(property).map((part) => `      ${part}`))
    const remainder = unrenderedSchema(property)
    if (remainder) lines.push(`      schema fragment: ${json(remainder)}`)
  }
  if (schema.additionalProperties === false)
    lines.push('    additional properties: not allowed')
  else if (schema.additionalProperties === true)
    lines.push('    additional properties: allowed')
  else if (record(schema.additionalProperties))
    lines.push(
      `    additional properties: <${schemaType(record(schema.additionalProperties) as Record<string, unknown>)}>`,
    )
  const remainder = unrenderedSchema(schema, [
    'properties',
    'required',
    'additionalProperties',
  ])
  if (remainder) lines.push(`    schema fragment: ${json(remainder)}`)
  return lines
}

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function formatInputMarkdown(input: object): string[] {
  const schema = record(input)
  const properties = schema ? record(schema.properties) : undefined
  if (!schema || schema.type !== 'object' || !properties)
    return ['```json', prettyJson(input), '```']
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
  )
  const lines = [
    '| Field | Type | Required | Constraints |',
    '| --- | --- | --- | --- |',
  ]
  if (typeof schema.title === 'string') lines.unshift(`**${schema.title}**`, '')
  if (typeof schema.description === 'string')
    lines.unshift(schema.description, '')
  for (const [name, value] of Object.entries(properties)) {
    const property = record(value)
    const constraints = property
      ? schemaConstraints(property)
      : [`schema fragment: ${json(value)}`]
    const remainder = property ? unrenderedSchema(property) : undefined
    if (remainder) constraints.push(`schema fragment: ${json(remainder)}`)
    lines.push(
      `| \`${markdownCell(name)}\` | \`${property ? markdownCell(schemaType(property)) : 'unknown'}\` | ${required.has(name) ? 'yes' : 'no'} | ${markdownCell(constraints.join('; '))} |`,
    )
  }
  if (schema.additionalProperties === false)
    lines.push('', 'Additional properties are not allowed.')
  else if (schema.additionalProperties === true)
    lines.push('', 'Additional properties are allowed.')
  else if (record(schema.additionalProperties))
    lines.push(
      '',
      `Additional properties must match \`<${schemaType(record(schema.additionalProperties) as Record<string, unknown>)}>\`.`,
    )
  const remainder = unrenderedSchema(schema, [
    'properties',
    'required',
    'additionalProperties',
  ])
  if (remainder)
    lines.push('', `Unrendered schema fragment: \`${json(remainder)}\``)
  return lines
}

function formatAuthText(auth: object): string[] {
  const value = record(auth)
  if (!value || typeof value.kind !== 'string') return [`  auth: ${json(auth)}`]
  const lines = [`  auth: ${value.kind}`]
  const provider = record(value.provider)
  if (provider) {
    if (typeof provider.authUrl === 'string')
      lines.push(`    authorization URL: ${provider.authUrl}`)
    if (typeof provider.tokenUrl === 'string')
      lines.push(`    token URL: ${provider.tokenUrl}`)
  }
  if (Array.isArray(value.scopes)) {
    lines.push('    scopes:')
    for (const scope of value.scopes)
      if (typeof scope === 'string') lines.push(`      ${scope}`)
  }
  return lines
}

function formatAuthMarkdown(auth: object): string[] {
  const value = record(auth)
  if (!value || typeof value.kind !== 'string')
    return [`- Auth: \`${json(auth)}\``]
  const lines = [`- Auth: ${value.kind}`]
  const provider = record(value.provider)
  if (provider) {
    if (typeof provider.authUrl === 'string')
      lines.push(`- Authorization URL: ${provider.authUrl}`)
    if (typeof provider.tokenUrl === 'string')
      lines.push(`- Token URL: ${provider.tokenUrl}`)
  }
  if (Array.isArray(value.scopes))
    lines.push(
      `- Scopes: ${value.scopes.filter((scope): scope is string => typeof scope === 'string').join(', ') || 'none'}`,
    )
  return lines
}

export type RegistryView = 'compact' | 'detail' | 'full'

function compactRegistryDescription(description: RegistryDescription) {
  return {
    kinds: description.kinds.map(({ id, version, summary, aliases }) => ({
      id,
      version,
      ...(summary === undefined ? {} : { summary }),
      aliases,
    })),
    sources: description.sources.map(
      ({ id, version, summary, routing, capabilities }) => ({
        id,
        version,
        ...(summary === undefined ? {} : { summary }),
        routing,
        capabilities,
      }),
    ),
    actions: description.actions.map(
      ({ id, profile, effect, output, adapters }) => ({
        id,
        profile,
        effect,
        output,
        adapters,
      }),
    ),
  }
}

export function filterRegistryDescription(
  description: RegistryDescription,
  selector?: 'profile' | 'adapter' | 'action',
  id?: string,
): RegistryDescription | undefined {
  if (!selector) return description
  const key =
    selector === 'profile'
      ? 'kinds'
      : selector === 'adapter'
        ? 'sources'
        : 'actions'
  const matches = description[key].filter(
    (item) => id === undefined || item.id === id,
  )
  if (id !== undefined && matches.length === 0) return undefined
  return {
    kinds:
      selector === 'profile' ? (matches as RegistryDescription['kinds']) : [],
    sources:
      selector === 'adapter' ? (matches as RegistryDescription['sources']) : [],
    actions:
      selector === 'action' ? (matches as RegistryDescription['actions']) : [],
  }
}

export function registryJsonValue(
  description: RegistryDescription,
  selector?: 'profile' | 'adapter' | 'action',
  view: RegistryView = 'full',
): unknown {
  const value =
    view === 'compact' ? compactRegistryDescription(description) : description
  if (!selector) return value
  const selected =
    selector === 'profile'
      ? value.kinds
      : selector === 'adapter'
        ? value.sources
        : value.actions
  return view === 'detail' ? selected[0] : selected
}

function formatCompactRegistryText(description: RegistryDescription): string {
  const lines: string[] = []
  if (description.kinds.length > 0) {
    lines.push(`PROFILES (${description.kinds.length})`)
    for (const kind of description.kinds)
      lines.push(
        `  ${kind.id}@${kind.version}${kind.summary ? ` - ${kind.summary}` : ''}`,
      )
  }
  if (description.sources.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`ADAPTERS (${description.sources.length})`)
    for (const source of description.sources)
      lines.push(
        `  ${source.id}@${source.version}${source.summary ? ` - ${source.summary}` : ''}`,
      )
  }
  if (description.actions.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`ACTIONS (${description.actions.length})`)
    for (const action of description.actions)
      lines.push(
        `  ${action.id} - ${action.profile.id}@${action.profile.version}, ${action.effect}`,
      )
  }
  if (lines.length > 0) lines.push('')
  lines.push(
    'Use `ctxindex describe <profile|adapter|action> <id>` for full details.',
    'Use `ctxindex describe --full` for the complete loaded interface.',
  )
  return lines.join('\n')
}

export function formatRegistryText(
  description: RegistryDescription,
  view: RegistryView = 'full',
): string {
  if (view === 'compact') return formatCompactRegistryText(description)
  const lines: string[] = []
  for (const kind of description.kinds) {
    lines.push(`PROFILE ${kind.id}@${kind.version}`)
    if (kind.summary) lines.push(`  ${kind.summary}`)
    if (kind.aliases.length) lines.push(`  aliases: ${kind.aliases.join(', ')}`)
    for (const field of kind.fields)
      lines.push(
        `  field ${field.name} <${field.type}>${field.docs ? ` - ${field.docs}` : ''}`,
      )
    for (const format of kind.formats)
      lines.push(`  format ${format.name} (${format.mediaType})`)
  }
  for (const source of description.sources) {
    lines.push(`ADAPTER ${source.id}@${source.version}`)
    if (source.summary) lines.push(`  ${source.summary}`)
    lines.push(`  routing: ${source.routing}`)
    lines.push(...formatAuthText(source.auth))
    lines.push(`  capabilities: ${source.capabilities.join(', ') || 'none'}`)
    for (const option of source.configOptions)
      lines.push(
        `  ${option.flag} <${option.type}>${option.required ? ' required' : ''}${option.docs ? ` - ${option.docs}` : ''}${option.default !== undefined ? `${option.docs ? ';' : ' -'} default: ${json(option.default)}` : ''}`,
      )
  }
  for (const action of description.actions) {
    lines.push(
      `ACTION ${action.id} (${action.profile.id}@${action.profile.version}, ${action.effect})`,
    )
    lines.push(`  ${action.docs}`)
    lines.push('  input:', ...formatInputText(action.input))
    lines.push(`  output: ${action.output.id}@${action.output.version}`)
    lines.push(
      `  adapters: ${action.adapters.map((adapter) => `${adapter.id}@${adapter.version}`).join(', ') || 'none'}`,
    )
    lines.push(
      '  examples:',
      ...prettyJson(action.examples)
        .split('\n')
        .map((line) => `    ${line}`),
    )
  }
  return lines.join('\n')
}

function formatCompactRegistryMarkdown(
  description: RegistryDescription,
): string {
  const lines = ['# ctxindex Registry', '']
  if (description.kinds.length > 0) {
    lines.push(`## Profiles (${description.kinds.length})`, '')
    for (const kind of description.kinds)
      lines.push(
        `- \`${kind.id}@${kind.version}\`${kind.summary ? ` — ${kind.summary}` : ''}`,
      )
    lines.push('')
  }
  if (description.sources.length > 0) {
    lines.push(`## Adapters (${description.sources.length})`, '')
    for (const source of description.sources)
      lines.push(
        `- \`${source.id}@${source.version}\`${source.summary ? ` — ${source.summary}` : ''}`,
      )
    lines.push('')
  }
  if (description.actions.length > 0) {
    lines.push(`## Actions (${description.actions.length})`, '')
    for (const action of description.actions)
      lines.push(
        `- \`${action.id}\` — ${action.profile.id}@${action.profile.version}, ${action.effect}`,
      )
    lines.push('')
  }
  lines.push(
    'Use `ctxindex describe <profile|adapter|action> <id>` for full details.',
    '',
    'Use `ctxindex describe --full` for the complete loaded interface.',
  )
  return lines.join('\n')
}

export function formatRegistryMarkdown(
  description: RegistryDescription,
  view: RegistryView = 'full',
): string {
  if (view === 'compact') return formatCompactRegistryMarkdown(description)
  const lines = ['# ctxindex Registry', '']
  if (description.kinds.length > 0) {
    lines.push('## Profiles', '')
    for (const kind of description.kinds) {
      lines.push(`### ${kind.id}@${kind.version}`, '', kind.summary ?? '')
      lines.push('', `- Aliases: ${kind.aliases.join(', ') || 'none'}`)
      lines.push(
        `- Fields: ${kind.fields.map((field) => `\`${field.name}\` (${field.type})${field.docs ? ` — ${field.docs}` : ''}`).join(', ') || 'none'}`,
      )
      lines.push(
        `- Formats: ${kind.formats.map((format) => `\`${format.name}\` (${format.mediaType})`).join(', ') || 'none'}`,
        '',
      )
    }
  }
  if (description.sources.length > 0) {
    lines.push('## Adapters', '')
    for (const source of description.sources) {
      lines.push(`### ${source.id}@${source.version}`, '', source.summary ?? '')
      lines.push(
        '',
        `- Profiles: ${source.profiles.map((profile) => `${profile.id}@${profile.version}`).join(', ') || 'none'}`,
      )
      lines.push(
        `- Routing: ${source.routing}`,
        ...formatAuthMarkdown(source.auth),
      )
      lines.push(`- Capabilities: ${source.capabilities.join(', ') || 'none'}`)
      lines.push(
        `- Config flags: ${source.configOptions.map((option) => `\`${option.flag}\` (${option.type}${option.required ? ', required' : ''}${option.docs ? `, ${option.docs}` : ''}${option.default !== undefined ? `, default ${json(option.default)}` : ''})`).join(', ') || 'none'}`,
        '',
      )
    }
  }
  if (description.actions.length > 0) {
    lines.push('## Actions', '')
    for (const action of description.actions) {
      lines.push(`### ${action.id}`, '', action.docs)
      lines.push(
        '',
        `- Profile: ${action.profile.id}@${action.profile.version}`,
        `- Effect: ${action.effect}`,
      )
      lines.push('', '#### Input', '', ...formatInputMarkdown(action.input), '')
      lines.push(`- Output: ${action.output.id}@${action.output.version}`)
      lines.push(
        `- Adapter bindings: ${action.adapters.map((adapter) => `${adapter.id}@${adapter.version}`).join(', ') || 'none'}`,
        '',
        '#### Examples',
        '',
        '```json',
        prettyJson(action.examples),
        '```',
        '',
      )
    }
  }
  return lines.join('\n').trimEnd()
}

export function formatExtensions(
  registry: {
    list(): readonly {
      id: string
      version: number
      profiles: readonly { id: string; version: number }[]
      adapters: readonly { id: string; version: number }[]
      docs?: { readonly summary: string }
    }[]
  },
  jsonOutput: boolean,
): string {
  const extensions = [...registry.list()]
    .sort(compareReferences)
    .map((extension) => ({
      id: extension.id,
      version: extension.version,
      ...(extension.docs?.summary === undefined
        ? {}
        : { summary: extension.docs.summary }),
      profiles: [...extension.profiles]
        .sort(compareReferences)
        .map(({ id, version }) => ({ id, version })),
      adapters: [...extension.adapters]
        .sort(compareReferences)
        .map(({ id, version }) => ({ id, version })),
    }))
  if (jsonOutput) return JSON.stringify(extensions, null, 2)
  return extensions
    .map(
      (extension) =>
        `${extension.id}@${extension.version}${extension.summary ? `\t${extension.summary}` : ''}\tProfiles: ${extension.profiles.map((item) => `${item.id}@${item.version}`).join(', ') || 'none'}\tAdapters: ${extension.adapters.map((item) => `${item.id}@${item.version}`).join(', ') || 'none'}`,
    )
    .join('\n')
}
