## Source material

**Maintainer, 2026-11-28, verbatim:**

> "can you propose a new feature where you can on mobile if you tap the photo, it disables the glare."

**Planning-session proposal (2026-11-28), accepted with "ff the change and write the handoff":**
- Tapping the focused print in Print Focus on a coarse pointer toggles the glare.
- The state lasts for the session.
- Gyro tilt and shadow keep working; only the reflection goes away.
- A short hint confirms each toggle.

### Raised but not acted on

- **Persisting the preference in `localStorage` across reloads.** Deferred: a session-only flag is simpler, and the maintainer can ask for persistence later.
- **A desktop equivalent.** Not requested. On fine pointers the sheen is a mouse-hover affordance that disappears when the pointer leaves, so there's nothing to turn off.
- **Turning off tilt as well.** Not requested. The tilt is part of the "physical print" feel, while the glare is what obscures the photo.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **glare** / **sheen** | The `.photo-sheen` radial-gradient reflection, on the focused frame and on its `.print-sharp-overlay` copy. | The gyro tilt (`rotateX/Y`), the cast shadow (`--tilt-sx/--tilt-sy`), or the paper grain. |
| **glare off** | `useWallStore.glareOff === true`. Both sheens paint no background, so they're fully transparent. | Unsubscribing the gyro, or changing the overlay sync loop. |
| **focused print tap** | A `click` on `.photo-frame.focused` while `tier === 'print'`, on a `(pointer: coarse)` device, and not a drag. | A tap on a neighbour print, which still navigates to that print, or a tap on the wall, which still returns one level. |
| **session** | The page's lifetime. A reload resets `glareOff` to `false`. | A login session or `sessionStorage`. |

## External research

None needed. This is an internal CSS and state toggle.

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| A `data-glare="off"` attribute on `.wall-viewport` plus a coarse-gated `background: none` rule on `.photo-sheen` | **Adopted** | One CSS rule covers the frame sheen and the overlay sheen (both are inside `.wall-viewport`). There are no per-frame writes and no change to the gyro or overlay sync. | 2026-11-28 |
| Stop the gyro callback writing sheen opacity, and set inline `opacity: 0` | Rejected | It touches the per-frame gyro path and the overlay mirror (`PrintSharpOverlay.tsx:169-180`): exactly the code the PR #18 postmortem says to avoid blind edits in. | 2026-11-28 |
| `display: none` on the sheen | Rejected | It removes the element from layout while the overlay's cached `sheenIn` and `sheenOut` refs still point at it, and it can't fade. `background: none` keeps the node and its inline `transform` and `opacity`, and only stops it painting. | 2026-11-28 |
| `--sheen-strength: 0` set on the sheen element | Rejected | It works visually, but `sheenGlareAudit.test.ts` requires exactly one rule in `wall.css` to declare `--sheen-strength`, and that assertion is correct (one source of truth for the strength). Found while writing the audit tests. | 2026-11-28 |

## Patterns adopted

- **Specificity override, not `!important`.** `.playground-wall-root [data-glare='off'] .photo-sheen` has specificity `(0,3,0)` and beats the base `.playground-wall-root .photo-sheen` background at `(0,2,0)`. It leaves the inline `transform` and `opacity` the gyro writes alone, and it adds no second `--sheen-strength` declaration.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| The sheen gradient alpha uses `--sheen-strength` | `wall.css:1170-1171`; declared at `.playground-wall-root` (`wall.css:345`) | Read the source on `5188316` | 2026-11-28 | stable |
| The coarse Album View sheen is already hidden | `wall.css:1207` (`.photo-frame:not(.focused) .photo-sheen { display: none }`) | Read the source | 2026-11-28 | stable |
| The overlay is inside `.wall-viewport` | `GalleryCanvas.tsx:1019-1092` (`PrintSharpOverlay` is a child of the `ref={containerRef}` div) | Read the source | 2026-11-28 | stable |
| The overlay doesn't intercept taps | `.print-sharp-overlay { pointer-events: none }` (`wall.css:1324`) | Read the source | 2026-11-28 | stable |
| Tapping the focused print is currently a no-op re-entry | `FramedPrint.tsx:171-183` calls `onSelectPhoto(albumId, photo.id)` for the already-focused photo | Read the source | 2026-11-28 | stable |
| A re-entry still creates a new `soundtrack` object | `enterPrint` calls `soundtrackReducer(…, focus-print)`, which always returns a new object (`soundtrackState.ts:90-99`) | Read the source | 2026-11-28 | stable |
| The overlay copies only inline `transform` and `opacity` from the frame sheen | `PrintSharpOverlay.tsx:169-180` | Read the source | 2026-11-28 | stable |
| There is no existing toast component | `zoomOutPauseToast` is defined but rendered nowhere | `grep` over `src/components` | 2026-11-28 | stable |

## Unverified assumptions

- **WebKit repaints the sheen when an ancestor attribute flips a custom property used inside `radial-gradient`, with no compositing artefacts on the overlay.** Checking needs a real iPhone (PR #18 postmortem). Chromium emulation only proves the computed style.

## Superseded claims

None.

## Links out

- `openspec/specs/instanced-photo-renderer/spec.md`:
  - "Coarse-pointer gyroscope rotational glare…";
  - "Glare intensity is reduced to 80%…";
  - "Coarse-pointer glare rests in the top-right corner…".
- The postmortem at the `archive/mobile-print-transitions` tag: `openspec/changes/mobile-print-transitions/postmortem.md`.
