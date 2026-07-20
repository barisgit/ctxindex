import { isAbsolute, resolve } from 'node:path'

export type DirectExtensionSourceKind = 'npm' | 'git' | 'local'

export type DirectExtensionTarget =
  | {
      readonly kind: 'npm'
      readonly requestedTarget: string
    }
  | {
      readonly kind: 'git'
      readonly requestedTarget: string
    }
  | {
      readonly kind: 'local'
      readonly requestedTarget: string
      readonly originPath: string
    }

export interface ParseDirectExtensionTargetOptions {
  readonly cwd: string
  readonly validatePackageTarget: (kind: 'npm' | 'git', target: string) => void
}

export function validateDirectExtensionId(id: string): string {
  if (
    id.length === 0 ||
    id.length > 128 ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id)
  ) {
    invalid('Invalid direct Extension id')
  }
  return id
}

function invalid(message: string, cause?: unknown): never {
  throw Object.assign(
    new TypeError(message, cause === undefined ? undefined : { cause }),
    { code: 'extension_target_invalid', exitCode: 2 },
  )
}

function containsEmbeddedCredentials(target: string): boolean {
  const scpUser = /^([^/@\s]+)@[^/\s]+:/.exec(target)?.[1]
  if (scpUser !== undefined) return scpUser !== 'git'
  if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) return false
  try {
    const parsed = new URL(target.replace(/^git\+/, ''))
    if (parsed.protocol === 'ssh:') {
      return (
        parsed.password.length > 0 ||
        (parsed.username.length > 0 && parsed.username !== 'git')
      )
    }
    return parsed.username.length > 0 || parsed.password.length > 0
  } catch {
    return false
  }
}

const npmPackageTargetPattern =
  /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)(?:@[^\s]+)?$/i

export function validateDirectPackageTarget(
  kind: 'npm' | 'git',
  target: string,
): void {
  if (kind === 'npm') {
    if (!npmPackageTargetPattern.test(target)) {
      throw new TypeError('Invalid npm package target')
    }
    const packageSeparator =
      target[0] === '@' ? target.indexOf('@', 1) : target.indexOf('@')
    const spec =
      packageSeparator === -1 ? undefined : target.slice(packageSeparator + 1)
    if (
      spec !== undefined &&
      (/^(?:\.?\.?\/|\/|file:|git(?:\+|:)|https?:|ssh:|github:|gitlab:|bitbucket:)/i.test(
        spec,
      ) ||
        /^[a-z0-9_.-]+\/[a-z0-9_.-]+(?:#[^\s]+)?$/i.test(spec) ||
        /^[^/@\s]+@[a-z0-9.-]+:[^\s]+$/i.test(spec) ||
        /^(?!npm:)[a-z0-9.-]+:[^\s]+$/i.test(spec) ||
        spec.length === 0)
    ) {
      throw new TypeError('Invalid npm package target')
    }
    return
  }
  const normalized = target.replace(/^git\+/, '')
  if (/^file:\/\//i.test(normalized)) {
    const parsed = new URL(normalized)
    if (parsed.hostname.length > 0 || !parsed.pathname.startsWith('/')) {
      throw new TypeError('Invalid Git package target')
    }
    return
  }
  if (/^(?:https?|ssh|git):\/\//i.test(normalized)) {
    const parsed = new URL(normalized)
    if (parsed.hostname.length === 0 || parsed.pathname === '/') {
      throw new TypeError('Invalid Git package target')
    }
    return
  }
  if (
    /^(?:github|gitlab|bitbucket):[a-z0-9_.-]+\/[a-z0-9_.-]+(?:#[^\s]+)?$/i.test(
      target,
    ) ||
    /^[a-z0-9_.-]+\/[a-z0-9_.-]+(?:#[^\s]+)?$/i.test(target) ||
    /^[a-z0-9_.-]+@[a-z0-9.-]+:[^\s]+$/i.test(target)
  ) {
    return
  }
  throw new TypeError('Invalid Git package target')
}

export function parseDirectExtensionTarget(
  kind: DirectExtensionSourceKind,
  target: string,
  options: ParseDirectExtensionTargetOptions,
): DirectExtensionTarget {
  if (
    target.length === 0 ||
    target.includes('\0') ||
    target.trim() !== target
  ) {
    invalid(`Invalid ${kind} Extension target`)
  }
  if (containsEmbeddedCredentials(target)) {
    invalid(`${kind} Extension target must not contain credentials`)
  }
  if (kind === 'local') {
    const originPath = resolve(options.cwd, target)
    return {
      kind,
      requestedTarget: isAbsolute(target) ? resolve(target) : originPath,
      originPath,
    }
  }
  try {
    options.validatePackageTarget(kind, target)
  } catch (cause) {
    invalid(`Invalid ${kind} Extension target`, cause)
  }
  return { kind, requestedTarget: target }
}

export function sanitizeDirectExtensionTarget(
  target: DirectExtensionTarget,
): Readonly<{ kind: DirectExtensionSourceKind; requestedTarget: string }> {
  return { kind: target.kind, requestedTarget: target.requestedTarget }
}
