export interface GrantAddedOutput {
  readonly grantId: string
  readonly provider: string
  readonly scopes: readonly string[]
}

export function formatGrantAdded(result: GrantAddedOutput): string {
  return [
    `auth grant added: ${result.grantId}`,
    `provider: ${result.provider}`,
    `scopes: ${result.scopes.join(', ') || 'none'}`,
  ].join('\n')
}
