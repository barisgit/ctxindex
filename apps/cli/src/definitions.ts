import { CTXINDEX_BUILTIN_EXTENSIONS } from '@ctxindex/adapters'
import { type CtxindexConfig, getEnv, readConfig } from '@ctxindex/core/config'
import {
  type LoadExtensionsResult,
  loadExtensions,
} from '@ctxindex/core/extension'
import {
  describeRegistry,
  type RegistryDescription,
} from '@ctxindex/core/registry'

export interface CliDefinitions extends LoadExtensionsResult {
  readonly config: CtxindexConfig
  readonly description: RegistryDescription
}

export async function loadCliDefinitions(): Promise<CliDefinitions> {
  const config = await readConfig()
  const loaded = await loadExtensions({
    config,
    builtins: CTXINDEX_BUILTIN_EXTENSIONS,
  })
  return { ...loaded, config, description: describeRegistry(loaded.registry) }
}

export function printExtensionDiagnostics(
  diagnostics: CliDefinitions['diagnostics'],
): void {
  for (const diagnostic of diagnostics) {
    const message = redactExtensionDiagnostic(diagnostic.message)
    console.error(`Extension ${diagnostic.path}: ${message}`)
  }
}

export function redactExtensionDiagnostic(
  message: string,
  canary = getEnv().CTXINDEX_LOG_CANARY_TOKEN,
): string {
  let redacted = message
    .replace(
      /(\bAuthorization["']?\s*[:=]\s*)(?:"Bearer\s+[^"]*"|'Bearer\s+[^']*'|Bearer\s+\S+|\S+)/gi,
      '$1[Redacted]',
    )
    .replace(
      /(\b(?:access[-_]?token|refresh[-_]?token|client[-_]?secret|password|api[-_]?key)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
      '$1[Redacted]',
    )
    .replace(/(\bBearer\s+)\S+/gi, '$1[Redacted]')
  if (canary) redacted = redacted.replaceAll(canary, '[Redacted]')
  return redacted
}
