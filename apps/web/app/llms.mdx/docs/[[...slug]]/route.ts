import { notFound } from 'next/navigation'
import { pageSlugForRepresentation } from '@/lib/shared'
import { getLLMText, getPageMarkdownUrl, source } from '@/lib/source'

export const revalidate = false

export async function GET(
  _req: Request,
  { params }: RouteContext<'/llms.mdx/docs/[[...slug]]'>,
) {
  const { slug } = await params
  const pageSlug = pageSlugForRepresentation(slug, 'content.md')
  if (!pageSlug) notFound()
  const page = source.getPage(pageSlug)
  if (!page) notFound()

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown',
    },
  })
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    slug: getPageMarkdownUrl(page).segments,
  }))
}
