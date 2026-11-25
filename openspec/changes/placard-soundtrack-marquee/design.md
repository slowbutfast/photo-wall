---
name: Chiaroscuro Gallery — Placard Soundtrack Ticker
colors:
  primary: "inherit"      # Track line inherits the placard material's text colour (unchanged)
  secondary: "inherit"
  background: "transparent"
  surface: "inherit"      # Acrylic / aluminum / foamcore placard surface (unchanged)
  text:
    primary: "inherit"    # .placard-track-name colour per material (aluminum #2a2a2a, etc.)
    muted: "inherit"      # .placard-timecode opacity 0.72 (unchanged)
  border: "inherit"
  status:
    success: "n/a"
    warning: "n/a"
    error: "n/a"
typography:
  fontFamily:
    sans: "var(--font-helvetica) (TeX Gyre Heros), unchanged"
    mono: "n/a"
  scale:
    h1: "n/a"
    h2: "n/a"
    body: "Track line 11.5px / 600 / 1.25 / -0.005em (unchanged)"
    caption: "Timecode 11px / 400 / tabular-nums (unchanged)"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"   # marquee edge fade width and fade-gutter bleed into the placard padding
  lg: "24px"   # existing placard side padding that hosts the fade gutters
  xl: "40px"   # gap between the original and the duplicate copy
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic tone:** quiet museum signage. Motion appears only while music is playing, and only when the text genuinely doesn't fit. It should read as "this is the song playing now," never as decoration.
- **Target surfaces:** the `AlbumPlacard` footer at album and print tier, on `/photos` and in the Studio preview canvas. The macro tier doesn't render placard text.
- **Visual reference:** Spotify mobile's now-playing title. The text rests, glides left at constant speed with a copy trailing after a gap, and loops seamlessly, with soft edges while moving.

## 2. Color System & Contrast Rationale

No new colours. The track line keeps each material's existing colour and its `opacity: 0.92`. The fade is an alpha mask, not a colour, so the contrast of the fully visible glyphs is unchanged from the current, already-accepted placard ratios.

| Token Name | Hex Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text.primary` (aluminum) | `#2a2a2a` | Track line | Brushed aluminum | unchanged | unchanged (existing) |
| `text.primary` (acrylic / foamcore) | existing | Track line | Material surface | unchanged | unchanged (existing) |

## 3. Typography Hierarchy

| Level | Font Family | Size | Weight | Line Height | Intended Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Track line | `--font-helvetica` | `11.5px` | `600` | `1.25` | `Song Title — Artist` (unchanged) |
| Timecode | `--font-helvetica` | `11px` | `400` | `1.25` | `M:SS / M:SS`, tabular (unchanged) |

## 4. Component Anatomy & States

### Component: `PlacardTrackLine` (inside `.placard-soundtrack`)

- **Hierarchy:** `span.placard-track-name` (the box, `title` = full text) › `span.placard-track` (the moving strip, `display: inline-flex`, `gap: 40px`) › `span.placard-track-text` plus, while active only, a second `span.placard-track-text[aria-hidden="true"]`.
- **States:**
  - **Idle, or playing but fits.** Exactly today's look: `nowrap`, `overflow: hidden`, `text-overflow: ellipsis`. There's no mask and no duplicate.
  - **Playing and overflowing (`.is-marquee` on the box):**
    - The ellipsis is off (`text-overflow: clip`).
    - **Fade gutter:** the box bleeds into the placard's 24 px side padding with `margin-inline: -12px; padding-inline: 12px`. The resting first glyph therefore sits at exactly the same x as in the idle state, and the 12 px fades fall inside the padding instead of over the text.
    - **Mask:** `mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)`, plus the `-webkit-` prefixed version.
    - **Motion:** the strip translates via WAAPI (see Motion).
  - **Hover:** unchanged. The placard's own hover lift still applies, and the ticker keeps running.
  - **Focus:** unchanged. The focus ring belongs to the placard `<button>`.
  - **Reduced motion:** always the idle look.
- **Size:** the placard stays a fixed `214×200px`. The box keeps its single-line height, so there's no reflow when the ticker starts or stops.

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Navigation / Sizing Rules |
| :--- | :--- | :--- | :--- |
| Mobile | `< 768px` | Same placard (world-scaled) | Same ticker constants. The px/s speed is in world px, so on-screen speed scales with zoom, like the rest of the placard. |
| Desktop | `≥ 768px` | Same | Same |

## 6. Interaction, Motion & Sound

- **Start:** a hold of `2000ms` from the play click, then the first scroll.
- **Cycle:** `[hold 2000ms] → [linear scroll of (textWidth + 40px) at 30px/s]`, repeated indefinitely. The cycle seam is invisible, because the duplicate ends exactly where the original started.
- **Easing:** `linear` during the scroll, which matches Spotify's constant glide. There's no ease-in or ease-out at the ends, since the hold provides the visual rest.
- **Stop:** snap back to the start position instantly. The ellipsis returns, with no reverse animation.
- **Sound:** none.

## 7. Do's and Don'ts

- **DO** keep every constant in `MARQUEE_CFG` (`placardMarquee.ts`). The CSS gap and fade must read the same values via inline custom properties `--marquee-gap` / `--marquee-fade` set from the config, not separately hardcoded numbers.
- **DO** animate `transform` only, and scope every new rule under `.playground-wall-root`. `cssBoundaryAudit` must stay green, so add no selectors to `hud.css` or `studio.css`.
- **DON'T** add a permanent `will-change` to the track. It's allowed only while `.is-marquee` is set, and only if the trace shows jitter (see PR #9 raster lessons).
- **DON'T** animate idle placards, the Caption, the Metadata line or the timecode, and don't change the placard's dimensions.
- **DON'T** expose the duplicate text to assistive tech, and don't change the placard button's `aria-label`.
