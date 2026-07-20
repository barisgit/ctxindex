import Link from 'next/link'
import { BrandLockup } from '@/components/brand-lockup'
import { gitConfig } from '@/lib/shared'

const groups = [
  {
    title: 'Docs',
    links: [
      { href: '/docs', label: 'Overview' },
      { href: '/docs/getting-started', label: 'Getting started' },
      { href: '/docs/cli', label: 'CLI reference' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { href: '/docs/concepts/realms-and-sources', label: 'Concepts' },
      { href: '/docs/guides/agent-integration', label: 'Agent integration' },
      { href: '/docs/examples', label: 'Examples' },
    ],
  },
  {
    title: 'Project',
    links: [
      {
        href: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
        label: 'GitHub',
      },
      { href: '/docs/examples/marketplace', label: 'Marketplace' },
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
                      className="text-sm text-text-secondary transition-colors hover:text-text-primary"
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
