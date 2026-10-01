import { cn } from 'cnfast'
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'

export async function CodeHighlight({
  code,
  lang,
  className,
}: {
  code: string
  lang: 'sh' | 'ts' | 'json'
  className?: string
}) {
  return (
    <ServerCodeBlock
      code={code}
      lang={lang}
      codeblock={{
        allowCopy: false,
        className: 'my-0',
        viewportProps: {
          className: cn(
            'max-h-none overflow-x-auto font-mono text-xs leading-6 sm:text-[0.8125rem]',
            className,
          ),
        },
      }}
    />
  )
}
