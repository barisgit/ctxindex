import { renderMermaidSVG } from 'beautiful-mermaid'
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock'

export function Mermaid({ chart }: { chart: string }) {
  try {
    const svg = renderMermaidSVG(chart, {
      bg: 'var(--color-fd-background)',
      fg: 'var(--color-fd-foreground)',
      line: 'var(--color-fd-muted-foreground)',
      accent: 'var(--color-fd-primary)',
      muted: 'var(--color-fd-muted-foreground)',
      surface: 'var(--color-fd-card)',
      border: 'var(--color-fd-border)',
      font: 'inherit',
      transparent: true,
    })

    return (
      <div
        role="img"
        aria-label="Documentation diagram"
        className="my-6 overflow-x-auto rounded-xl border bg-fd-card p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:w-full [&_svg]:min-w-[42rem]"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: generated at build time from repository-owned Mermaid source
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  } catch {
    return (
      <CodeBlock allowCopy={false}>
        <Pre>{chart}</Pre>
      </CodeBlock>
    )
  }
}
