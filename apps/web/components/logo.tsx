import type { CSSProperties } from 'react'

export type LogoTone = 'adaptive' | 'monochrome'

type LogoStyle = CSSProperties & {
  '--ctx-logo-leading'?: string
  '--ctx-logo-trailing'?: string
  '--ctx-logo-record'?: string
  '--ctx-logo-record-muted'?: string
  '--ctx-logo-signal'?: string
}

const monochromeStyle: LogoStyle = {
  '--ctx-logo-leading': 'currentColor',
  '--ctx-logo-trailing': 'currentColor',
  '--ctx-logo-record': 'currentColor',
  '--ctx-logo-record-muted': 'currentColor',
  '--ctx-logo-signal': 'currentColor',
}

export function Logo({
  size = 24,
  priority: _priority = false,
  label = 'ctxindex',
  tone = 'adaptive',
}: {
  size?: number
  priority?: boolean
  label?: string | null
  tone?: LogoTone
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
      style={tone === 'monochrome' ? monochromeStyle : undefined}
    >
      <path
        d="M49 18H35Q18 18 18 35V47"
        fill="none"
        stroke="var(--ctx-logo-leading)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 68Q18 82 35 82H65Q82 82 82 65V50"
        fill="none"
        stroke="var(--ctx-logo-trailing)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="82" cy="18" r="6.5" fill="var(--ctx-logo-signal)" />
      <rect
        x="39"
        y="43"
        width="22"
        height="6"
        rx="3"
        fill="var(--ctx-logo-record)"
      />
      <rect
        x="39"
        y="53"
        width="16"
        height="6"
        rx="3"
        fill="var(--ctx-logo-record-muted)"
      />
    </svg>
  )
}
