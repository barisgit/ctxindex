import type { Metadata } from 'next'
import { BrandLockup } from '@/components/brand-lockup'
import { Logo } from '@/components/logo'

export const metadata: Metadata = {
  title: 'Brand',
  description:
    'Official ctxindex mark and lockup assets with usage guidance and downloads.',
}

const lockupDownloads = [
  {
    title: 'Horizontal lockup',
    items: [
      ['Dark theme SVG', '/brand/ctxindex-lockup-horizontal-dark-theme.svg'],
      ['Light theme SVG', '/brand/ctxindex-lockup-horizontal-light-theme.svg'],
      [
        'Monochrome dark SVG',
        '/brand/ctxindex-lockup-horizontal-monochrome-dark.svg',
      ],
      [
        'Monochrome light SVG',
        '/brand/ctxindex-lockup-horizontal-monochrome-light.svg',
      ],
      [
        'PNG 512w (dark)',
        '/brand/png/ctxindex-lockup-horizontal-dark-theme-512.png',
      ],
      [
        'PNG 1024w (dark)',
        '/brand/png/ctxindex-lockup-horizontal-dark-theme-1024.png',
      ],
    ],
  },
  {
    title: 'Stacked lockup',
    items: [
      ['Dark theme SVG', '/brand/ctxindex-lockup-stacked-dark-theme.svg'],
      ['Light theme SVG', '/brand/ctxindex-lockup-stacked-light-theme.svg'],
      [
        'Monochrome dark SVG',
        '/brand/ctxindex-lockup-stacked-monochrome-dark.svg',
      ],
      [
        'Monochrome light SVG',
        '/brand/ctxindex-lockup-stacked-monochrome-light.svg',
      ],
      [
        'PNG 512w (dark)',
        '/brand/png/ctxindex-lockup-stacked-dark-theme-512.png',
      ],
      [
        'PNG 1024w (dark)',
        '/brand/png/ctxindex-lockup-stacked-dark-theme-1024.png',
      ],
    ],
  },
  {
    title: 'Mark only',
    items: [
      ['Dark theme SVG', '/brand/ctxindex-mark-dark-theme.svg'],
      ['Light theme SVG', '/brand/ctxindex-mark-light-theme.svg'],
      ['Monochrome dark SVG', '/brand/ctxindex-mark-monochrome-dark.svg'],
      ['Monochrome light SVG', '/brand/ctxindex-mark-monochrome-light.svg'],
      ['PNG 256 (dark)', '/brand/png/ctxindex-mark-dark-theme-256.png'],
      ['PNG 512 (dark)', '/brand/png/ctxindex-mark-dark-theme-512.png'],
    ],
  },
]

const donts = [
  'Don’t recolor, move, or remove either amber dot in colored lockups.',
  'Don’t retype the wordmark in a live font; use the outlined assets.',
  'Don’t reconnect the detached frame or alter mark geometry.',
  'Don’t place colored lockups on low-contrast or busy backgrounds; use monochrome.',
  'Don’t add gradients, shadows, outlines, or effects to any asset.',
  'Don’t use the horizontal lockup below 24px height; switch to the mark alone.',
]

function LockupPanel({
  theme,
  children,
  caption,
}: {
  theme: 'light' | 'dark'
  children: React.ReactNode
  caption: string
}) {
  return (
    <figure className="min-w-0">
      <div
        className={`ctx-theme-${theme} flex items-center justify-center rounded-ctx-surface border border-border-default bg-background-primary px-6 py-10 text-text-primary`}
      >
        {children}
      </div>
      <figcaption className="mt-2 text-xs text-text-secondary">
        {caption}
      </figcaption>
    </figure>
  )
}

export default function BrandPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16 md:py-24">
      <header className="max-w-3xl">
        <h1 className="text-ctx-display font-bold tracking-ctx-display">
          Brand assets
        </h1>
        <p className="mt-5 max-w-[65ch] text-lg leading-relaxed text-text-secondary">
          The official ctxindex mark and lockups, ready to download. The
          wordmark is outlined Geist — no font required — and colored lockups
          intentionally carry two amber dots: the mark’s index signal and the
          wordmark’s i-dot.
        </p>
      </header>

      <section className="mt-14">
        <h2 className="text-ctx-section font-bold tracking-ctx-heading">
          The mark
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <LockupPanel theme="dark" caption="Mark · dark theme">
            <Logo size={96} label={null} />
          </LockupPanel>
          <LockupPanel theme="light" caption="Mark · light theme">
            <Logo size={96} label={null} />
          </LockupPanel>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-ctx-section font-bold tracking-ctx-heading">
          Horizontal lockup
        </h2>
        <p className="mt-2 max-w-[65ch] text-sm text-text-secondary">
          The default composition for navigation, footers, and inline brand
          references.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <LockupPanel theme="dark" caption="Horizontal · dark theme">
            <BrandLockup variant="standard" label={null} />
          </LockupPanel>
          <LockupPanel theme="light" caption="Horizontal · light theme">
            <BrandLockup variant="standard" label={null} />
          </LockupPanel>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-ctx-section font-bold tracking-ctx-heading">
          Stacked lockup
        </h2>
        <p className="mt-2 max-w-[65ch] text-sm text-text-secondary">
          For hero moments, splash surfaces, and square placements.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <LockupPanel theme="dark" caption="Stacked · dark theme">
            <BrandLockup
              orientation="stacked"
              variant="navigation"
              label={null}
            />
          </LockupPanel>
          <LockupPanel theme="light" caption="Stacked · light theme">
            <BrandLockup
              orientation="stacked"
              variant="navigation"
              label={null}
            />
          </LockupPanel>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-ctx-section font-bold tracking-ctx-heading">
          Monochrome
        </h2>
        <p className="mt-2 max-w-[65ch] text-sm text-text-secondary">
          One-ink fallback for embossing, print, and constrained surfaces. It
          inherits the current text color.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <LockupPanel theme="dark" caption="Monochrome on dark">
            <BrandLockup variant="standard" tone="monochrome" label={null} />
          </LockupPanel>
          <LockupPanel theme="light" caption="Monochrome on light">
            <BrandLockup variant="standard" tone="monochrome" label={null} />
          </LockupPanel>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-ctx-section font-bold tracking-ctx-heading">
          Downloads
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          {lockupDownloads.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold">{group.title}</h3>
              <ul className="mt-3 space-y-2">
                {group.items.map(([label, href]) => (
                  <li key={href}>
                    <a
                      href={href}
                      download
                      className="text-sm text-text-secondary transition-colors hover:text-text-accent"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-ctx-section font-bold tracking-ctx-heading">
            Usage
          </h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-text-secondary">
            <li>
              Minimum sizes: horizontal lockup 24px tall, stacked lockup 64px
              tall, mark alone 16px.
            </li>
            <li>
              Clear space: keep at least the mark’s dot-to-frame gap (one
              quarter of the mark height) free on all sides.
            </li>
            <li>
              Use theme-matched assets; the monochrome set is the only treatment
              that may take arbitrary single colors.
            </li>
            <li>
              Mark-only contexts — favicons, app icons, tiny UI — stay
              mark-only.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-ctx-section font-bold tracking-ctx-heading">
            Don’t
          </h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-text-secondary">
            {donts.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}
