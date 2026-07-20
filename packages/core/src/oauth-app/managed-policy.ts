import type { CompleteRegistry, DefinitionProvenance } from '../registry'

export type ManagedOAuthAppDistribution = {
  readonly kind: 'bundled'
  readonly packageName: string
}

export interface ManagedOAuthAppPolicy {
  readonly providerId: string
  readonly label: string
  readonly extensionId: string
  readonly distributions: readonly ManagedOAuthAppDistribution[]
}

export type ManagedOAuthAppResolution =
  | {
      readonly status: 'selected'
      readonly providerId: string
      readonly label: string
    }
  | {
      readonly status: 'unavailable'
      readonly providerId: string
      readonly reason: 'not_configured' | 'not_active' | 'provenance_mismatch'
    }
  | {
      readonly status: 'invalid_policy'
      readonly providerId: string
      readonly reason: 'ambiguous'
    }

function oauthAppKey(providerId: string, label: string): string {
  return JSON.stringify([providerId, label])
}

function matchesDistribution(
  provenance: DefinitionProvenance,
  distribution: ManagedOAuthAppDistribution,
): boolean {
  return (
    provenance.origin === 'builtin' &&
    provenance.packageName === distribution.packageName
  )
}

export function resolveManagedOAuthApp(
  registry: CompleteRegistry,
  policies: readonly ManagedOAuthAppPolicy[],
  providerId: string,
): ManagedOAuthAppResolution {
  const matchingPolicies = policies.filter(
    (policy) => policy.providerId === providerId,
  )
  if (matchingPolicies.length === 0) {
    return { status: 'unavailable', providerId, reason: 'not_configured' }
  }
  if (matchingPolicies.length !== 1) {
    return { status: 'invalid_policy', providerId, reason: 'ambiguous' }
  }

  const policy = matchingPolicies[0] as ManagedOAuthAppPolicy
  const key = oauthAppKey(policy.providerId, policy.label)
  if (!registry.oauthApps.has(key)) {
    return { status: 'unavailable', providerId, reason: 'not_active' }
  }

  const owner = registry.extensions.get(policy.extensionId)
  const activeApp = registry.oauthApps.get(key)
  const ownerContainsApp = owner?.oauthApps.some((app) => app === activeApp)
  if (!ownerContainsApp) {
    return { status: 'unavailable', providerId, reason: 'provenance_mismatch' }
  }

  const appProvenances = registry.provenances.get(`oauth-app:${key}`) ?? []
  const ownerProvenances =
    registry.provenances.get(`extension:${policy.extensionId}`) ?? []
  const provenanceMatches = policy.distributions.some((distribution) =>
    appProvenances.some(
      (appProvenance) =>
        matchesDistribution(appProvenance, distribution) &&
        ownerProvenances.some(
          (ownerProvenance) =>
            matchesDistribution(ownerProvenance, distribution) &&
            ownerProvenance.entry === appProvenance.entry &&
            ownerProvenance.exportName === appProvenance.exportName,
        ),
    ),
  )
  if (!provenanceMatches) {
    return { status: 'unavailable', providerId, reason: 'provenance_mismatch' }
  }

  return { status: 'selected', providerId, label: policy.label }
}
