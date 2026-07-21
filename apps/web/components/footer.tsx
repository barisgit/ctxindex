import Link from 'next/link'
import { BrandLockup } from '@/components/brand-lockup'
import { gitConfig } from '@/lib/shared'

const groups = [
  {
    title: 'Start',
    links: [
      { href: '/docs/start', label: 'First result' },
      { href: '/docs/start/connect-provider', label: 'Connect a provider' },
      { href: '/docs/start/agent-usage', label: 'Agent usage' },
    ],
  },
  {
    title: 'Build',
    links: [
      { href: '/docs/use', label: 'Use ctxindex' },
      { href: '/docs/extend', label: 'Extension SDK' },
      { href: '/docs/reference', label: 'Reference' },
    ],
  },
  {
    title: 'Project',
    links: [
      {
        href: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
        label: 'GitHub',
      },
      { href: '/docs/contribute', label: 'Contribute' },
      { href: '/brand', label: 'Brand assets' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-border-default">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 md:flex-row md:justify-between">
        <div className="flex flex-col gap-3">
          <BrandLockup variant="navigation" />
          <p className="max-w-xs text-sm text-text-secondary">
            Local personal-context gateway for agents. Providers stay canonical;
            you stay in control.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-3 text-sm font-semibold">{g.title}</h3>
              <ul className="space-y-2">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="inline-flex min-h-11 items-center text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-fd-ring)]"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}
