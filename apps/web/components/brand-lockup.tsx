import type { CSSProperties } from 'react'

export type LockupTone = 'adaptive' | 'monochrome'
export type LockupOrientation = 'horizontal' | 'stacked'

/**
 * Official Geist 540 outlined lockup (variant D): canonical mark plus
 * path-only wordmark with amber i-dot. Path data lives once in
 * public/brand/ctxindex-lockup-sprite.svg, inlined once per document by
 * BrandLockupDefs; colors resolve from the --ctx-logo-* theme variables,
 * so the lockup adapts inside the root theme and forced
 * .ctx-theme-light/.ctx-theme-dark scopes without flashing or duplicating
 * geometry per render.
 */

const viewBoxes = {
  horizontal: { width: 1004, height: 203 },
  stacked: { width: 768, height: 429 },
} as const

const variants = {
  navigation: { height: 26 },
  standard: { height: 40 },
  display: { height: 64 },
} as const

const monochromeStyle: CSSProperties = {
  '--ctx-logo-leading': 'currentColor',
  '--ctx-logo-trailing': 'currentColor',
  '--ctx-logo-record': 'currentColor',
  '--ctx-logo-record-muted': 'currentColor',
  '--ctx-logo-signal': 'currentColor',
} as CSSProperties

export function BrandLockup({
  variant = 'navigation',
  orientation = 'horizontal',
  tone = 'adaptive',
  label = 'ctxindex',
  tagline,
  className,
}: {
  variant?: keyof typeof variants
  orientation?: LockupOrientation
  tone?: LockupTone
  label?: string | null
  tagline?: string
  className?: string
}) {
  const box = viewBoxes[orientation]
  const height =
    orientation === 'stacked'
      ? variants[variant].height * 2.4
      : variants[variant].height
  const width = (height * box.width) / box.height

  return (
    <span
      className={[
        'inline-flex',
        orientation === 'stacked' ? 'flex-col items-center' : 'flex-col',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <svg
        viewBox={`0 0 ${box.width} ${box.height}`}
        width={width}
        height={height}
        role={label ? 'img' : undefined}
        aria-label={label ?? undefined}
        aria-hidden={label ? undefined : true}
        className="shrink-0"
        style={tone === 'monochrome' ? monochromeStyle : undefined}
      >
        <use href={`#lockup-${orientation}`} />
      </svg>
      {tagline ? (
        <span
          className={[
            'mt-2 max-w-[36ch] text-sm leading-relaxed text-text-secondary',
            orientation === 'stacked' ? 'text-center' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {tagline}
        </span>
      ) : null}
    </span>
  )
}
