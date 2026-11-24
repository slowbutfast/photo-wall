## Overview
**Status: Non-visual / Backend change.**
No user-facing components, layout, or styling affected.

The webfont files move from `public/fonts/` to `src/app/fonts/` and their `@font-face` `src` paths become relative. Family names, weights, styles, `font-display` and the `--font-family-base` stack stay byte-identical, so rendered typography must not change. The visual check in `tests.md` (placard and HUD text against a pre-change screenshot) guards this.
