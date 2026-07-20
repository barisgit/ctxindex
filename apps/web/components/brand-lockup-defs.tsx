import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Inlines the official lockup path data once per document from
 * public/brand/ctxindex-lockup-sprite.svg (the canonical source of truth)
 * so BrandLockup can reference local <use href="#lockup-*"> fragments,
 * which inherit the --ctx-logo-* theme variables. External file <use>
 * would not inherit CSS custom properties.
 */
const sprite = readFileSync(
  join(process.cwd(), 'public/brand/ctxindex-lockup-sprite.svg'),
  'utf8',
)

export function BrandLockupDefs() {
  return (
    <span
      hidden
      aria-hidden
      // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time inline of a repo-owned SVG asset
      dangerouslySetInnerHTML={{ __html: sprite }}
    />
  )
}
