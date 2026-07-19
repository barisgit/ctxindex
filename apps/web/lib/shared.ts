export const appName = 'ctxindex'
export const docsRoute = '/docs'
export const docsImageRoute = '/og/docs'
export const docsContentRoute = '/llms.mdx/docs'

export const gitConfig = {
  user: 'barisgit',
  repo: 'ctxindex',
  branch: 'main',
}

export function resolveSiteOrigin(
  configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL,
): URL | undefined {
  if (!configuredOrigin) return undefined

  const origin = new URL(configuredOrigin)
  origin.pathname = '/'
  origin.search = ''
  origin.hash = ''
  return origin
}

export function pageMetadataUrls(
  pagePath: string,
  imagePath?: string,
  configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL,
): { canonical: string; image?: string } | undefined {
  const origin = resolveSiteOrigin(configuredOrigin)
  if (!origin) return undefined
  return {
    canonical: new URL(pagePath, origin).href,
    ...(imagePath ? { image: new URL(imagePath, origin).href } : {}),
  }
}

export function docsSourceUrl(pagePath: string): string {
  return `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/web/content/docs/${pagePath}`
}

export function pageSlugForRepresentation(
  slug: readonly string[] | undefined,
  fileName: 'content.md' | 'image.png',
): string[] | undefined {
  if (!slug || slug.at(-1) !== fileName) return undefined
  return slug.slice(0, -1)
}

export function plainTextResponse(body: BodyInit): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
