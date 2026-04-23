---
version: alpha
name: Paper, Fern, Amber
description: >-
  Editorial-clean palette for a podcast-triage reading app. Warm paper
  neutrals, emerald interactive chrome, amber brand accent, vermilion
  for destructive intent. Information-dense, typographically driven,
  restrained motion.
colors:
  # Chrome — light
  background: "#FCFDFC"
  foreground: "#0D120F"
  card: "#FFFFFF"
  card-foreground: "#0D120F"
  popover: "#FFFFFF"
  popover-foreground: "#0D120F"
  secondary: "#F4F6F5"
  secondary-foreground: "#19241F"
  muted: "#F4F6F5"
  muted-foreground: "#6E7C75"
  accent: "#F4F6F5"
  accent-foreground: "#19241F"
  border: "#E3E8E6"
  input: "#E3E8E6"
  # Invariant: `ring` must always match `primary` below. The design-token
  # schema does not support cross-references, so the value is duplicated
  # here — update both in lockstep or focus rings will diverge from the
  # CTA color they're supposed to telegraph.
  ring: "#167E5B"

  # Primary — emerald (interactive chrome, CTAs)
  primary: "#167E5B"
  primary-foreground: "#F9FBFA"

  # Brand — amber (logo tile, marketing accent ONLY, never a CTA)
  # Values are the asset-baked literals used by the logo SVGs and PWA icon
  # generator; the CSS variable resolves to essentially the same amber at
  # runtime, but these exact hexes are what ships in rendered bitmaps.
  brand: "#F59E0B"
  brand-foreground: "#1A1407"

  # Destructive — warm vermilion (not cool red)
  destructive: "#E24D28"
  destructive-foreground: "#FAFAFA"

  # Worth-It score ramp — emerald → fern → chartreuse → amber → vermilion
  score-exceptional: "#148F66"
  score-exceptional-text: "#0F6B4C"
  score-exceptional-foreground: "#FFFFFF"
  score-above: "#2EB877"
  score-above-text: "#147145"
  score-above-foreground: "#FFFFFF"
  score-average: "#99CB4D"
  score-average-text: "#435922"
  score-average-foreground: "#273414"
  score-below: "#F59E0B"
  score-below-text: "#814B0E"
  score-below-foreground: "#372006"
  score-skip: "#E24D28"
  score-skip-text: "#A23216"
  score-skip-foreground: "#FFFFFF"

  # Status (subtle tint + strong text + quiet border)
  status-success-bg: "#DEF7EB"
  status-success-text: "#0F6B4C"
  status-success-border: "#ABE3C9"
  status-warning-bg: "#FDF0D8"
  status-warning-text: "#814B0E"
  status-warning-border: "#F4D39A"
  status-info-bg: "#E6F0EB"
  status-info-text: "#147152"
  status-info-border: "#B9D5C7"
  status-danger-bg: "#FBE5E0"
  status-danger-text: "#A23216"
  status-danger-border: "#F0B7A8"
  status-neutral-bg: "#EBEFED"
  status-neutral-text: "#5B6761"
  status-neutral-border: "#C7D1CC"

  # Chrome — dark (system-aware; every light-mode surface has a dark twin)
  background-dark: "#0D120F"
  foreground-dark: "#F4F6F5"
  card-dark: "#0D120F"
  card-foreground-dark: "#F4F6F5"
  popover-dark: "#0D120F"
  popover-foreground-dark: "#F4F6F5"
  secondary-dark: "#1C2621"
  secondary-foreground-dark: "#F4F6F5"
  muted-dark: "#1C2621"
  muted-foreground-dark: "#9EA9A3"
  accent-dark: "#1C2621"
  accent-foreground-dark: "#F4F6F5"
  border-dark: "#1C2621"
  input-dark: "#1C2621"
  # Same invariant as `ring` in light mode: `ring-dark` must always match
  # `primary-dark`. Update both together.
  ring-dark: "#31C489"
  primary-dark: "#31C489"
  primary-foreground-dark: "#082118"
  brand-dark: "#F6A61E"
  brand-foreground-dark: "#1A1407"
  destructive-dark: "#9B3E27"
  destructive-foreground-dark: "#FAFAFA"

  # Worth-It score ramp — dark twins (derived from runtime HSL in the
  # shipped dark theme; lifted tints for forest-ink surfaces). Each tier
  # also carries a `-foreground-dark` twin so generators that consume this
  # frontmatter as the source of truth can reproduce badge text colors
  # without falling back to the light-mode values — `score-below` in
  # particular shifts to #2E1B05 in dark mode (vs #372006 in light).
  score-exceptional-dark: "#19B37F"
  score-exceptional-text-dark: "#81E4B6"
  score-exceptional-foreground-dark: "#FFFFFF"
  score-above-dark: "#33CC85"
  score-above-text-dark: "#8DE2BA"
  score-above-foreground-dark: "#FFFFFF"
  score-average-dark: "#99CB4D"
  score-average-text-dark: "#BFDF90"
  score-average-foreground-dark: "#273414"
  score-below-dark: "#F6A61E"
  score-below-text-dark: "#F9C976"
  score-below-foreground-dark: "#2E1B05"
  score-skip-dark: "#E35835"
  score-skip-text-dark: "#EE9781"
  score-skip-foreground-dark: "#FFFFFF"

  # Status palette — dark twins (derived from runtime HSL)
  status-success-bg-dark: "#0B3D2C"
  status-success-text-dark: "#7CDEB1"
  status-success-border-dark: "#1F5C47"
  status-warning-bg-dark: "#493003"
  status-warning-text-dark: "#F9C56C"
  status-warning-border-dark: "#714F14"
  status-info-bg-dark: "#1D2B24"
  status-info-text-dark: "#7CDEB7"
  status-info-border-dark: "#255642"
  status-danger-bg-dark: "#411A10"
  status-danger-text-dark: "#ED9078"
  status-danger-border-dark: "#6A2A1B"
  status-neutral-bg-dark: "#212C26"
  status-neutral-text-dark: "#98A49E"
  status-neutral-border-dark: "#3A4A42"

