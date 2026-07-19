---
name: ctxindex
description: A quiet context frame with one indexed signal.
---

# ctxindex design

## Overview

**Status:** evolving
**Last reviewed:** 2026-07-19
**Implementation token source:** `apps/web/app/global.css`
**Executable specimen:** `apps/web/app/(home)/design/page.tsx` (`/design`)

**Creative north star:** A precision instrument that opens a calm frame around scattered context and marks one useful result.

ctxindex should feel exact, quiet, and capable. It is infrastructure for people and agents working with personal context, not an artificial-intelligence spectacle, social product, or generic data warehouse. The visual system should be comfortable beside a terminal and credible in documentation without turning the whole brand into terminal cosplay.

The default strategy is **restrained**: tinted neutral structure and one rare amber signal. Light and dark themes are equally intentional; dark is the initial website preference, not the definition of the brand.

**Key characteristics:**

- Quiet structure with clear information hierarchy
- Mechanical precision without industrial harshness
- One meaningful signal rather than decorative color
- Rounded geometry used to frame context, not soften every surface
- Dense enough for technical work, spacious enough for comprehension

## Ownership

This file owns project-wide visual doctrine. It does not own domain vocabulary, product behavior, or architecture; those remain in `CONTEXT.md`, OpenSpec capability specs, and `SYSTEM.md`.

`apps/web/app/global.css` owns the exact implemented web token values and semantic control utilities. Fumadocs' dynamic `fd-*` variables are the integration layer; app-owned Tailwind markup consumes the semantic color aliases mapped from them, such as `text-text-primary` and `bg-background-primary`. Pages consume those color, font, type-scale, tracking, radius, and interaction roles rather than selecting raw values. `/design` is an executable specimen using the same theme and components as the app, so drift is visible rather than hidden behind a parallel showcase. There is intentionally no independent `DESIGN.html`.

App-specific implementation belongs under its app. Shared runtime code belongs in a workspace package only after more than one consumer creates a real reuse boundary. Root-level Markdown is appropriate for repository-wide doctrine; reusable application code should not be placed loose at the repository root.

## Logo

The primary mark is a detached rounded context frame containing two left-aligned record bars and one amber index dot.

- The pale upper-left frame and quieter lower-right frame remain visibly detached.
- The amber dot center aligns with both the top and right frame axes.
- The two record bars share a left edge while their combined group remains optically centered.
- The master geometry uses a `100 × 100` view box and must remain editable SVG.
- Theme variants may remap neutral colors but must preserve geometry and the amber signal role.
- The official wordmark is lowercase `ctxindex` set in Geist 540, converted to outlines; lockups never use live text or create a font dependency. The wordmark's `i` dot uses the theme's signal color, so colored lockups intentionally carry two amber dots — the mark's index signal and the wordmark i-dot.
- Horizontal and stacked lockups are separate locked compositions (`apps/web/public/brand/ctxindex-lockup-*.svg`), rendered in-app through `BrandLockup` from one shared sprite; do not re-set or re-space the wordmark.
- Usage hierarchy: horizontal lockup for navigation, footers, and inline references; stacked lockup for hero and square placements; mark alone for favicons, app icons, and anything under 24px lockup height; monochrome (one ink, gaps preserved) for constrained or single-color surfaces.
- Monochrome variants may collapse all colors to one ink while preserving the gaps.
- Favicons may use the same geometry while being rasterized and inspected at native size; do not add detail to compensate for scale.

**Minimum target sizes:** 16px favicon, 20px navigation, 32px application mark, 56px landing-page mark.

**Never:** reconnect the detached frame, add a stem beneath the amber dot, turn the inner records into a database cylinder, place the dot off the right-frame axis, add gradients, shadows, or letterforms to the mark.

Canonical assets live under `apps/web/public/brand/`; the public `/brand` page owns their presentation, downloads, and usage guidance. Explorations are working evidence, not production assets.

## Color

Color follows semantic roles rather than a swatch collection.

- **Canvas:** the quiet page field; almost neutral with a slight slate relationship to the logo frame.
- **Surface:** cards, navigation, code, and raised regions; separated primarily by lightness.
- **Frame:** borders and inactive structure; visible without becoming outlines around everything.
- **Primary ink:** headings and essential content.
- **Muted ink:** supporting content that still meets body-text contrast requirements.
- **Index signal:** amber, reserved for the logo dot, primary action, current selection, focus, and truly meaningful highlights.
- **Status colors:** success, warning, critical, and information retain their conventional meaning and must not be replaced with brand amber when that would create ambiguity.

Amber should account for no more than roughly ten percent of visual attention on ordinary pages. Do not introduce a second warm accent such as coral, gold, or yellow merely for variety. Do not use gray text on colored surfaces; derive readable text from the surface hue or use the designated foreground.

Dark mode uses lighter surfaces for elevation rather than broad shadows. Light mode uses a white canvas with cool recessed surfaces rather than the generic white-card-on-gray-page stack, cream, paper, or beige.

