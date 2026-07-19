import type { ReactNode } from 'react'

interface LegalDocumentProps {
  readonly title: string
  readonly summary: string
  readonly lastUpdated: string
  readonly children: ReactNode
}

export function LegalDocument({
  title,
  summary,
  lastUpdated,
  children,
}: LegalDocumentProps) {
  return (
    <main className="flex flex-1 flex-col">
      <article className="mx-auto w-full max-w-3xl px-6 py-16 md:py-24">
        <header className="border-b border-border-default pb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-text-accent">
            Legal
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-ctx-heading md:text-5xl">
            {title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-text-secondary">
            {summary}
          </p>
          <p className="mt-4 text-sm text-text-secondary">
            Last updated: {lastUpdated}
          </p>
        </header>
        <div className="legal-document mt-10 space-y-10">{children}</div>
      </article>
    </main>
  )
}

export function LegalSection({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-ctx-heading">{title}</h2>
      <div className="mt-4 space-y-4 leading-7 text-text-secondary">
        {children}
      </div>
    </section>
  )
}
