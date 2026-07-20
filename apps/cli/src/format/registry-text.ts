import type {
  RegistryDescription,
  SourceDescription,
} from '@ctxindex/core/registry'

import type { RegistryView } from './registry-projection'
import {
  json,
  record,
  schemaConstraints,
  schemaType,
  unrenderedSchema,
} from './registry-schema'

function formatObjectInputText(
  schema: Record<string, unknown>,
  indent = '    ',
): string[] {
  const properties = record(schema.properties)
  if (schema.type !== 'object' || !properties)
    return [
      `${indent}<${schemaType(schema)}>`,
      ...schemaConstraints(schema).map((part) => `${indent}  ${part}`),
    ]
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
  )
  const lines: string[] = []
  if (typeof schema.title === 'string')
    lines.push(`${indent}title: ${schema.title}`)
  if (typeof schema.description === 'string')
    lines.push(`${indent}${schema.description}`)
  for (const [name, value] of Object.entries(properties)) {
    const property = record(value)
    if (!property) {
      lines.push(
        `${indent}${name} <unknown>${required.has(name) ? ' required' : ''}`,
        `${indent}  schema fragment: ${json(value)}`,
      )
      continue
    }
    lines.push(
      `${indent}${name} <${schemaType(property)}>${required.has(name) ? ' required' : ''}`,
    )
    lines.push(
      ...schemaConstraints(property).map((part) => `${indent}  ${part}`),
    )
    const remainder = unrenderedSchema(property)
    if (remainder) lines.push(`${indent}  schema fragment: ${json(remainder)}`)
  }
  if (schema.additionalProperties === false)
    lines.push(`${indent}additional properties: not allowed`)
  else if (schema.additionalProperties === true)
    lines.push(`${indent}additional properties: allowed`)
  else if (record(schema.additionalProperties))
    lines.push(
      `${indent}additional properties: <${schemaType(record(schema.additionalProperties) as Record<string, unknown>)}>`,
    )
  const remainder = unrenderedSchema(schema, [
    'properties',
    'required',
    'additionalProperties',
  ])
  if (remainder) lines.push(`${indent}schema fragment: ${json(remainder)}`)
  return lines
}

function formatInputText(input: object): string[] {
  const schema = record(input)
  if (!schema) return [`    schema: ${json(input)}`]
  const alternatives = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : undefined
  if (!alternatives) return formatObjectInputText(schema)
  return alternatives.flatMap((value, index) => {
    const alternative = record(value)
    return alternative
      ? [
          `    branch ${index + 1}:`,
          ...formatObjectInputText(alternative, '      '),
        ]
      : [`    branch ${index + 1}: schema ${json(value)}`]
  })
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function formatProviderText(source: SourceDescription): string[] {
  if (!source.provider) return ['  provider: none']
  const auth = record(source.provider.auth)
  const lines = [`  provider: ${source.provider.id}`]
  if (auth && typeof auth.kind === 'string') lines.push(`  auth: ${auth.kind}`)
  if (auth && typeof auth.authorizationUrl === 'string')
    lines.push(`    authorization URL: ${auth.authorizationUrl}`)
  if (auth && typeof auth.tokenUrl === 'string')
    lines.push(`    token URL: ${auth.tokenUrl}`)
  const authHosts = stringValues(auth?.allowedHosts)
  if (authHosts.length > 0)
    lines.push(`    auth hosts: ${authHosts.join(', ')}`)
  const baseScopes = stringValues(auth?.baseScopes)
  if (baseScopes.length > 0)
    lines.push(`    provider base scopes: ${baseScopes.join(', ')}`)
  const registration = record(auth?.registration)
  const environment = record(registration?.environment)
  if (environment) {
    const values = Object.entries(environment)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      )
      .map(([field, name]) => `${field}=${name}`)
    if (values.length > 0) lines.push(`    environment: ${values.join(', ')}`)
  }
  if (source.access)
    lines.push(`    Adapter scopes: ${source.access.scopes.join(', ')}`)
  if (source.providerApiHosts.length > 0)
    lines.push(`  provider API hosts: ${source.providerApiHosts.join(', ')}`)
  return lines
}

function formatCompactRegistryText(description: RegistryDescription): string {
  const lines: string[] = []
  if (description.kinds.length > 0) {
    lines.push(`PROFILES (${description.kinds.length})`)
    for (const kind of description.kinds)
      lines.push(`  ${kind.id}@${kind.version}`)
  }
  if (description.sources.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`ADAPTERS (${description.sources.length})`)
    for (const source of description.sources) lines.push(`  ${source.id}`)
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
    for (const field of kind.fields)
      lines.push(`  field ${field.name} <${field.type}>`)
    for (const format of kind.formats)
      lines.push(`  format ${format.name} (${format.mediaType})`)
  }
  for (const source of description.sources) {
    lines.push(`ADAPTER ${source.id}`)
    lines.push(`  routing: ${source.routing}`)
    lines.push(...formatProviderText(source))
    lines.push(`  capabilities: ${source.capabilities.join(', ') || 'none'}`)
    for (const option of source.configOptions)
      lines.push(
        `  ${option.flag} <${option.type}>${option.required ? ' required' : ''}${option.default !== undefined ? ` - default: ${json(option.default)}` : ''}`,
      )
  }
  for (const action of description.actions) {
    lines.push(
      `ACTION ${action.id} (${action.profile.id}@${action.profile.version}, ${action.effect})`,
    )
    lines.push('  input:', ...formatInputText(action.input))
    lines.push(`  output: ${action.output.id}@${action.output.version}`)
    lines.push(
      `  adapters: ${action.adapters.map((adapter) => adapter.id).join(', ') || 'none'}`,
    )
  }
  return lines.join('\n')
}