typography:
  display-hero:
    fontFamily: Inter
    fontSize: 60px
    fontWeight: 700
    lineHeight: 60px
    letterSpacing: -0.025em
  display-hero-compact:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 700
    lineHeight: 40px
    letterSpacing: -0.025em
  h1:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: 700
    lineHeight: 36px
    letterSpacing: -0.025em
  h2:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.015em
  h3:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
  lead:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-strong:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
  muted:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  small:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  small-strong:
    # Same 12/16 geometry as `small` but at 600 weight — matches the
    # shipped Badge primitive which applies `font-semibold` by default.
    # Score badges and any other element using the Badge base should
    # point here instead of `small` so generators produce the shipped
    # text weight.
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
  label:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 14px
  button-label:
    # Button text uses the same 14/500 cut as form labels but with body
    # leading (20px, = Tailwind `text-sm`) so the label sits on the
    # correct visual baseline inside the 36px button height — the tight
    # 14px `label` leading is reserved for form labels that pair directly
    # above an input.
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  eyebrow:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.06em
    textTransform: uppercase
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px

rounded:
  # These correspond to the Tailwind `rounded-{sm,md,lg,xl,full}` utilities
  # as configured in the codebase. Tailwind provides a built-in default
  # radius for the bare `rounded` utility (0.25rem), but this system does
  # not override it and intentionally does not use the bare shorthand —
  # always reach for a named size below.
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px

spacing:
  unit: 4px
  gap-inline: 8px
  gap-group: 12px
  card-padding: 16px
  card-padding-lg: 24px
  container-padding: 24px
  section-gap: 32px
  section-margin: 48px
  page-max-width: 1200px

elevation:
  none: none
  sm: "0 1px 2px 0 rgba(0,0,0,0.05)"
  DEFAULT: "0 1px 3px 0 rgba(0,0,0,0.10), 0 1px 2px -1px rgba(0,0,0,0.10)"
  md: "0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10)"
  lg: "0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10)"

motion:
  duration-instant: 80ms
  duration-fast: 150ms
  duration-base: 200ms
  duration-slow: 300ms
  # `prefers-reduced-motion` uses 0.01ms (not 0ms) so browsers still fire
  # `animationend` / `transitionend` events — code that listens for those
  # events to clean up or advance state would otherwise hang silently
  # under reduced-motion. Matches the shipped @media block in globals.css.
  duration-reduced: 0.01ms
  easing-standard: cubic-bezier(0.2, 0, 0, 1)
  easing-emphasized: cubic-bezier(0.3, 0, 0, 1)

