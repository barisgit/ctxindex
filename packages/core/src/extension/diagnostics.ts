import { DefinitionRegistryError } from '../registry'

const hostDiagnostics = new WeakMap<Error, string>()

const fixedRegistryDiagnostics = new Set([
  'Embedded definition docs are not supported',
  'Invalid OAuth2 Provider definition',
  'Invalid Extension definition',
  'Invalid Provider definition',
  'Invalid Profile definition',
  'Invalid Adapter definition',
  'Invalid OAuth App definition',
  'OAuth App label must not be blank',
  'Routing federated requires capability search-remote',
  'Routing hybrid requires capabilities sync and search-remote',
  'Capability sync requires operation sync',
  'Capability search-remote requires operation searchRemote',
  'Capability retrieve requires operation retrieve',
  'Capability download requires operation download',
  'Operation sync requires capability sync',
  'Operation searchRemote requires capability search-remote',
  'Operation retrieve requires capability retrieve',
  'Operation download requires capability download',
])

function safeRegistryDiagnostic(cause: DefinitionRegistryError): string {
  if (fixedRegistryDiagnostics.has(cause.message)) return cause.message
  if (cause.message.startsWith('Invalid OAuth App config for Provider '))
    return 'Invalid OAuth App config'
  if (cause.message.startsWith('Conflicting Extension '))
    return 'Conflicting Extension definition'
  if (cause.message.startsWith('Conflicting '))
    return 'Conflicting Extension dependency definition'
  if (cause.message.startsWith('Duplicate OAuth App '))
    return 'Duplicate OAuth App'
  if (cause.message.startsWith('Duplicate Extension '))
    return 'Duplicate Extension definition'
  if (cause.message.startsWith('Duplicate Profile '))
    return 'Duplicate Profile definition'
  if (cause.message.startsWith('Invalid Profile definition:'))
    return 'Invalid Profile definition'
  if (
    cause.message.startsWith('Provider ') ||
    cause.message.startsWith('Providerless Adapter ')
  )
    return 'Invalid Provider access configuration'
  if (cause.message.startsWith('Adapter '))
    return 'Invalid Adapter capability configuration'
  if (
    cause.message.startsWith('Action ') ||
    cause.message.startsWith('Undeclared Action ')
  )
    return 'Invalid Action binding'
  return cause.code === 'duplicate_definition'
    ? 'Extension definition conflict'
    : 'Extension definition validation failed'
}

export function createExtensionHostDiagnostic(
  message: string,
  properties: Readonly<Record<string, unknown>> = {},
): Error {
  const error = Object.assign(new TypeError(message), properties)
  error.name = 'ExtensionHostDiagnosticError'
  hostDiagnostics.set(error, message)
  return error
}

export function isExtensionHostDiagnostic(cause: unknown): cause is Error {
  return cause instanceof Error && hostDiagnostics.has(cause)
}

export function safeExtensionDiagnostic(
  cause: unknown,
  fallback: string,
): string {
  if (isExtensionHostDiagnostic(cause))
    return hostDiagnostics.get(cause) as string
  if (cause instanceof DefinitionRegistryError)
    return safeRegistryDiagnostic(cause)
  return fallback
}
