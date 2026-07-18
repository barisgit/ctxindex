import { isIP } from 'node:net'
import { isAbsolute } from 'node:path'

function invalid(message: string): never {
  throw Object.assign(new TypeError(message), { code: 'invalid_args' })
}

function forbiddenIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number)
  const first = octets[0] ?? -1
  const second = octets[1] ?? -1
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  )
}

function forbiddenIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('::ffff:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    /^fe[c-f]/.test(normalized) ||
    normalized.startsWith('ff')
  )
}

export function validateCatalogRepository(repository: string): string {
  if (isAbsolute(repository)) return repository

  let url: URL
  try {
    url = new URL(repository)
  } catch {
    return invalid(
      'Catalog repository must be public HTTPS or an absolute local path',
    )
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return invalid('Catalog remote repository must be credential-free HTTPS')
  }
  const hostname = url.hostname
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.$/, '')
    .toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    (isIP(hostname) === 4 && forbiddenIpv4(hostname)) ||
    (isIP(hostname) === 6 && forbiddenIpv6(hostname))
  ) {
    return invalid('Catalog remote repository host is not public')
  }
  return repository
}

export function validateCatalogRef(ref: string): string {
  if (/^[0-9a-fA-F]{40,64}$/.test(ref)) return ref.toLowerCase()
  if (/^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)) {
    const components = ref.split('/')
    if (
      ref.includes('..') ||
      ref.endsWith('/') ||
      ref.includes('//') ||
      components.some(
        (component) =>
          component === '.' ||
          component.startsWith('.') ||
          component.endsWith('.') ||
          component.endsWith('.lock'),
      )
    ) {
      return invalid('Catalog ref is not a valid full branch or tag ref')
    }
    return ref
  }
  return invalid('Catalog ref must be a full branch/tag ref or exact object ID')
}