components:
  # Button shadows mirror the shipped CVA variants in src/components/ui/button.tsx:
  # the default (primary) variant carries Tailwind `shadow` (= elevation.DEFAULT)
  # for a slightly stronger CTA presence; destructive/outline/secondary use
  # Tailwind `shadow-sm` (= elevation.sm); ghost and link carry no shadow.
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button-label}"
    rounded: "{rounded.md}"
    height: 36px
    paddingTop: 8px
    paddingRight: 16px
    paddingBottom: 8px
    paddingLeft: 16px
    shadow: "{elevation.DEFAULT}"
  button-primary-hover:
    # Mirrors Tailwind `hover:bg-primary/90` — only the BACKGROUND fill
    # blends to 90% alpha of primary, the label and icon keep full opacity.
    # Do not use element `opacity: 0.9` (which dims label text too and
    # weakens contrast against primary). Generators should express this as
    # an alpha-composited fill over whatever surface the button sits on.
    backgroundColor: "{colors.primary}"
    backgroundColorOpacity: 0.9
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.button-label}"
    rounded: "{rounded.md}"
    height: 36px
    paddingTop: 8px
    paddingRight: 16px
    paddingBottom: 8px
    paddingLeft: 16px
    shadow: "{elevation.sm}"
  button-secondary-hover:
    # Mirrors Tailwind `hover:bg-secondary/80` — background alpha to 80%,
    # label color unchanged. Same semantics as button-primary-hover.
    backgroundColor: "{colors.secondary}"
    backgroundColorOpacity: 0.8
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    typography: "{typography.button-label}"
    rounded: "{rounded.md}"
    height: 36px
    paddingTop: 8px
    paddingRight: 16px
    paddingBottom: 8px
    paddingLeft: 16px
  button-ghost-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    typography: "{typography.button-label}"
    rounded: "{rounded.md}"
    height: 36px
    paddingTop: 8px
    paddingRight: 16px
    paddingBottom: 8px
    paddingLeft: 16px
    shadow: "{elevation.sm}"
  button-destructive-hover:
    # Mirrors Tailwind `hover:bg-destructive/90` — background alpha to 90%,
    # label color unchanged. Same semantics as button-primary-hover.
    backgroundColor: "{colors.destructive}"
    backgroundColorOpacity: 0.9
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.button-label}"
    rounded: "{rounded.md}"
    height: 36px
    paddingTop: 8px
    paddingRight: 16px
    paddingBottom: 8px
    paddingLeft: 16px
    borderWidth: 1px
    borderColor: "{colors.input}"
    shadow: "{elevation.sm}"
  button-outline-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  # The card root itself has no padding — padding is applied by the
  # card-header / card-content / card-footer sub-part tokens below, matching
  # the shipped Card primitive in src/components/ui/card.tsx where Header,
  # Content, and Footer each carry `p-6` (24px). Dense consumers (e.g. the
  # episode card) override Content to `p-4` (16px, = spacing.card-padding).
  # Shadow is Tailwind `shadow` (elevation.DEFAULT), not `shadow-sm` — the
  # Card root ships with the stronger default drop.
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    borderWidth: 1px
    borderColor: "{colors.border}"
    shadow: "{elevation.DEFAULT}"
  card-accent:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    borderWidth: 1px
    borderColor: "{colors.border}"
    shadow: "{elevation.DEFAULT}"
    borderLeftWidth: 2px
    borderLeftColor: "{colors.primary}"
  card-header:
    # Header carries the full `p-6` block on all four sides — written
    # per-edge for schema symmetry with card-content / card-footer below.
    paddingTop: "{spacing.card-padding-lg}"
    paddingRight: "{spacing.card-padding-lg}"
    paddingBottom: "{spacing.card-padding-lg}"
    paddingLeft: "{spacing.card-padding-lg}"
  card-content:
    # `p-6 pt-0` in the shipped primitive: 24px on sides and bottom, 0 on
    # top so the header and content flow without a doubled vertical gap.
    # Encoded as explicit per-edge values so generators don't collapse it
    # back to a uniform 24px inset.
    paddingTop: 0
    paddingRight: "{spacing.card-padding-lg}"
    paddingBottom: "{spacing.card-padding-lg}"
    paddingLeft: "{spacing.card-padding-lg}"
  card-footer:
    # Same `p-6 pt-0` treatment as card-content — the footer butts up
    # directly against the content block above with no added top inset.
    paddingTop: 0
    paddingRight: "{spacing.card-padding-lg}"
    paddingBottom: "{spacing.card-padding-lg}"
    paddingLeft: "{spacing.card-padding-lg}"
  input:
    # Matches the shipped Input primitive: transparent surface that inherits
    # the enclosing card/page background. The base typography is 16px
    # (body-lg / Tailwind text-base) so iOS Safari does not zoom on focus;
    # the shipped primitive drops to 14px (typography.body / text-sm) above
    # the md breakpoint, documented in the Inputs prose rather than encoded
    # here since design.md components have no media-query primitive.
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    height: 36px
    paddingTop: 4px
    paddingRight: 12px
    paddingBottom: 4px
    paddingLeft: 12px
    borderWidth: 1px
    borderColor: "{colors.input}"
    shadow: "{elevation.sm}"
  input-focus:
    backgroundColor: transparent
    ringColor: "{colors.ring}"
    ringWidth: 1px
    ringOffsetWidth: 0px
  badge-score-exceptional:
    backgroundColor: "{colors.score-exceptional}"
    textColor: "{colors.score-exceptional-foreground}"
    rounded: "{rounded.full}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small-strong}"
  badge-score-above:
    backgroundColor: "{colors.score-above}"
    textColor: "{colors.score-above-foreground}"
    rounded: "{rounded.full}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small-strong}"
  badge-score-average:
    backgroundColor: "{colors.score-average}"
    textColor: "{colors.score-average-foreground}"
    rounded: "{rounded.full}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small-strong}"
  badge-score-below:
    backgroundColor: "{colors.score-below}"
    textColor: "{colors.score-below-foreground}"
    rounded: "{rounded.full}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small-strong}"
  badge-score-skip:
    backgroundColor: "{colors.score-skip}"
    textColor: "{colors.score-skip-foreground}"
    rounded: "{rounded.full}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small-strong}"
  status-pill-success:
    backgroundColor: "{colors.status-success-bg}"
    textColor: "{colors.status-success-text}"
    rounded: "{rounded.md}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small-strong}"
  status-pill-warning:
    backgroundColor: "{colors.status-warning-bg}"
    textColor: "{colors.status-warning-text}"
    rounded: "{rounded.full}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small}"
  status-pill-info:
    backgroundColor: "{colors.status-info-bg}"
    textColor: "{colors.status-info-text}"
    rounded: "{rounded.full}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small}"
  status-pill-danger:
    backgroundColor: "{colors.status-danger-bg}"
    textColor: "{colors.status-danger-text}"
    rounded: "{rounded.full}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small}"
  status-pill-neutral:
    backgroundColor: "{colors.status-neutral-bg}"
    textColor: "{colors.status-neutral-text}"
    rounded: "{rounded.full}"
    paddingTop: 2px
    paddingRight: 10px
    paddingBottom: 2px
    paddingLeft: 10px
    typography: "{typography.small}"
  logo-tile:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-foreground}"
    rounded: 7px
    size: 32px
  focus-ring:
    backgroundColor: transparent
    textColor: "{colors.ring}"
    ringColor: "{colors.ring}"
    ringWidth: 1px
    ringOffsetWidth: 0px
