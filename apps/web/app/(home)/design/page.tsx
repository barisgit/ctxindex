import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { BrandLockup } from '@/components/brand-lockup'
import { Logo } from '@/components/logo'

export const metadata: Metadata = {
  title: 'Design system',
  description: 'The executable ctxindex visual-system specimen.',
  robots: { index: false, follow: false },
}

const colorRoles = [
  { label: 'Canvas', token: '--color-background-primary' },
  { label: 'Surface', token: '--color-background-secondary' },
  { label: 'Frame', token: '--color-border-default' },
  { label: 'Ink', token: '--color-text-primary' },
  { label: 'Muted ink', token: '--color-text-secondary' },
  { label: 'Index signal', token: '--ctx-signal' },
]

const logoSizes = [16, 24, 32, 56, 96]

function Swatch({ label, token }: { label: string; token: string }) {
  return (
    <div className="min-w-0">
      <div
        className="h-14 rounded-lg border border-border-default"
        style={{ backgroundColor: `var(${token})` } as CSSProperties}
      />
      <p className="mt-2 text-xs font-medium">{label}</p>
      <code className="block truncate text-[10px] text-text-secondary">
        {token}
      </code>
    </div>
  )
}

function ThemeSpecimen({
  theme,
  title,
}: {
  theme: 'light' | 'dark'
  title: string
}) {
  return (
    <article
      className={`ctx-theme-${theme} overflow-hidden rounded-2xl border border-border-default bg-background-primary text-text-primary`}
    >
      <header className="flex items-center justify-between border-b border-border-default px-6 py-5">
        <div className="flex items-center gap-3">
          <Logo size={36} label={null} />
          <div>
            <h2 className="font-semibold tracking-[-0.02em]">{title}</h2>
            <p className="text-xs text-text-secondary">
              Semantic tokens in context
            </p>
          </div>
        </div>
        <span className="rounded-full bg-background-muted px-3 py-1 text-xs font-medium text-text-secondary">
          {theme}
        </span>
      </header>

      <div className="space-y-8 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {colorRoles.map((role) => (
            <Swatch key={role.token} {...role} />
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">One decision group</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="ctx-button ctx-button-primary">
              Get started
            </button>
            <button type="button" className="ctx-button ctx-button-secondary">
              Read the docs
            </button>
            <a
              href="#type"
              className="ctx-inline-link inline-flex min-h-11 items-center text-sm"
            >
              Inline link
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-border-default bg-background-secondary p-5">
          <p className="font-semibold">Context remains structured</p>
          <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-text-secondary">
            Realms separate contexts, Sources bind providers, and stable Refs
            let agents retrieve the right resource without another integration
            layer.
          </p>
          <code className="mt-4 block overflow-x-auto rounded-lg bg-background-muted px-4 py-3 font-mono text-xs text-text-primary">
            ctxindex search &quot;invoice acme&quot; --realm company --json
          </code>
        </div>
      </div>
    </article>
  )
}

function LockupSpecimen({
  theme,
  title,
}: {
  theme: 'light' | 'dark'
  title: string
}) {
  return (
    <article
      className={`ctx-theme-${theme} rounded-ctx-panel border border-border-default bg-background-primary p-7 text-text-primary`}
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold tracking-ctx-heading">{title}</h3>
        <code className="text-[10px] text-text-secondary">{theme}</code>
      </div>
      <div className="mt-8 space-y-9">
        <div>
          <p className="mb-4 text-xs text-text-secondary">Navigation</p>
          <BrandLockup variant="navigation" />
        </div>
        <div>
          <p className="mb-4 text-xs text-text-secondary">Standard</p>
          <BrandLockup variant="standard" />
        </div>
        <div>
          <p className="mb-4 text-xs text-text-secondary">Display</p>
          <BrandLockup variant="display" />
        </div>
        <div>
          <p className="mb-4 text-xs text-text-secondary">With descriptor</p>
          <BrandLockup
            variant="standard"
            tagline="One deterministic interface to the context you already have."
          />
        </div>
        <div>
          <p className="mb-4 text-xs text-text-secondary">Stacked</p>
          <BrandLockup orientation="stacked" variant="navigation" />
        </div>
        <div>
          <p className="mb-4 text-xs text-text-secondary">Monochrome</p>
          <BrandLockup variant="standard" tone="monochrome" />
        </div>
      </div>
    </article>
  )
}

