import type { RegistryDescription } from '@ctxindex/core/registry'

import type { RegistryView } from './registry-projection'
import {
  json,
  prettyJson,
  record,
  schemaConstraints,
  schemaType,
  unrenderedSchema,
} from './registry-schema'

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