---

## Overview

**Paper, Fern, Amber** is the visual identity of a podcast-triage tool for
busy professionals. It is editorial-clean: information-dense but well-organized,
with strong typographic hierarchy and generous whitespace. Content is the
decoration.

**Brand personality.** Smart. Efficient. Modern. The interface feels like a
sharp tool, not a toy. It respects the user's time and intelligence — no
ornamentation, no playful gimmicks, no unnecessary animation. Closer in spirit
to Linear, Readwise Reader, and Superhuman than to Spotify or Apple Podcasts.

**The warmth principle.** The system deliberately avoids cool greys and
clinical blues. Neutrals carry a whisper of green (paper with a fern-tinted
tooth); the primary interactive color is a deep emerald; the brand accent is
a confident amber; destructive actions land in a warm vermilion rather than a
cool red. The result reads as *inviting and collaborative* rather than
corporate or sterile — a reading room, not a dashboard.

**Two chromatic roles, never mixed.**
- **Primary (emerald)** is the interactive chrome: buttons, links, focus
  rings, selection highlights, filled icons at rest. It is the "touch this"
  color.
- **Brand (amber)** is the identity accent: the logo tile, rating stars, a
  single marketing accent per section. It is the "this is the product"
  color. **Never use amber for CTAs, form submits, or primary interactive
  affordances.** If everything is amber, the logo disappears.

## Colors

The palette is rooted in a warm paper neutral, a single primary, a single
brand accent, and a warm destructive. Every product surface uses a token;
raw Tailwind palette colors (`blue-600`, `yellow-400`, `zinc-*`, …) are
out-of-system.

### Neutrals — "paper, fern-tinted"