## Typography

- **Interface and prose:** the current web implementation uses Inter. It is approved for this iteration, not a permanent identity decision.
- **Commands and data:** JetBrains Mono is reserved for CLI commands, code, identifiers, refs, and machine output.
- Body copy should remain within `65–75ch` and use comfortable line height.
- Display tracking must not be tighter than `-0.04em`; ordinary headings should stay near `-0.02em`.
- Use sentence case by default. Uppercase labels are reserved for genuine compact metadata, never repeated as decorative section eyebrows.
- Headings should wrap deliberately; long technical terms must be tested on narrow screens.

## Shape and spacing

- Use a small radius scale: approximately 6px for controls, 10–12px for ordinary grouped surfaces, and 14–16px only for major containers.
- Full pills are limited to tags, status chips, and compact controls that benefit from the shape.
- Use one-pixel hairlines for structural boundaries. Focus indicators must remain visually distinct from borders.
- Spacing should follow a clear rhythm and vary by information relationship rather than applying one gap everywhere.
- The detached-frame motif may appear sparingly in signature brand moments; it is not a generic card decoration.

## Surfaces and elevation

- Prefer flat surfaces, lightness steps, and clear grouping over decorative shadows.
- In dark mode, higher surfaces become slightly lighter.
- In light mode, a small shadow may support an actual floating layer, but a border and broad soft shadow must not be combined as decoration.
- Navigation, documentation, and terminal surfaces should feel related without becoming identical panels.
- Avoid nested cards and repeated grids of identical icon-heading-copy tiles when another information structure is clearer.

## Components and patterns

### Primary action

- Uses the interactive primary token, not the brighter decorative logo signal when contrast differs.
- Appears once per decision group.
- Includes an explicit focus state and does not rely on color alone for disabled or pending states.

### Links and current selection

- Amber may identify the current route or an important inline link.
- Hover must change more than saturation alone when the link is not conventionally underlined.
- Documentation navigation should remain quieter than marketing actions.

### Terminal and code

- Commands, output, and prompts use the mono family and preserve horizontal scrolling where wrapping would corrupt meaning.
- Amber identifies prompts, cursor, or selected data—not every token.
- Syntax color must serve parsing and maintain contrast; it is not a second brand palette.

### Documentation

- Prioritize reading measure, navigation orientation, and stable anchors.
- Callouts use semantic state treatment, full boundaries or surface tint, and a leading label or icon. Never use a thick colored side stripe.
- Tables and code blocks must remain usable in both themes and on narrow screens.

## Motion

- Motion explains arrival, selection, expansion, or progress; it is not ambient decoration.
- Use short ease-out transitions for controls and restrained entrance choreography for one dominant landing-page moment.
- Do not animate layout properties when transform, opacity, clipping, or color can communicate the same change.
- Every animation requires a `prefers-reduced-motion` treatment. Content must be visible before animation enhancement.

## Accessibility

- Body text must meet WCAG AA `4.5:1`; large text and essential UI graphics must meet `3:1`.
- Focus remains keyboard-visible in both themes.
- Color is never the sole state indicator.
- Interactive targets should be at least 44 CSS pixels where touch use is plausible.
- The logo has an accessible name only when it is the sole representation of ctxindex; otherwise adjacent visible text names the brand.

## Do and don't

### Do

- Do use one amber signal to focus attention.
- Do test every visual decision at 16px, 24px, ordinary desktop width, and narrow mobile width.
- Do prefer real command output, real documentation structure, and real product artifacts over decorative illustration.
- Do keep light and dark themes related without mechanically inverting them.
- Do update this file when a design decision changes project-wide doctrine.

### Don't

- Don't add coral, duplicate yellows, or an olive neutral ramp to make the palette feel broader.
- Don't use generic knowledge graphs, database cylinders, orbital imagery, or AI gradients as the identity.
- Don't use gradient text, glassmorphism, decorative two-axis page grids, or oversized blurred shadows.
- Don't reconnect the logo frame or add an amber stem beneath its dot.
- Don't create an app-specific `DESIGN.md` unless that app intentionally departs from this system.

## Implementation map

- `DESIGN.md` — project-wide doctrine and decisions
- `apps/web/app/global.css` — exact light/dark web tokens and shared styling
- `apps/web/app/(home)/design/page.tsx` — live visual specimen
- `apps/web/components/logo.tsx` — adaptive mark implementation
- `apps/web/components/brand-lockup.tsx` — official outlined lockup component (horizontal, stacked, descriptor, monochrome)
- `apps/web/components/brand-lockup-defs.tsx` — inlines the canonical lockup sprite once per document
- `apps/web/app/(home)/brand/page.tsx` — public `/brand` asset and usage page
- `apps/web/public/brand/` — canonical distributable logo assets
- `apps/web/app/icon.svg` and `apps/web/app/apple-icon.png` — application icons

When another application needs the same executable tokens or components, extract a focused workspace package under `packages/`. Do not create a package in anticipation of a second consumer.
