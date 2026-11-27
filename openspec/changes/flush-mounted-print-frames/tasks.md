# Tasks: Flush-Mounted Gallery Print Frames

## Target Context Map

| File (repo-relative) | Target Symbol / Lines | Purpose |
| :--- | :--- | :--- |
| `src/lib/__tests__/touchAudit.test.ts` | `wall.css` audit assertions | Add TDD static CSS assertions verifying flush-mounted `.photo-frame` (`border-right: 2.5px solid #161616`, `border-bottom: 2.5px solid #121212`, zero gray bevels `#d5d1c8`/`#c6c1b7`, `--frame-radius: 0px`) and flat `.photo-window` (`box-shadow: none` on desktop and coarse). |
| `src/styles/wall.css` | `--frame-radius`, `.photo-frame` (`L993-L1034`), `.photo-frame.is-lit*`, `.photo-window` (`L1128-L1141`, coarse `L1257-L1261`) | Replace sloped gray bevel borders with crisp `2.5px` matte-black rigid backing edge (`#161616`/`#121212`), set `--frame-radius: 0px`, set `.photo-window { box-shadow: none }` (desktop & coarse), replace molded top-bevel inset shadow with subtle `0.5px` hairline while keeping directional floating cleat shadows (`--sx`/`--sy`, `--tilt-sx`/`--tilt-sy`), lift, tilt, and `.photo-sheen` intact. |

---

## 1. Test Scaffolding (TDD)

- [x] 1.0 Branch `feat/flush-mounted-print-frames` from `origin/main` (`c626136`).
- [x] 1.1 Add failing flush-frame assertions in `src/lib/__tests__/touchAudit.test.ts` (or a new `src/lib/__tests__/flushFrameAudit.test.ts`): `.photo-frame` uses `2.5px` `#161616`/`#121212` right/bottom backing edge with zero `#d5d1c8`/`#c6c1b7` bevels and `0px` radius, `.photo-window` uses `box-shadow: none` on desktop and coarse, and `.photo-frame.is-lit.focused` preserves `--tilt-sx`/`--tilt-sy`.
- [x] 1.2 Run `npx vitest run src/lib/__tests__/touchAudit.test.ts` (and new audit file if added) and confirm new assertions fail before editing `wall.css`.

## 2. Flush-Mounted Print CSS (`src/styles/wall.css`)

- [x] 2.1 Update `src/styles/wall.css`: set `--frame-radius: 0px`, replace `.photo-frame` sloped gray borders with `border: none; border-right: 2.5px solid #161616; border-bottom: 2.5px solid #121212;`, set `.photo-window { box-shadow: none; }` on both desktop and coarse pointers, and refine `.photo-frame.is-lit` / `:hover` / `.focused` floating cleat shadows (removing bright top-bevel inset highlight while preserving `--sx`/`--sy`, `--tilt-sx`/`--tilt-sy`, lift, tilt, and `.photo-sheen`).
- [x] 2.2 Run `npx vitest run src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts` and confirm 100% pass.

## 3. Verification & Empirical Audit

- [x] 3.1 Run `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` and verify 100% pass.
- [x] 3.2 Run Playwright verification on desktop (`1440×900`) and mobile (`390×844`) across `chiaroscuro`, `concrete`, and `alabaster` confirming computed border/radius/`box-shadow: none` values, preserved hover/focus lift + tilt + `.photo-sheen` + `PrintSharpOverlay` alignment, and coarse `--tilt-sx` shadow shift; inspect screenshots directly.
- [x] 3.3 Record automated + Playwright evidence in `openspec/changes/flush-mounted-print-frames/verification.md`.
