import { cn } from 'cnfast'
import { codeToHtml } from 'shiki'

export async function CodeHighlight({
  code,
  lang,
  className,
}: {
  code: string
  lang: 'sh' | 'ts' | 'json'
  className?: string
}) {
  const html = await codeToHtml(code, {
    lang,
    theme: 'vesper',
  })
  return (
    <div
      className={cn(
        'overflow-x-auto font-mono text-xs leading-6 sm:text-[0.8125rem]',
        '[&_pre]:!bg-transparent [&_code]:!bg-transparent',
        className,
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output generated at build time from local string constants
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
