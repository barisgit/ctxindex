import {
  compareReferences,
  type RegistryDescription,
} from '@ctxindex/core/registry'

function json(value: unknown): string {
  return JSON.stringify(value)
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
): unknown {
  if (!selector) return description
  return selector === 'profile'
    ? description.kinds
    : selector === 'adapter'
      ? description.sources
      : description.actions
}

export function formatRegistryText(description: RegistryDescription): string {
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
    lines.push(`  auth: ${json(source.auth)}`)
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
    lines.push(`  input: ${json(action.input)}`)
    lines.push(`  output: ${action.output.id}@${action.output.version}`)
    lines.push(
      `  adapters: ${action.adapters.map((adapter) => `${adapter.id}@${adapter.version}`).join(', ') || 'none'}`,
    )
    lines.push(`  examples: ${json(action.examples)}`)
  }
  return lines.join('\n')
}

export function formatRegistryMarkdown(
  description: RegistryDescription,
): string {
  const lines = ['# ctxindex Registry', '']
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
  lines.push('## Adapters', '')
  for (const source of description.sources) {
    lines.push(`### ${source.id}@${source.version}`, '', source.summary ?? '')
    lines.push(
      '',
      `- Profiles: ${source.profiles.map((profile) => `${profile.id}@${profile.version}`).join(', ') || 'none'}`,
    )
    lines.push(
      `- Routing: ${source.routing}`,
      `- Auth: \`${json(source.auth)}\``,
    )
    lines.push(`- Capabilities: ${source.capabilities.join(', ') || 'none'}`)
    lines.push(`- Config schema: \`${json(source.config)}\``)
    lines.push(
      `- Config flags: ${source.configOptions.map((option) => `\`${option.flag}\` (${option.type}${option.required ? ', required' : ''}${option.docs ? `, ${option.docs}` : ''}${option.default !== undefined ? `, default ${json(option.default)}` : ''})`).join(', ') || 'none'}`,
      '',
    )
  }
  lines.push('## Actions', '')
  for (const action of description.actions) {
    lines.push(`### ${action.id}`, '', action.docs)
    lines.push(
      '',
      `- Profile: ${action.profile.id}@${action.profile.version}`,
      `- Effect: ${action.effect}`,
    )
    lines.push(
      `- Input: \`${json(action.input)}\``,
      `- Output: ${action.output.id}@${action.output.version}`,
    )
    lines.push(
      `- Adapter bindings: ${action.adapters.map((adapter) => `${adapter.id}@${adapter.version}`).join(', ') || 'none'}`,
      `- Examples: \`${json(action.examples)}\``,
      '',
    )
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