- **Background (#FCFDFC)** — near-white with a 150° green whisper (12% sat).
  Reads as paper, not as plastic. Dark mode drops to **#0D120F** — a deep
  forest ink, not pure black.
- **Foreground (#0D120F)** — near-black in the same hue family. Text never
  sits at `#000` against paper; the small bias back toward the background
  hue keeps the page calm.
- **Muted / secondary / accent surface (#F4F6F5)** — the quieter
  row-striping / card-backdrop tint. Used for hover states on ghost buttons
  and for list-row highlights.
- **Muted-foreground (#6E7C75)** — metadata, timestamps, de-emphasized
  copy. Measures ~4.3:1 against paper, narrowly below AA for normal
  text — reserve for secondary copy or large/bold text where 3:1 AA
  large-text applies.
- **Border (#E3E8E6)** — quiet and structural. Borders do the work of
  separating surfaces; shadows are a last resort.

### Primary — emerald (#167E5B)

The single color for interactive chrome. Used for:
- Primary buttons, submit actions, default toggle-on states.
- Links inside body copy (underline + emerald, not blue).
- The focus ring on all inputs and buttons.
- Filled icons that communicate completion ("summary ready", "saved").
- "Positive signal" checkmarks inside Worth-It detail rows.

Dark mode lifts to **#31C489** (lighter and a touch more saturated) so the
chrome stays legible against the forest-ink background.

### Brand — amber (#F59E0B)

The identity accent. Used for:
- The logo tile (amber square + ink glyph). The tile is the product's face;
  keep it at its specified amber, never tinted.
- Rating stars and user-supplied rating UI (fill + outline both at brand).
- A single marketing accent per section — a divider, a hero callout, never
  more than one per viewport.

Amber's foreground ink is a deep warm ink (**#1A1407**), not pure black —
matching the glyph color inside the logo SVG so bitmap favicons render
identically.

### Destructive — vermilion (#E24D28)

Warm and confident, not cool and alarming. Used sparingly for delete
confirmations, irreversible actions, and the "Skip" tier of the Worth-It
score. The tone says "this is a strong action," not "error, error."

### Worth-It score ramp (5 tiers)

A product-specific semantic ramp that walks the palette from emerald to
vermilion:

| Tier        | Score  | Bg hex    | Meaning          |
|-------------|--------|-----------|------------------|
| Exceptional | ≥ 8    | #148F66   | Listen now       |
| Above avg.  | 6–7.99 | #2EB877   | Worth the time   |
| Average     | 4–5.99 | #99CB4D   | Maybe, if time   |
| Below avg.  | 2–3.99 | #F59E0B   | Skim the summary |
| Skip        | < 2    | #E24D28   | Move on          |

Each tier has three paired tokens:
- `-bg` — the fill behind short badges / pills.
- `-foreground` — the text on that fill.
- `-text` — a darker accessible variant for inline score numbers that sit
  on the paper surface with no chip behind them (meets 4.5:1 against
  `#FCFDFC`).

The middle tier (average) leans chartreuse on purpose — the ramp must pass
through a yellow-green to feel continuous; a skipped average would make
the "above"/"below" steps feel categorical rather than graduated.

### Status palette

Used on banners, inline toasts, and admin surfaces. Every status has a
bg / text / border triplet:

- **Success** — `#DEF7EB` / `#0F6B4C` / `#ABE3C9`
- **Warning** — `#FDF0D8` / `#814B0E` / `#F4D39A`
- **Info** — `#E6F0EB` / `#147152` / `#B9D5C7`
- **Danger** — `#FBE5E0` / `#A23216` / `#F0B7A8`
- **Neutral** — `#EBEFED` / `#5B6761` / `#C7D1CC`

Status colors *never* replace primary or destructive for interactive
elements — they're read-only semantic framing for content, not chrome.

### Contrast targets

Measured ratios for the shipped light-mode pairings, against WCAG 2.1
SC 1.4.3 (AA) and SC 1.4.6 (AAA). AA requires 4.5:1 for normal text and
3:1 for large text (≥18pt regular or ≥14pt bold); AAA requires 7:1 and
4.5:1 respectively.

- **Body text on paper** — foreground on background, ~18.5:1.
  Exceeds AAA at every size.
- **Amber tile glyph** — brand-foreground on brand, ~8.5:1. Exceeds
  AAA for both normal and large text. The amber tile always carries
  dark ink and must never be tinted to a value that drops below
  4.5:1.
- **Muted-foreground on paper** — ~4.3:1. Narrowly misses AA for
  normal text; passes AA for large text. Reserve this token for
  metadata, timestamps, and secondary copy — never demote primary
  copy to `muted-foreground`. If a surface needs AA-compliant normal
  text in a de-emphasized tone, use `foreground` at a lower weight
  (500 instead of 400) while keeping the color at full opacity — that
  preserves contrast. Do **not** lower the opacity of `foreground` to
  fake de-emphasis: opacity compounds with the underlying surface
  alpha and can drop below 4.5:1 on anything other than pure paper
  (tinted cards, overlays). If a dedicated de-emphasis tone is needed
  at AA, add a new token whose measured contrast against the target
  surface is verified ≥4.5:1 rather than reaching for opacity.
- **Primary button label on emerald primary** — primary-foreground
  (`#F9FBFA`, HSL 150 20% 98%) on primary (`#167E5B`, HSL 160 70%
  29%), ~4.86:1. Passes WCAG 2.1 AA (SC 1.4.3, 4.5:1 for normal
  text) at the shipped 14px / 500-weight, matching the
  `.impeccable.md` accessibility target. This pairing was
  previously 3.51:1 on `#1B986E` (HSL 160 70% 35%) — a documented
  noncompliance that was remediated by darkening the `primary`
  lightness from 35% to 29%, the only load-bearing contrast change
  in the palette. The emerald hue family is unchanged. Dark mode
  (`156 60% 48%` label fill, `160 60% 8%` label ink) already
  measures ~7.57:1 and comfortably clears AAA, so it did not need a
  parallel nudge.

## Typography

One family: **Inter**. Weight and size carry hierarchy; no display serifs,
no secondary sans. Inter is loaded via `next/font` — SSR and first paint
render with the Next.js-generated, metric-compatible fallback font until
Inter finishes loading, so there is no measurable layout shift. The
`--font-sans` token still lists an explicit fallback stack (Inter →
`ui-sans-serif` → `system-ui` → platform sans) as a defense-in-depth
safety net for environments where the `next/font` pipeline is bypassed.

### Scale

- **display-hero (60/60, 700, -0.025em)** — landing page hero only. A
  single line on desktop.
- **display-hero-compact (36/40, 700, -0.025em)** — small-screen hero
  variant; swap to this below `sm` so the hero stays on one line.
- **h1 (30/36, 700, -0.025em)** — page titles inside the app.
- **h2 (20/28, 600, -0.015em)** — section headings inside pages.
- **h3 (16/24, 600)** — card titles, sub-sections.
- **lead (18/28, 400)** — intro paragraphs, hero subtitles. Muted color.
- **body-lg (16/24, 400)** — larger body variant. Reserved for input
  fields on mobile (the 16px floor prevents iOS Safari zoom-on-focus)
  and the occasional lead-adjacent paragraph that wants more air than
  `body` but less than `lead`.
- **body (14/20, 400)** — the workhorse. Most UI copy lives here.
- **body-strong (14/20, 600)** — emphasized body inline.
- **muted (14/20, 400, muted-fg)** — metadata lines: publish date, show
  name, duration.
- **small (12/16, 400)** — chip text, badge text, timestamp tails.
- **label (14/14, 500)** — form labels, tab labels. Tight leading on
  purpose so label + input read as one unit.
- **button-label (14/20, 500)** — interactive button text. Same 14/500
  cut as `label`, but with body leading (20px, = Tailwind `text-sm`) so
  the label sits on the correct visual baseline inside the 36px button
  height. Do not use `label` for buttons — the 14/14 tight leading is
  only right for form labels that pair directly above an input.
- **eyebrow (12/16, 400, uppercase, +0.06em)** — small kickers above
  section headings. Muted color. Use sparingly — more than three per page
  creates noise.
- **mono (13/18)** — API keys, IDs, code samples. System UI monospace
  stack; no custom mono face.

### Rhythm rules

- **Tracking tightens as size grows.** Display text at -0.025em; h2 at
  -0.015em; body at 0. Rationale: Inter's default tracking is optimized
  for body sizes.
- **Weights used: 400, 500, 600, 700.** Never 300 (too thin for paper
  backgrounds at small sizes), never 800/900 (crosses into marketing
  brochure).
- **Line-height collapses for labels, expands for body.** Labels at
  1.0×; body at 1.43×; lead paragraphs at 1.56×. Reading rhythm beats
  vertical economy.

## Layout

- **Base unit: 4px.** All spacing is a multiple. Common scale: 4, 8, 12,
  16, 20, 24, 32, 40, 48, 64.
- **Container max-width: 1200px.** Wider than that and scanning lists
  becomes two-handed.
- **Gutter / page padding: 24px on desktop, 16px on mobile.**
- **Section vertical rhythm: 32px within a page, 48px between major
  sections.**
- **Card padding: 16px compact, 24px default.** Internal card elements
  stack on an 8px gap; related groups tighten to 4px.
- **Grid: 12-column, 24px gutter, collapses to a single column below
  768px.** No asymmetric designer grids; lists stay rectangular so scan
  speed wins.
- **Touch targets: minimum 44×44px *hit area* on mobile.** The visual
  button height stays at 36px (`h-9`) so the chrome does not dominate
  dense desktop layouts; on touch devices the hit area is extended to
  44×44 via wrapper padding (this is what the icon-only button note
  below refers to when it says "pad the wrapper"). The 44px minimum is
  a pointer-coarse floor, not a visual sizing rule — the two
  measurements are intentionally decoupled.

## Elevation & Depth

Shadows are *structural, not decorative*. Four shadow tiers cover the
full surface hierarchy:

- **sm** — subtle bottom hint for hovered rows and the lightest
  structural lift (e.g. inputs and outline buttons). A single 1px/2px
  offset that just defines an edge against paper.
- **DEFAULT** — cards at rest, dropdowns, menus. The standard "popped"
  surface state.
- **md** — modal panels, popovers with meaningful offset.
- **lg** — only for overlay dialogs that eclipse the page chrome.

Rules:
- Cards combine a 1px border with the `DEFAULT` shadow — the border
  draws the edge, the shadow anchors the card against paper. This is
  the one place border + shadow coexist by design.
- Shadows are always grey (black at low opacity), never tinted. Tinted
  shadows push the palette toward "branded gradient kitsch."
- Past the card tier, don't combine border + heavy shadow. Pick one
  per surface tier.
- Dark mode shadow intent: the tier values *should* halve opacity in
  dark mode — forest ink already absorbs depth cues, and
  over-shadowing reads as muddy. **Known gap:** neither the
  frontmatter (`elevation:`) nor the shipped `.dark` block in
  `src/app/globals.css` carries `-dark` shadow overrides today, so
  production currently re-uses the light-mode shadow triplet values
  under dark mode. Remediation when the system is revisited: add
  `-dark` twins to the `elevation` section *and* matching
  `--shadow-*` overrides inside `.dark { … }`, then update this
  rule to describe the shipped behavior.

## Shapes

One base radius: **8px** (`--radius`, exposed as `rounded-lg` in the
Tailwind config). In the shipped system, **sm** and **md** derive
from that base via `calc()`, **lg** is the base radius itself, and
**xl** / **full** are fixed values that stand outside the calc()
chain:

- **sm (4px, derived)** — `calc(var(--radius) - 4px)`. Inline chips,
  tight pills where 8px looks bubbly.
- **md (6px, derived)** — `calc(var(--radius) - 2px)`. Inputs,
  buttons, inner elements of cards.
- **lg (8px, = --radius)** — menus, popovers, sheets.
- **xl (12px, fixed at `0.75rem`)** — cards, feature panels, hero
  modules, the logo tile's outer frame if it is embedded in a larger
  container. Not derived from `--radius` — bumping the base radius
  will not cascade to `xl`.
- **full (9999px, fixed)** — avatars, score badges, status pills,
  star icons.

The Tailwind config (`tailwind.config.ts`) only maps `sm` / `md` /
`lg` to the `--radius` chain; `rounded-xl` resolves to Tailwind's
built-in 0.75rem (which happens to match the `--radius-xl` CSS
variable in `globals.css`), and `rounded-full` uses Tailwind's
built-in 9999px. There is no `rounded-*` utility that maps to the
8px base without an explicit `lg` suffix — the config deliberately
omits a `DEFAULT` key, so the bare `rounded` class falls back to
Tailwind's built-in 4px. Always reach for `rounded-md`,
`rounded-lg`, or `rounded-xl` explicitly; never `rounded` alone.

Rules:
- **Rounded but not bubbly.** Never use `full` rounding on non-pill
  rectangles larger than 32px tall. Large `full`-rounded cards read as
  kids' apps.
- **Consistent corner family.** A card at 8px never nests a component at
  12px — child radii are equal or smaller than parent radii.
- **The logo tile is exactly 7px** on a 32px mark. This is a deliberate
  hair-smaller value than 8px so the amber tile reads as a painted
  sticker rather than a button. It is the only place in the system that
  uses 7px.

## Motion

Motion supports, never blocks. The product is triage-oriented; a 400ms
easing flourish is 400ms of delay between the user and the information.

- **Durations.** 80ms (instant affordances: hover color), 150ms (small
  state changes: press, focus), 200ms (default panel transitions), 300ms
  (modal enter/exit).
- **Easing.** Standard `cubic-bezier(0.2, 0, 0, 1)` for entrances and
  state changes; emphasized `cubic-bezier(0.3, 0, 0, 1)` for modals.
- **No spring.** No bounce. No stagger unless the content is genuinely
  sequential (a list of items animating in beat-by-beat reads as fussy).
- **Skeletons over spinners.** When content is pending, show the shape
  of the content, not a rotating gear.
- **`prefers-reduced-motion` is a hard gate.** When reduced, animation
  and transition durations collapse to **0.01ms** (the standard trick —
  vanishingly short but non-zero so `animationend` / `transitionend`
  events still fire and any state-cleanup listeners wake up), and
  scroll-behavior reverts to auto. Test this path explicitly — a
  feature that only works with animation is broken.

## Components

### Buttons

- **Primary** — emerald fill, near-white label, 36px tall (`h-9`),
  16px horizontal padding, 6px radius (`rounded-md`). Hover: the same
  fill at 90% opacity (`primary/90`) — the darkening comes from
  opacity rather than a second color token.
- **Secondary** — `secondary` fill, foreground label. Same geometry.
  Use when primary is adjacent and would out-shout content.
- **Outline** — `background` fill (not transparent), foreground
  label, 1px `input`-colored border. Same geometry. The opaque fill
  preserves a clean edge when the button sits on a tinted or card
  surface — unlike ghost, which deliberately lets the surround show
  through.
- **Ghost** — transparent, foreground label, hover reveals both
  `accent` fill *and* `accent-foreground` label color. Use inside
  dense toolbars.
- **Destructive** — vermilion fill. Pair with an explicit confirm step
  for irreversible actions.
- **Icon-only** — ghost by default, 36×36 hit area; pad the wrapper
  if the surrounding density requires a 44px touch target.

Never use brand amber as a button fill. Never combine two primaries in
one row — if both feel equal, one of them is mis-labeled.

### Cards

- **Default** — white fill (`card`), 12px radius (`rounded-xl`), 1px
  `border`-colored border, with a default drop shadow at rest. The
  border and shadow are part of every card — there is no "borderless"
  variant. The card root carries no padding of its own; the 24px
  (`p-6`) internal padding is applied by the `card-header`,
  `card-content`, and `card-footer` sub-part tokens, which mirrors
  the shipped Card primitive and lets dense consumers (e.g. the
  episode card) drop the content area to 16px (`p-4`) without
  fighting a padded root.
- **Accent** — same, plus a 2px left border in `primary`
  (`borderLeftWidth: 2px`, `borderLeftColor: primary`) to flag
  "this one has a completed summary." Reserved for that one
  semantic. The left accent stripe sits *on top of* the card's
  structural border and shadow, not instead of them.

Cards have at most one hero element (title, score, image) and metadata
stacks below at `muted-foreground`. The shadow is intentionally subtle —
it provides just enough separation from the paper background to define
the card edge without competing with content.

### Inputs

- 36px tall (`h-9`), 6px radius (`rounded-md`), 1px border using the
  `input` token, **transparent** background (`bg-transparent`) so the
  field inherits its enclosing surface — critical when inputs sit
  inside tinted cards or modals.
- Responsive text sizing: `body-lg` (16px / Tailwind `text-base`) by
  default — the 16px floor prevents iOS Safari zoom-on-focus —
  stepping down to `body` (14px / `text-sm`) above the `md`
  breakpoint. The token frontmatter encodes the base (`body-lg`); the
  breakpoint refinement lives here because the design.md component
  schema has no media-query primitive.
- Focus ring: 1px `ring` color, no offset (`focus-visible:ring-1`).
  Tight and restrained — no halo glow.
- Error state: border shifts to `destructive`; inline message below
  the field uses `destructive` text (i.e. `text-destructive`) at
  `small` size. Never use `destructive-foreground` here — that token
  is the near-white color meant to sit *on* a destructive-filled
  surface, not free-floating on paper.
- Never replace the label with a placeholder. Placeholders disappear on
  focus; labels don't.

### Score badges

- Rounded-full pill, 2×8 padding, small type.
- Fill + foreground paired from one of the five score tiers.
- Inline variants (no fill) use the `-text` token and align to baseline
  with adjacent copy.

### Status pills

- Rounded-full, 2×10 padding, small type.
- Always bg + text from the same status pair. Optional 1px border in the
  matching `-border` when the pill sits on a non-paper surface.

### Logo

- The mark is a **32px amber tile** (radius 7px) containing a
  speech-bubble-with-soundwave glyph in deep ink.
- Three variants ship:
  - **mark** — colored tile, for app chrome and marketing headers.
  - **mark-mono** — single-color glyph tinted by `currentColor` —
    embed inside colored contexts (a white footer, a dark modal) where
    the amber tile would fight the surround.
  - **lockup** — mark + "ContentGenie" wordmark in Inter 700 at
    -0.035em tracking. Wordmark color flips for dark mode.
- Favicon and PWA icons are rasterized from the `mark` SVG — the glyph
  ink color there is **#1A1407**, identical to `brand-foreground`, so
  bitmap icons and the React mark render the same tone.
- **Do not** tint the amber tile, do not round it `full`, do not place a
  shadow under it, do not emboss it.

### Focus

- Keyboard focus is visible on every interactive element.
- 1px `ring`-colored outline, no offset (`focus-visible:ring-1`);
  never removed via `outline: none` without a replacement.
- Focus color is emerald, matching `primary` — the "touch this" color
  doubles as "you are here" signal.

## Do's and Don'ts

**Do**
- Use `primary` (emerald) for every interactive affordance. One color
  for "touch this" makes the product scannable.
- Use `brand` (amber) exactly where it means "this is the product":
  logo, rating stars, maybe one marketing accent per section.
- Let borders and whitespace do the structural work of separating
  surfaces. Cards carry a subtle default shadow; heavier shadows are
  reserved for lifted chrome (menus, modals, dialogs).
- Stay inside the token palette. If a color doesn't exist in the
  frontmatter above, the answer is not "add a new shade of blue."
- Honor `prefers-reduced-motion`. Every transition.
- Treat the Worth-It score ramp as a semantic scale: the color is the
  meaning. Don't substitute a color "because it looks better here."
- Test at dark mode alongside light. The system is system-aware; every
  surface must have a defined dark equivalent.

**Don't**
- Don't use Tailwind's palette literals (`blue-600`, `yellow-400`,
  `zinc-*`, `slate-*`, `emerald-500`, …). They sit outside the token
  system and drift.
- Don't use amber as a CTA. Amber buttons cannibalize the logo.
- Don't use pure `#000` text or pure `#FFF` backgrounds. The system
  lives at `#0D120F` and `#FCFDFC` — the hue whisper is load-bearing.
- Don't introduce a second font family. Inter + system mono is the
  entire typographic inventory.
- Don't use cool red (`#EF4444`, etc.) for destructive. Vermilion is
  warm on purpose.
- Don't add gradients, glows, or decorative illustrations. "Content is
  the decoration."
- Don't use spinners when a skeleton works. Don't animate things that
  delay the user seeing content.
- Don't mix radii across a single composition. A 12px card full of 8px
  inputs is fine; a 12px card with a 20px inner panel is not.
- Don't stack more than two colors per interactive surface. A primary
  button on an accent row on a card is already the ceiling; anything
  more and the hierarchy collapses.