export default function DesignPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-16 md:py-24">
      <header className="max-w-3xl">
        <div className="mb-5 flex items-center gap-3">
          <Logo size={48} priority />
          <span className="rounded-full border border-border-default bg-background-secondary px-3 py-1 text-xs font-medium text-text-secondary">
            Evolving
          </span>
        </div>
        <h1 className="text-ctx-display font-bold tracking-ctx-display">
          A quiet frame. One indexed signal.
        </h1>
        <p className="mt-5 max-w-[65ch] text-lg leading-relaxed text-text-secondary">
          This page is the executable specimen for the current ctxindex visual
          system. It intentionally uses the same tokens and components as the
          product so implementation drift remains visible.
        </p>
        <p className="mt-3 font-mono text-xs text-text-secondary">
          Doctrine: DESIGN.md · Tokens: apps/web/app/global.css
        </p>
      </header>

      <section className="mt-16 grid gap-6 xl:grid-cols-2">
        <ThemeSpecimen theme="light" title="Light instrument" />
        <ThemeSpecimen theme="dark" title="Dark instrument" />
      </section>

      <section className="mt-20 border-t border-border-default pt-14">
        <h2 className="text-ctx-section font-bold tracking-ctx-heading">
          Brand lockups
        </h2>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-text-secondary">
          The official lockup pairs the mark with the outlined Geist 540
          wordmark — path data, no font dependency — and carries two intentional
          amber dots: the mark’s index signal and the wordmark’s i-dot.
          Horizontal, stacked, descriptor, and monochrome compositions all come
          from one reusable component backed by the canonical SVG assets on the{' '}
          <a href="/brand" className="ctx-inline-link">
            brand page
          </a>
          .
        </p>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <LockupSpecimen theme="light" title="On light" />
          <LockupSpecimen theme="dark" title="On dark" />
        </div>
      </section>

      <section id="type" className="mt-20 border-t border-border-default pt-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <h2 className="text-ctx-section font-bold tracking-ctx-heading">
              Typography
            </h2>
            <p className="mt-3 max-w-[55ch] text-sm leading-relaxed text-text-secondary">
              Interface prose stays direct and readable. Monospace appears only
              when the content is genuinely executable or machine-shaped.
            </p>
          </div>
          <div className="space-y-8">
            <div>
              <p className="text-ctx-display font-bold tracking-ctx-display">
                Retrieve what matters.
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                Display / bold / −0.03em
              </p>
            </div>
            <div>
              <p className="text-ctx-section font-semibold tracking-ctx-heading">
                One coherent access model
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                Section heading / semibold / −0.02em
              </p>
            </div>
            <div>
              <p className="max-w-[68ch] leading-7 text-text-secondary">
                ctxindex provides deterministic access to mail, calendars, and
                files while providers remain canonical. The interface should
                make that precision feel ordinary rather than theatrical.
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                Body / regular / readable measure
              </p>
            </div>
            <code className="block overflow-x-auto rounded-xl border border-border-default bg-background-secondary p-5 font-mono text-sm">
              ctxindex get ctx://realm/source/resource --json
            </code>
          </div>
        </div>
      </section>

      <section className="mt-20 border-t border-border-default pt-14">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <h2 className="text-ctx-section font-bold tracking-ctx-heading">
              Logo scale
            </h2>
            <p className="mt-3 text-sm text-text-secondary">
              One geometry from favicon through landing-page use.
            </p>
          </div>
          <a
            href="/brand/ctxindex-mark-symbolic.svg"
            className="text-sm font-semibold text-text-accent hover:underline"
          >
            Open symbolic SVG →
          </a>
        </div>
        <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-8 rounded-2xl border border-border-default bg-background-secondary p-8">
          {logoSizes.map((size) => (
            <div key={size} className="flex flex-col items-center gap-3">
              <Logo size={size} label={size === 96 ? 'ctxindex' : null} />
              <code className="text-xs text-text-secondary">{size}px</code>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20 border-t border-border-default pt-14">
        <h2 className="text-ctx-section font-bold tracking-ctx-heading">
          Asset set
        </h2>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-text-secondary">
          Theme, monochrome, and symbolic SVGs are available with transparent
          PNG exports from 16px through 512px.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          {[
            ['Light theme', '/brand/ctxindex-mark-light-theme.svg'],
            ['Dark theme', '/brand/ctxindex-mark-dark-theme.svg'],
            ['Monochrome dark', '/brand/ctxindex-mark-monochrome-dark.svg'],
            ['Monochrome light', '/brand/ctxindex-mark-monochrome-light.svg'],
            ['Symbolic', '/brand/ctxindex-mark-symbolic.svg'],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg border border-border-default bg-background-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background-accent"
            >
              {label}
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}
