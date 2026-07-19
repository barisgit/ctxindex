import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { baseOptions } from '@/lib/layout.shared'
import { source } from '@/lib/source'

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      containerProps={{
        className: 'ctx-docs-layout',
        style: {
          gridTemplate: `"sidebar . header toc ."
            "sidebar . toc-popover toc ."
            "sidebar . main toc ." 1fr /
            var(--fd-sidebar-col) minmax(0, 1fr) minmax(0, 860px)
            var(--fd-toc-width) minmax(0, 1fr)`,
        },
      }}
      {...baseOptions()}
    >
      {children}
    </DocsLayout>
  )
}
